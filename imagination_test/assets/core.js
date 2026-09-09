/* Тест воображения — общее ядро: реестр задач, журнал, ступени, 3D-помощники */
(function (global) {
'use strict';

var KEY = 'imagination_test_v1';

/* Основной блок: 12 задач, суммарный вес 100 баллов */
var TASKS = [
 {id:'matrix',  n:'Матрица букв',              w:10,  g:'Ёмкость',      auto:1, p:'tasks/matrix.html',
  d:'Матрица случайных букв, просмотр 15 секунд, чтение в четырёх произвольных порядках.',
  r:['3×3','4×4','5×5','6×6','7×7']},
 {id:'hold',    n:'Удержание образа',          w:8,  g:'Устойчивость', auto:1, p:'tasks/hold.html',
  d:'Поле со случайно закрашенными клетками, просмотр 15 секунд, затем пауза 15 секунд, и только после неё опрос по координатам.',
  r:['5×5','6×6','7×7','8×8','10×10']},
 {id:'xo',      n:'Крестики-нолики вслепую',   w:5,  g:'Ёмкость',      auto:1, p:'tasks/xo.html',
  d:'Партия без доски против случайных ходов, затем воспроизведение всех клеток.',
  r:['3×3, три в ряд','4×4, четыре в ряд','5×5, четыре в ряд']},
 {id:'checkers',n:'Шашки вслепую',             w:8,  g:'Ёмкость',      auto:0, p:'tasks/manual.html#checkers',
  d:'Русские шашки без доски.',
  r:['партия против слабого бота без единого незаконного хода']},
 {id:'chess',   n:'Шахматы вслепую',           w:10, g:'Ёмкость',      auto:0, p:'tasks/manual.html#chess',
  d:'Партия без доски.',
  r:['позиция из 8 фигур: осмотр 30 секунд и точное воспроизведение','20 ходов без единого незаконного хода','партия против Stockfish уровня 1 без зевков материала в один ход']},
 {id:'mate',    n:'Мат вслепую',               w:6,  g:'Устойчивость', auto:0, p:'tasks/manual.html#mate',
  d:'Случайная законная позиция «король и материал против голого короля», игра вслепую до мата.',
  r:['ферзём','двумя слонами','слоном и конём']},
 {id:'hanzi',   n:'Иероглиф за 5 секунд',      w:7,  g:'Точность',     auto:1, p:'tasks/hanzi.html',
  d:'Незнакомый знак на 5 секунд, затем зарисовка по памяти и сверка с оригиналом.',
  r:['6 черт','9 черт','12 черт','16 черт','20 черт и более']},
 {id:'color',   n:'Цвет по памяти',            w:6,  g:'Точность',     auto:1, p:'tasks/color.html',
  d:'Случайный цвет на 5 секунд, 60 секунд удержания, затем подбор в палитре. Расхождение по CIEDE2000.',
  r:['ΔE ≤ 20','ΔE ≤ 12','ΔE ≤ 8','ΔE ≤ 5','ΔE ≤ 3']},
 {id:'polycube',n:'Вращение поликуба',         w:9,  g:'Преобразование',auto:1,p:'tasks/polycube.html',
  d:'Объёмная фигура из кубиков, просмотр 20 секунд, затем три ортогональные проекции по памяти.',
  r:['4 кубика','5 кубиков','6 кубиков','8 кубиков','10 кубиков']},
 {id:'section', n:'Сечение тела',              w:12,  g:'Преобразование',auto:1,p:'tasks/section.html',
  d:'Случайное выпуклое тело рассекается плоскостью через три точки на рёбрах. Требуется число вершин сечения и его форма.',
  r:['куб: число вершин','параллелепипед: вершины и форма','случайное тело, 6–7 вершин','случайное тело, 8–10 вершин','случайное тело, 12–16 вершин']},
 {id:'billiard',n:'Мысленный бильярд',         w:7,  g:'Движение',     auto:1, p:'tasks/billiard.html',
  d:'Точка N-го касания борта. Погрешность считается в долях большей стороны стола.',
  r:['2-е касание','3-е касание','4-е касание','6-е касание','8-е касание']},
 {id:'rubik',   n:'Кубик Рубика вслепую',      w:12,  g:'Движение',     auto:0, p:'tasks/manual.html#rubik',
  d:'Только зрительное отслеживание наклеек. Буквенные пары и словесные схемы запрещены, время не ограничено.',
  pts:[1.5, 3, 5, 8, 12],
  r:['белый крест','одна грань одного цвета','слой: грань с правильной боковой коркой','два слоя','весь куб 3×3']}
];

/* Смежный блок: считается отдельно, в 100 баллов не входит */
var EXTRA = [
 {id:'mult', n:'Умножение в уме', w:8, g:'Смежное', auto:1, p:'tasks/mult.html',
  d:'Случайные числа прописью, ответ на время. Измеряет удержание символов, а не чёткость картинки.',
  r:['два двузначных за 3 минуты','два двузначных за 1 минуту','два двузначных за 30 секунд','два трёхзначных без ограничения времени','два трёхзначных за 3 минуты']}
];

var SCALE = [
 [0,19,'образ возникает, но не удерживается: распадается за секунды, читается только в порядке заучивания'],
 [20,39,'образ держится, пока к нему не применяют преобразование; целостность частичная'],
 [40,59,'устойчивое произвольное оперирование: картинка выдерживает произвольный порядок чтения'],
 [60,74,'редкий уровень: образ ведёт себя как объект, а не как воспоминание об объекте'],
 [75,89,'уровень профессионалов слепой игры и мысленного конструирования'],
 [90,99,'практически не встречается'],
 [100,100,'предел: одновременный максимум по всем двенадцати лестницам']
];

/* ---------- хранение журнала ----------
   Основное место — файл data/journal.json, запись через api.php.
   Хранилище браузера остаётся зеркалом: если сервер не запущен либо страница
   открыта прямо с диска, журнал живёт в нём, и ничего не ломается. */

var LS = (function () { try { localStorage.setItem('__it','1'); localStorage.removeItem('__it'); return true; } catch (e) { return false; } })();
var API = (function () {
  var sc = document.currentScript;
  if (!sc || !sc.src) return null;
  return sc.src.replace(/assets\/core\.js.*$/, '') + 'api.php';
})();

var MODE = 'local';        /* 'file' — журнал пишется в data/journal.json */
var FILE = '';             /* путь к файлу, как его назвал сервер */
var SAVED = '';            /* время последней записи в файл */
var STATE = null;
var BOOTED = false, QUEUE = [];

function blank() { return { v:1, tasks:{}, runs:[] }; }

/* приводим журнал в порядок: пустой объект мог вернуться из файла массивом,
   а испорченную запись лучше подправить, чем потерять весь журнал */
function repair(j) {
  if (!j || typeof j !== 'object' || !j.tasks) return blank();
  Object.keys(j.tasks).forEach(function (k) {
    var t = j.tasks[k];
    if (!t || typeof t !== 'object') { delete j.tasks[k]; return; }
    if (!t.streak || Array.isArray(t.streak)) t.streak = {};
    if (!Array.isArray(t.log)) t.log = [];
    if (typeof t.rung !== 'number') t.rung = 0;
    if (typeof t.factor !== 'number') t.factor = 1;
  });
  if (!Array.isArray(j.runs)) j.runs = [];
  return j;
}

function fromLocal() {
  try { var raw = localStorage.getItem(KEY); return raw ? repair(JSON.parse(raw)) : blank(); }
  catch (e) { return blank(); }
}

function load() { if (!STATE) STATE = fromLocal(); return STATE; }

/* очередь записи: один запрос за раз, следующий уходит с самым свежим состоянием */
var sending = false, pending = null;
function push() {
  if (sending || !pending) return;
  var body = JSON.stringify(pending);
  pending = null;
  sending = true;
  fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
    .then(function (r) { return r.json(); })
    .then(function (d) { if (d && d.saved) SAVED = d.saved; })
    .catch(function () { MODE = 'local'; })
    .then(function () { sending = false; push(); });
}

function save(s) {
  STATE = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  if (MODE === 'file') { pending = s; push(); }
}

function finish() { BOOTED = true; QUEUE.forEach(function (f) { f(); }); QUEUE = []; }

/* Страницы запускаются через IT.ready: к этому времени журнал уже прочитан из файла. */
function ready(fn) { if (BOOTED) fn(); else QUEUE.push(fn); }

(function boot() {
  STATE = fromLocal();
  if (!API || location.protocol === 'file:') { finish(); return; }
  fetch(API, { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (d && d.ok) {
        MODE = 'file';
        FILE = d.file || 'data/journal.json';
        SAVED = d.saved || '';
        if (d.journal && d.journal.tasks) STATE = repair(d.journal);
        else save(STATE);           /* файла ещё нет — переносим то, что накопилось в браузере */
      }
      finish();
    })
    .catch(function () { finish(); });
})();
function all() { return TASKS.concat(EXTRA); }
function task(id) { var a = all(); for (var i=0;i<a.length;i++) if (a[i].id===id) return a[i]; return null; }
function rec(s, id) { if (!s.tasks[id]) s.tasks[id] = { rung:0, factor:1, streak:{}, log:[] }; return s.tasks[id]; }
function get(id) { return rec(load(), id); }

/* Попытка. Ступень засчитывается только тремя успехами подряд на новых экземплярах. */
function attempt(id, rung, ok, factor, detail) {
  var s = load(), t = rec(s, id), k = 'r' + rung;
  if (factor == null) factor = 1;
  t.log.unshift({ t: Date.now(), rung: rung, ok: !!ok, factor: factor, detail: detail || '' });
  t.log = t.log.slice(0, 80);
  var confirmed = false;
  if (ok) {
    t.streak[k] = (t.streak[k] || 0) + 1;
    if (t.streak[k] >= 3) {
      var last3 = t.log.filter(function (e) { return e.rung === rung && e.ok; }).slice(0, 3);
      var f = Math.min.apply(null, last3.map(function (e) { return e.factor; }));
      if (rung > t.rung || (rung === t.rung && f > (t.factor || 1))) { t.rung = rung; t.factor = f; }
      t.streak[k] = 0;
      confirmed = true;
    }
  } else { t.streak[k] = 0; }
  save(s);
  return { rec: t, confirmed: confirmed, streak: t.streak[k] || 0 };
}

/* Балл ступени: по умолчанию вес делится поровну между ступенями,
   но задача может задать свою нелинейную шкалу полем pts. */
function points(T, t) {
  var r = Math.min(t.rung, T.r.length);
  var base = T.pts ? (r ? T.pts[r - 1] : 0) : T.w * (r / T.r.length);
  return base * (t.factor || 1);
}
function totals() {
  var s = load(), core = 0, extra = 0;
  TASKS.forEach(function (T) { core += points(T, rec(s, T.id)); });
  EXTRA.forEach(function (T) { extra += points(T, rec(s, T.id)); });
  return { core: core, extra: extra };
}
function verdict(v) {
  for (var i=0;i<SCALE.length;i++) if (v >= SCALE[i][0] && v <= SCALE[i][1]) return SCALE[i][2];
  return '';
}

/* ---------- разметка страниц задач ---------- */

function header(id) {
  var T = task(id), t = get(id), h = '';
  h += '<div class="topbar"><a href="../index.html">← Журнал</a><span>Вес задачи: ' + T.w + ' б.</span></div>';
  h += '<h1>' + T.n + '</h1><p class="dim">' + T.d + '</p>';
  h += '<div class="ladder">';
  for (var i=0;i<T.r.length;i++) {
    var n = i+1, cls = n <= t.rung ? 'done' : (n === t.rung+1 ? 'next' : '');
    var st = t.streak['r'+n] || 0;
    h += '<div class="rung ' + cls + '"><b>' + n + '</b> ' + T.r[i] + (st ? ' <i>серия ' + st + '/3</i>' : '') + '</div>';
  }
  h += '</div>';
  h += '<p class="hint">Взята ступень ' + t.rung + ' из ' + T.r.length + '. Баллы: ' + points(T,t).toFixed(2) + ' из ' + T.w + '. Ступень засчитывается тремя успехами подряд.</p>';
  return h;
}

function rungSelect(id, elId) {
  var T = task(id), t = get(id), h = '<select id="' + elId + '">';
  for (var i=0;i<T.r.length;i++) {
    var n = i+1;
    h += '<option value="' + n + '"' + (n === Math.min(t.rung+1, T.r.length) ? ' selected' : '') + '>Ступень ' + n + ' — ' + T.r[i] + '</option>';
  }
  return h + '</select>';
}

function report(id, rung, ok, factor, detail) {
  var res = attempt(id, rung, ok, factor, detail);
  var T = task(id);
  var h = '<div class="panel">';
  h += ok ? '<h3 class="ok">Успех</h3>' : '<h3 class="bad">Неудача</h3>';
  if (detail) h += '<p>' + detail + '</p>';
  if (factor != null && factor !== 1 && ok) h += '<p>Множитель за погрешность: ' + factor + '</p>';
  if (res.confirmed) h += '<p class="ok">Ступень ' + rung + ' взята: три успеха подряд. Текущая ступень — ' + res.rec.rung + ' из ' + T.r.length + '.</p>';
  else if (ok) h += '<p>Серия на ступени ' + rung + ': ' + res.streak + ' из 3.</p>';
  else h += '<p>Серия на ступени ' + rung + ' обнулена.</p>';
  h += '<div class="row"><button class="primary" onclick="location.reload()">Ещё попытка</button><a href="../index.html"><button>В журнал</button></a></div>';
  return h + '</div>';
}

function warnBox() {
  if (MODE === 'file' || LS) return '';
  return '<div class="warnbox">Журнал негде хранить: файл недоступен, а браузер запретил локальное хранилище для страниц с диска. Запустите Apache в панели управления XAMPP и откройте страницу по адресу http://localhost/php_projects/imagination_test/ — тогда результаты будут писаться в data/journal.json.</div>';
}

/* строка о месте хранения журнала, выводится на главной */
function storageNote() {
  if (MODE === 'file') {
    return '<p class="hint">Журнал пишется в файл <b>' + FILE + '</b>' + (SAVED ? ', последняя запись ' + SAVED : '') +
           '. Ежедневный снимок прежнего состояния кладётся в data/backup.</p>';
  }
  return '<div class="warnbox">Журнал сейчас хранится только в этом браузере и пропадёт при очистке данных сайта. Чтобы писать его в файл data/journal.json, запустите Apache в панели управления XAMPP и откройте страницу по адресу <b>http://localhost/php_projects/imagination_test/</b>.</div>';
}

/* ---------- вспомогательное ---------- */

function rnd(n) { return Math.floor(Math.random() * n); }
function shuffle(a) { for (var i=a.length-1;i>0;i--) { var j=rnd(i+1), t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
function fmt(t) { var m = Math.floor(t/60), s = t % 60; return m + ':' + (s<10?'0':'') + s; }

function countdown(el, sec, done) {
  var left = sec;
  el.textContent = fmt(left);
  var iv = setInterval(function () {
    left--;
    el.textContent = fmt(left);
    if (left <= 0) { clearInterval(iv); done(); }
  }, 1000);
  return function () { clearInterval(iv); };
}

/* Показ с обратным отсчётом, который можно завершить досрочно.
   Возвращает функцию «дальше»: она срабатывает один раз, кто бы её ни вызвал — кнопка или таймер. */
function phase(el, sec, done) {
  var fired = false, cancel = null;
  function fire() {
    if (fired) return;
    fired = true;
    if (cancel) cancel();
    done();
  }
  cancel = countdown(el, sec, fire);
  return fire;
}

/* ---------- цвет: sRGB → Lab → CIEDE2000 ---------- */

function rgb2lab(r, g, b) {
  function f(v) { v /= 255; return v <= 0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }
  var R=f(r), G=f(g), B=f(b);
  var X=(R*0.4124564+G*0.3575761+B*0.1804375)/0.95047;
  var Y=(R*0.2126729+G*0.7151522+B*0.0721750);
  var Z=(R*0.0193339+G*0.1191920+B*0.9503041)/1.08883;
  function h(t) { return t > 0.008856 ? Math.pow(t, 1/3) : (7.787*t + 16/116); }
  var fx=h(X), fy=h(Y), fz=h(Z);
  return [116*fy-16, 500*(fx-fy), 200*(fy-fz)];
}

function deltaE00(l1, l2) {
  var rad = Math.PI/180, deg = 180/Math.PI;
  var L1=l1[0], a1=l1[1], b1=l1[2], L2=l2[0], a2=l2[1], b2=l2[2];
  var C1=Math.sqrt(a1*a1+b1*b1), C2=Math.sqrt(a2*a2+b2*b2), Cb=(C1+C2)/2;
  var Cb7=Math.pow(Cb,7);
  var G=0.5*(1-Math.sqrt(Cb7/(Cb7+Math.pow(25,7))));
  var a1p=(1+G)*a1, a2p=(1+G)*a2;
  var C1p=Math.sqrt(a1p*a1p+b1*b1), C2p=Math.sqrt(a2p*a2p+b2*b2);
  function hue(b, ap) { if (b===0 && ap===0) return 0; var h=Math.atan2(b, ap)*deg; return h < 0 ? h+360 : h; }
  var h1p=hue(b1,a1p), h2p=hue(b2,a2p);
  var dLp=L2-L1, dCp=C2p-C1p, dhp;
  if (C1p*C2p === 0) dhp = 0;
  else { dhp = h2p-h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  var dHp = 2*Math.sqrt(C1p*C2p)*Math.sin(dhp*rad/2);
  var Lbp=(L1+L2)/2, Cbp=(C1p+C2p)/2, hbp;
  if (C1p*C2p === 0) hbp = h1p+h2p;
  else { var d=Math.abs(h1p-h2p);
    if (d <= 180) hbp=(h1p+h2p)/2;
    else hbp = (h1p+h2p) < 360 ? (h1p+h2p+360)/2 : (h1p+h2p-360)/2; }
  var T = 1 - 0.17*Math.cos((hbp-30)*rad) + 0.24*Math.cos(2*hbp*rad)
            + 0.32*Math.cos((3*hbp+6)*rad) - 0.20*Math.cos((4*hbp-63)*rad);
  var dTh = 30*Math.exp(-Math.pow((hbp-275)/25, 2));
  var Cbp7 = Math.pow(Cbp,7);
  var Rc = 2*Math.sqrt(Cbp7/(Cbp7+Math.pow(25,7)));
  var Sl = 1 + (0.015*Math.pow(Lbp-50,2))/Math.sqrt(20+Math.pow(Lbp-50,2));
  var Sc = 1 + 0.045*Cbp;
  var Sh = 1 + 0.015*Cbp*T;
  var Rt = -Math.sin(2*dTh*rad)*Rc;
  var tl=dLp/Sl, tc=dCp/Sc, th=dHp/Sh;
  return Math.sqrt(tl*tl + tc*tc + th*th + Rt*tc*th);
}

function hsl2rgb(h, s, l) {
  s/=100; l/=100;
  var c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h/60)%2-1)), m=l-c/2, r,g,b;
  if (h<60){r=c;g=x;b=0;} else if(h<120){r=x;g=c;b=0;} else if(h<180){r=0;g=c;b=x;}
  else if(h<240){r=0;g=x;b=c;} else if(h<300){r=x;g=0;b=c;} else {r=c;g=0;b=x;}
  return [Math.round((r+m)*255), Math.round((g+m)*255), Math.round((b+m)*255)];
}
function hex(rgb) {
  return '#' + rgb.map(function (v) { return ('0'+Math.max(0,Math.min(255,Math.round(v))).toString(16)).slice(-2); }).join('');
}

/* ---------- маленький трёхмерный помощник ---------- */

function rotate(p, ax, ay) {
  var x=p[0], y=p[1], z=p[2];
  var ca=Math.cos(ay), sa=Math.sin(ay);
  var x1 = x*ca + z*sa, z1 = -x*sa + z*ca;
  var cb=Math.cos(ax), sb=Math.sin(ax);
  var y1 = y*cb - z1*sb, z2 = y*sb + z1*cb;
  return [x1, y1, z2];
}

function dragRotate(canvas, state, redraw) {
  var down = false, px = 0, py = 0;
  canvas.addEventListener('pointerdown', function (e) { down = true; px = e.clientX; py = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', function (e) {
    if (!down) return;
    state.ay += (e.clientX - px) * 0.01;
    state.ax += (e.clientY - py) * 0.01;
    px = e.clientX; py = e.clientY;
    redraw();
  });
  canvas.addEventListener('pointerup', function () { down = false; });
  canvas.addEventListener('pointercancel', function () { down = false; });
}

global.IT = {
  TASKS: TASKS, EXTRA: EXTRA, SCALE: SCALE, LS: LS,
  load: load, save: save, blank: blank, all: all, task: task, get: get,
  attempt: attempt, points: points, totals: totals, verdict: verdict,
  header: header, rungSelect: rungSelect, report: report, warnBox: warnBox,
  ready: ready, storageNote: storageNote, mode: function () { return MODE; },
  rnd: rnd, shuffle: shuffle, fmt: fmt, countdown: countdown, phase: phase,
  rgb2lab: rgb2lab, deltaE00: deltaE00, hsl2rgb: hsl2rgb, hex: hex,
  rotate: rotate, dragRotate: dragRotate
};
})(window);
