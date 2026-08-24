// MindBall - управление шариком по данным нейрогарнитуры NeuroSky MindWave.
// Источник данных: COM-порт гарнитуры напрямую, через com-reader.ps1.
// ThinkGear Connector не используется и должен быть закрыт - он занимает порт.
// Отдаёт страницу на http://127.0.0.1:8080 и поток событий на /stream.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
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

function startReader() {
  reader = spawn('powershell.exe', [
    '-ExecutionPolicy', 'Bypass', '-NoProfile',
    '-File', path.join(DIR, 'com-reader.ps1'),
    '-Port', COM_PORT,
  ], { windowsHide: true });

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
      if (o.info) {
        state.link = o.info;
        state.portBusy = false;
        log(state.link);
        broadcast();
        continue;
      }

      state.packets++;
      state.updated = Date.now();
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
    state.link = `чтение порта ${COM_PORT} прервано (код ${code}), повтор через 3 с`;
    log(state.link);
    broadcast();
    setTimeout(startReader, 3000);
  });
}

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

process.on('SIGINT', () => { if (reader) reader.kill(); process.exit(0); });
