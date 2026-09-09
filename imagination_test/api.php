<?php
/**
 * Хранение журнала теста в файле data/journal.json.
 *
 * GET  — вернуть журнал (или null, если файла ещё нет).
 * POST — записать журнал целиком. Перед записью прежнее состояние
 *        откладывается в data/backup/journal-ГГГГ-ММ-ДД.json (один снимок в день).
 *
 * Запись атомарная: сначала во временный файл, потом переименование,
 * чтобы обрыв не оставил половину журнала.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$dir  = __DIR__ . '/data';
$file = $dir . '/journal.json';

if (!is_dir($dir) && !@mkdir($dir, 0777, true) && !is_dir($dir)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'не удалось создать папку data'], JSON_UNESCAPED_UNICODE);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    if (!is_file($file)) {
        echo json_encode(['ok' => true, 'journal' => null, 'file' => 'data/journal.json'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
    // разбор без ассоциативных массивов: иначе пустой объект {} превратится в [] и
    // счётчики серий, лежащие в streak, при обратной записи из браузера потеряются
    $journal = json_decode((string)file_get_contents($file));
    echo json_encode([
        'ok'      => true,
        'journal' => is_object($journal) ? $journal : null,
        'file'    => 'data/journal.json',
        'saved'   => date('Y-m-d H:i', (int)filemtime($file)),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($method === 'POST') {
    $journal = json_decode((string)file_get_contents('php://input'));
    if (!is_object($journal) || !isset($journal->tasks)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'журнал не разобран'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (is_file($file)) {
        $bdir = $dir . '/backup';
        if (is_dir($bdir) || @mkdir($bdir, 0777, true)) {
            $snap = $bdir . '/journal-' . date('Y-m-d', (int)filemtime($file)) . '.json';
            if (!is_file($snap)) {
                @copy($file, $snap);
            }
        }
    }

    $tmp = $file . '.tmp';
    $out = json_encode($journal, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($out === false || file_put_contents($tmp, $out) === false || !rename($tmp, $file)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'не удалось записать файл'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode(['ok' => true, 'saved' => date('Y-m-d H:i')], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'error' => 'метод не поддерживается'], JSON_UNESCAPED_UNICODE);
