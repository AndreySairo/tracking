// MindBall - управление шариком по данным нейрогарнитуры NeuroSky MindWave.
// Источник данных: COM-порт гарнитуры напрямую, через com-reader.ps1.
// ThinkGear Connector не используется и должен быть закрыт - он занимает порт.
// Отдаёт страницу на http://127.0.0.1:8080 и поток событий на /stream.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const HTTP_PORT = 8080;
const COM_PORT = process.argv[2] || 'auto';

const state = {
  link: 'порт ещё не открыт',
  portBusy: false,
  poorSignal: 200,      // 0 - идеальный контакт, 200 - датчик не на голове
  attention: 0,
  meditation: 0,
  blink: 0,
  bands: null,          // восемь диапазонов ЭЭГ: дельта, тета, альфа x2, бета x2, гамма x2
  packets: 0,
  warmup: true,         // первые ~10 с гарнитура не выдаёт показатели
  stale: false,         // данные перестали приходить: связь потеряна
  quality: null,        // качество радиоканала, % от исправного потока
  updated: 0,
};

const clients = new Set();

function broadcast() {
  const payload = `data: ${JSON.stringify(state)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { clients.delete(res); }
  }
}

function log(msg) {
  console.log(`[${new Date().toTimeString().slice(0, 8)}] ${msg}`);
}

// --- приём данных с гарнитуры ----------------------------------------------

let reader = null;

// Снимаем читалки, оставшиеся от прошлых запусков: они держат COM-порт
// и новая читалка его не получит. Осиротевшие процессы переживают падение сервера.
function killStrayReaders() {
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | " +
      "Where-Object { $_.CommandLine -like '*com-reader.ps1*' -and $_.ProcessId -ne $PID } | " +
      "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
    ], { timeout: 10000, stdio: 'ignore' });
  } catch { /* нечего снимать или снять не удалось - не мешает работе */ }
}

let starting = false;

function startReader() {
  if (starting) return;             // защита от параллельных запусков
  starting = true;
  killStrayReaders();
  reader = spawn('powershell.exe', [
    '-ExecutionPolicy', 'Bypass', '-NoProfile',
    '-File', path.join(DIR, 'com-reader.ps1'),
    '-Port', COM_PORT,
  ], { windowsHide: true });
  starting = false;

  let buf = '';
  reader.stdout.setEncoding('utf8');
  reader.stdout.on('data', (chunk) => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const s = line.trim();
      if (!s) continue;
      let o;
      try { o = JSON.parse(s); } catch { continue; }

      if (o.error) {
        state.link = o.error;
        state.portBusy = /дост|занят|denied/i.test(o.error);
        log(state.link);
        broadcast();
        continue;
      }
      if (typeof o.quality === 'number') {
        state.quality = o.quality;
        state.updated = Date.now();
        state.stale = false;
        broadcast();
        continue;
      }
      if (o.info) {
        state.link = o.info;
        state.portBusy = false;
        log(state.link);
        broadcast();
        continue;
      }

      state.packets++;
      state.updated = Date.now();
      state.stale = false;
      if (typeof o.poorSignal === 'number') state.poorSignal = o.poorSignal;
      if (typeof o.attention === 'number') state.attention = o.attention;
      if (typeof o.meditation === 'number') state.meditation = o.meditation;
      if (Array.isArray(o.bands)) state.bands = o.bands;
      if (typeof o.blink === 'number') {
        state.blink = o.blink;
        setTimeout(() => { state.blink = 0; }, 250);
      }
      // гарнитура выдаёт показатели не сразу: пока они нулевые, идёт разогрев
      if (state.attention > 0 || state.meditation > 0) state.warmup = false;
      broadcast();
    }
  });

  reader.stderr.setEncoding('utf8');
  reader.stderr.on('data', (d) => log(`чтение порта: ${d.trim()}`));

  reader.on('exit', (code) => {
    state.link = `чтение порта прервано (код ${code}), переподключение через 3 с`;
    state.stale = true;
    log(state.link);
    broadcast();
    setTimeout(startReader, 3000);
  });
}

// Сторож: если данные перестали приходить, читалку перезапускаем.
// Молчащий порт не даёт ошибки, поэтому единственный признак - возраст последнего пакета.
const STALE_AFTER = 8000;

setInterval(() => {
  if (!state.updated) return;
  const age = Date.now() - state.updated;
  if (age > STALE_AFTER && !state.stale) {
    state.stale = true;
    state.link = `данные прекратились ${Math.round(age / 1000)} с назад, переподключаюсь`;
    log(state.link);
    broadcast();
    if (reader) reader.kill();      // обработчик exit поднимет чтение заново
  }
}, 2000);

// --- отдача страницы и потока ----------------------------------------------

// --- запись сеанса в файл ---------------------------------------------------

let recording = null;   // { rows, until, name }

function startRecording(seconds, label) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(DIR, 'records');
  fs.mkdirSync(dir, { recursive: true });
  recording = {
    file: path.join(dir, `${stamp}_${label}.csv`),
    rows: ['секунда;метка;сосредоточение;расслабление;контакт;дельта;тета;альфа_н;альфа_в;бета_н;бета_в;гамма_н;гамма_в'],
    started: Date.now(),
    until: Date.now() + seconds * 1000,
    label,
  };
  log(`запись сеанса на ${seconds} с: ${path.basename(recording.file)}`);
}

function recordTick() {
  if (!recording) return;
  const t = Math.round((Date.now() - recording.started) / 1000);
  const b = state.bands || [0, 0, 0, 0, 0, 0, 0, 0];
  recording.rows.push(
    [t, recording.label, state.attention, state.meditation, state.poorSignal, ...b].join(';')
  );
  if (Date.now() >= recording.until) {
    fs.writeFileSync(recording.file, recording.rows.join('\r\n'), 'utf8');
    log(`запись сохранена: ${recording.file} (${recording.rows.length - 1} строк)`);
    recording = null;
  }
}
setInterval(recordTick, 1000);

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/record')) {
    const u = new URL(req.url, 'http://127.0.0.1');
    const sec = Math.min(300, Math.max(10, Number(u.searchParams.get('sec')) || 60));
    const label = (u.searchParams.get('label') || 'сеанс').replace(/[^\wа-яА-ЯёЁ-]/g, '');
    startRecording(sec, label);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, seconds: sec }));
    return;
  }
  if (req.url === '/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify(state)}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  const html = fs.readFileSync(path.join(DIR, 'index.html'));
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(HTTP_PORT, '127.0.0.1', () => {
  log(`страница готова: http://127.0.0.1:${HTTP_PORT}`);
  log(`источник данных: COM-порт (${COM_PORT}), напрямую, без ThinkGear Connector`);
  startReader();
});

function shutdown() {
  if (reader) reader.kill();
  killStrayReaders();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
