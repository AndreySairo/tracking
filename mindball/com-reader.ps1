# Чтение гарнитуры NeuroSky напрямую с COM-порта, без ThinkGear Connector.
# Разбирает протокол ThinkGear и печатает по строке JSON на каждый разобранный пакет.

param([string]$Port = 'auto', [int]$Baud = 57600)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$out = [Console]::Out

function Emit($obj) {
    $out.WriteLine(($obj | ConvertTo-Json -Compress))
    $out.Flush()
}

# Поиск порта гарнитуры: открываем каждый COM по очереди и слушаем секунду.
# Признак гарнитуры - синхропары 0xAA 0xAA в начале пакетов протокола ThinkGear.
function Find-HeadsetPort($baud) {
    $names = [System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object
    Emit @{ info = "поиск гарнитуры среди портов: $($names -join ', ')" }
    foreach ($name in $names) {
        $probe = $null
        try {
            $probe = New-Object System.IO.Ports.SerialPort($name, $baud, 'None', 8, 'One')
            $probe.ReadTimeout = 300
            $probe.Open()
            Start-Sleep -Milliseconds 1500
            $n = $probe.BytesToRead
            if ($n -gt 8) {
                $b = New-Object byte[] $n
                [void]$probe.Read($b, 0, $n)
                for ($i = 0; $i -lt $n - 1; $i++) {
                    if ($b[$i] -eq 0xAA -and $b[$i + 1] -eq 0xAA) {
                        $probe.Close()
                        return $name
                    }
                }
            }
        } catch {
            # порт занят другой программой или не открывается - пропускаем
        } finally {
            if ($probe -and $probe.IsOpen) { $probe.Close() }
        }
    }
    return $null
}

if ($Port -eq 'auto') {
    $found = Find-HeadsetPort $Baud
    if (-not $found) {
        Emit @{ error = 'гарнитура не найдена ни на одном COM-порту: включите её, проверьте сопряжение по Bluetooth и закройте ThinkGear Connector' }
        exit 1
    }
    $Port = $found
    Emit @{ info = "гарнитура найдена на порту $Port" }
}

$sp = New-Object System.IO.Ports.SerialPort($Port, $Baud, 'None', 8, 'One')
$sp.ReadTimeout = 500
try {
    $sp.Open()
} catch {
    Emit @{ error = "порт $Port недоступен: $($_.Exception.Message)" }
    exit 1
}
Emit @{ info = "порт $Port открыт на скорости $Baud" }

$buf = New-Object System.Collections.Generic.List[byte]

# Сторож простоя. Разрыв связи с гарнитурой не закрывает COM-порт и не даёт ошибки:
# порт просто перестаёт отдавать байты. Без этой проверки чтение висит вечно.
$idleLimit = 8
$lastByteAt = Get-Date

try {
    while ($true) {
        $n = $sp.BytesToRead
        if ($n -le 0) {
            if (((Get-Date) - $lastByteAt).TotalSeconds -ge $idleLimit) {
                Emit @{ error = "данные с порта $Port прекратились: связь с гарнитурой потеряна" }
                exit 2
            }
            Start-Sleep -Milliseconds 20
            continue
        }
        $lastByteAt = Get-Date

        $tmp = New-Object byte[] $n
        [void]$sp.Read($tmp, 0, $n)
        $buf.AddRange($tmp)

        # выбираем из буфера все целые пакеты: AA AA <длина> <тело> <контрольная сумма>
        while ($buf.Count -ge 4) {
            if (-not ($buf[0] -eq 0xAA -and $buf[1] -eq 0xAA)) { $buf.RemoveAt(0); continue }

            $len = $buf[2]
            if ($len -gt 169) { $buf.RemoveRange(0, 3); continue }
            if ($buf.Count -lt 3 + $len + 1) { break }

            $payload = $buf.GetRange(3, $len)
            $chk = $buf[3 + $len]
            $buf.RemoveRange(0, 3 + $len + 1)

            $sum = 0
            foreach ($b in $payload) { $sum += $b }
            if (((-bnot ($sum -band 0xFF)) -band 0xFF) -ne $chk) { continue }

            # разбор тела пакета: коды до 0x80 несут один байт, от 0x80 - блок с длиной
            $msg = @{}
            $i = 0
            while ($i -lt $payload.Count) {
                $code = $payload[$i]; $i++
                if ($code -ge 0x80) {
                    if ($i -ge $payload.Count) { break }
                    $vlen = $payload[$i]; $i++
                    if ($i + $vlen -gt $payload.Count) { break }
                    if ($code -eq 0x83 -and $vlen -eq 24) {
                        # восемь диапазонов ЭЭГ, каждый - три байта старшим вперёд
                        $bands = @()
                        for ($k = 0; $k -lt 24; $k += 3) {
                            $bands += ([int]$payload[$i + $k] -shl 16) -bor ([int]$payload[$i + $k + 1] -shl 8) -bor [int]$payload[$i + $k + 2]
                        }
                        $msg.bands = $bands
                    }
                    $i += $vlen
                } else {
                    if ($i -ge $payload.Count) { break }
                    $v = [int]$payload[$i]; $i++
                    switch ($code) {
                        0x02 { $msg.poorSignal = $v }
                        0x04 { $msg.attention  = $v }
                        0x05 { $msg.meditation = $v }
                        0x16 { $msg.blink      = $v }
                    }
                }
            }

            if ($msg.Count -gt 0) { Emit $msg }
        }
    }
} finally {
    if ($sp.IsOpen) { $sp.Close() }
}
