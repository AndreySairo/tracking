/* ====== Трекинг-дневник — клиентская логика ====== */

/* Встроенные (неудаляемые) пункты. Кастомные приходят из конфига. */
const BUILTIN = {
  sleep:        { id: 'sleep',        name: 'Сон',                    type: 'int',  min: 1, max: 5 },
  supplements:  { id: 'supplements',  name: 'Добавки',                type: 'group',
                  items: [
                    { id: 'caffeine',   name: 'Кофеин' },
                    { id: 'creatine',   name: 'Креатин' },
                    { id: 'lcarnitine', name: 'Л-карнитин' },
                    { id: 'd3',         name: 'Д-3' },
                    { id: 'magnesium',  name: 'Магний' },
                    { id: 'q10',        name: 'Q10' },
                  ] },
  abstinence:   { id: 'abstinence',   name: 'День воздержания',        type: 'int',  min: 0, max: 100000 },
  productivity: { id: 'productivity', name: 'Продуктивность',          type: 'int',  min: 1, max: 10, required: true, colored: true },
  comment:      { id: 'comment',      name: 'Комментарий',             type: 'text' },
  steps:        { id: 'steps',        name: 'Шаги за прошлый день',    type: 'int',  min: 0, max: 1000000, optionalStats: true },
};
const DEFAULT_ORDER = ['sleep', 'supplements', 'abstinence', 'productivity', 'comment', 'steps'];

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_FULL = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

/* состояние */
let state = { config: { fields: [], order: DEFAULT_ORDER.slice() }, records: [] };
let current = {};         // значения текущей (создаваемой) записи: fieldId -> value
let currentView = 'days';

/* ---------- утилиты ---------- */
const $ = (sel) => document.querySelector(sel);
const uid = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function todayLocal() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = ['вс','пн','вт','ср','чт','пт','сб'][new Date(y, m - 1, d).getDay()];
  return `${d} ${MONTHS[m - 1]} ${y}, ${wd}`;
}

/* все определения пунктов (встроенные + кастомные).
 * Группа добавок = встроенные + пользовательские (config.suppItems), минус скрытые (config.suppHidden). */
function allFields() {
  const map = Object.assign({}, BUILTIN);
  const extra = state.config.suppItems || [];
  const hidden = new Set(state.config.suppHidden || []);
  const items = BUILTIN.supplements.items.concat(extra).filter((it) => !hidden.has(it.id));
  map.supplements = Object.assign({}, BUILTIN.supplements, { items });
  for (const f of state.config.fields) map[f.id] = f;
  return map;
}
/* название добавки по id (для списка возврата) */
function suppItemName(id) {
  const b = BUILTIN.supplements.items.find((i) => i.id === id);
  if (b) return b.name;
  const c = (state.config.suppItems || []).find((i) => i.id === id);
  return c ? c.name : id;
}
function orderedFieldIds() {
  const map = allFields();
  const ord = state.config.order.filter((id) => map[id]);
  // на случай если что-то не попало в order — добавим в конец
  for (const id of Object.keys(map)) if (!ord.includes(id)) ord.push(id);
  return ord;
}

/* ---------- цвет продуктивности ---------- */
/* 1..7 — равномерный градиент красный->зелёный; 8 синий; 9 фиолетовый; 10 розовый */
function prodColor(v) {
  if (v == null) return '#555';
  if (v <= 7) {
    const hue = ((v - 1) / 6) * 120;   // 0=красный ... 120=зелёный
    return `hsl(${hue}, 85%, 50%)`;
  }
  if (v === 8) return '#2979ff';        // синий
  if (v === 9) return '#9b30ff';        // фиолетовый
  return '#ff4fa3';                     // 10 — розовый
}
/* непрерывная версия для средних (дробных) баллов */
function prodColorAvg(v) {
  if (v == null) return '#555';
  if (v <= 7) {
    const hue = ((Math.max(1, v) - 1) / 6) * 120;
    return `hsl(${hue}, 80%, 48%)`;
  }
  // интерполяция зелёный(7)->синий(8)->фиолет(9)->розовый(10)
  const stops = { 7: [46,160,67], 8: [41,121,255], 9: [155,48,255], 10: [255,79,163] };
  const lo = Math.floor(v), hi = Math.min(10, lo + 1), t = v - lo;
  const a = stops[lo] || stops[7], b = stops[hi] || stops[10];
  const mix = a.map((x, i) => Math.round(x + (b[i] - x) * t));
  return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
}

/* ---------- загрузка / API ----------
 * Два режима автоматически:
 *  - 'server' — есть PHP-бэкенд (api.php отдаёт JSON), данные в data.json;
 *  - 'local'  — бэкенда нет (открыт как файл или не-PHP сервер), данные в localStorage.
 */
let backend = 'server';
const LS_KEY = 'tracking_diary_v1';

function normalizeState() {
  if (!state || typeof state !== 'object') state = {};
  if (!state.config) state.config = { fields: [], order: DEFAULT_ORDER.slice() };
  if (!state.config.fields) state.config.fields = [];
  if (!state.config.suppItems) state.config.suppItems = [];
  if (!state.config.suppHidden) state.config.suppHidden = [];
  if (!state.config.order || !state.config.order.length) state.config.order = DEFAULT_ORDER.slice();
  if (!state.records) state.records = [];
}

async function loadData() {
  if (backend === 'local') {
    const raw = localStorage.getItem(LS_KEY);
    state = raw ? JSON.parse(raw) : { config: { fields: [], order: DEFAULT_ORDER.slice() }, records: [] };
    normalizeState();
    return;
  }
  try {
    const r = await fetch('api.php', { cache: 'no-store' });
    const d = JSON.parse(await r.text());          // не .json(), чтобы поймать «псевдо-JSON» (исходник php)
    if (!d || !d.config || !Array.isArray(d.records)) throw new Error('not server json');
    state = d;
    backend = 'server';
  } catch (e) {
    backend = 'local';
    console.info('api.php недоступен — работаю на localStorage.');
    const raw = localStorage.getItem(LS_KEY);
    state = raw ? JSON.parse(raw) : { config: { fields: [], order: DEFAULT_ORDER.slice() }, records: [] };
  }
  normalizeState();
}

/* применить действие локально (зеркало логики api.php) */
function applyLocal(payload) {
  if (payload.action === 'save_record') {
    const rec = payload.record;
    const i = state.records.findIndex((r) => r.date === rec.date);
    if (i >= 0) state.records[i] = rec; else state.records.push(rec);
  } else if (payload.action === 'delete_record') {
    state.records = state.records.filter((r) => r.id !== payload.id);
  } else if (payload.action === 'save_config') {
    state.config = payload.config;
  }
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

async function apiPost(payload) {
  if (backend === 'local') { applyLocal(payload); return { ok: true }; }
  try {
    const r = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await r.json();
  } catch (e) {
    backend = 'local';
    applyLocal(payload);
    return { ok: true };
  }
}
const saveConfig = () => apiPost({ action: 'save_config', config: state.config });

/* ---------- инициализация текущей записи (всё пустое) ---------- */
function resetCurrent() {
  current = {};
  const map = allFields();
  for (const id of Object.keys(map)) {
    const f = map[id];
    if (f.type === 'group') {
      current[id] = {};
      for (const it of f.items) current[id][it.id] = null;
    } else {
      current[id] = null;
    }
  }
}

/* ================= РЕНДЕР ФОРМЫ ================= */
function renderForm() {
  const wrap = $('#fields');
  wrap.innerHTML = '';
  const map = allFields();
  for (const id of orderedFieldIds()) {
    wrap.appendChild(renderFieldCard(map[id]));
  }
  initSortable(wrap);
  updateSaveBtn();
}

function renderFieldCard(f) {
  const card = document.createElement('div');
  card.className = 'field-card';
  card.dataset.fieldId = f.id;

  const head = document.createElement('div');
  head.className = 'field-head';
  const isCustom = !BUILTIN[f.id];
  head.innerHTML = `<span class="handle" draggable="true" title="Перетащить">⠿</span>
                    <span class="field-name">${esc(f.name)}</span>`;
  if (isCustom) {
    const rm = document.createElement('button');
    rm.className = 'field-remove';
    rm.title = 'Удалить пункт';
    rm.textContent = '×';
    rm.addEventListener('click', () => removeField(f.id));
    head.appendChild(rm);
  }
  card.appendChild(head);

  const ctrl = document.createElement('div');
  ctrl.className = 'field-control';
  if (f.type === 'group') buildGroup(ctrl, f);
  else if (f.type === 'bool') buildTri(ctrl, () => current[f.id], (v) => { current[f.id] = v; updateSaveBtn(); });
  else if (f.type === 'text') buildText(ctrl, f);
  else buildInt(ctrl, f);
  card.appendChild(ctrl);
  return card;
}

/* целое: маленький диапазон -> кнопки; большой -> поле ввода */
function buildInt(ctrl, f) {
  const span = (f.max - f.min);
  if (span <= 15) {
    for (let v = f.min; v <= f.max; v++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'val-btn';
      b.textContent = v;
      const paint = () => {
        const on = current[f.id] === v;
        b.classList.toggle('active', on);
        if (f.colored) {
          b.style.background = on ? prodColor(v) : '';
          b.style.borderColor = on ? prodColor(v) : '';
          b.style.color = on ? '#0b0b12' : '';
          b.style.boxShadow = on ? `0 0 16px ${prodColor(v)}` : '';
        }
      };
      b.addEventListener('click', () => {
        current[f.id] = (current[f.id] === v) ? null : v;  // повторный клик очищает
        ctrl.querySelectorAll('.val-btn').forEach((el) => el._paint && el._paint());
        updateSaveBtn();
      });
      b._paint = paint;
      paint();
      ctrl.appendChild(b);
    }
  } else {
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.min = f.min; inp.max = f.max;
    inp.placeholder = 'пусто';
    inp.style.width = '140px';
    inp.value = current[f.id] == null ? '' : current[f.id];
    inp.addEventListener('input', () => {
      current[f.id] = inp.value === '' ? null : Number(inp.value);
      updateSaveBtn();
    });
    ctrl.appendChild(inp);
    const clr = document.createElement('button');
    clr.type = 'button'; clr.className = 'num-clear'; clr.textContent = 'очистить';
    clr.addEventListener('click', () => { inp.value = ''; current[f.id] = null; updateSaveBtn(); });
    ctrl.appendChild(clr);
  }
}

function buildText(ctrl, f) {
  const ta = document.createElement('textarea');
  ta.placeholder = 'пусто';
  ta.value = current[f.id] || '';
  ta.addEventListener('input', () => { current[f.id] = ta.value || null; updateSaveBtn(); });
  ctrl.appendChild(ta);
}

/* tri-state: null(—) -> true(✓) -> false(✗) -> null */
function buildTri(ctrl, get, set) {
  const el = document.createElement('span');
  el.className = 'tri';
  el.innerHTML = `<span class="mark"></span><span class="lbl"></span>`;
  const paint = () => {
    const v = get();
    el.classList.remove('state-empty', 'state-yes', 'state-no');
    if (v === true)  { el.classList.add('state-yes'); el.querySelector('.mark').textContent = '✓'; el.querySelector('.lbl').textContent = 'да'; }
    else if (v === false) { el.classList.add('state-no'); el.querySelector('.mark').textContent = '✗'; el.querySelector('.lbl').textContent = 'нет'; }
    else { el.classList.add('state-empty'); el.querySelector('.mark').textContent = '—'; el.querySelector('.lbl').textContent = 'пусто'; }
  };
  el.addEventListener('click', () => {
    const v = get();
    set(v === null || v === undefined ? true : v === true ? false : null);
    paint();
  });
  paint();
  ctrl.appendChild(el);
}

/* группа добавок: tri-state на каждый элемент + очистка + добавление своих + удаление/возврат */
function buildGroup(ctrl, f) {
  const box = document.createElement('div');
  box.className = 'group-items';
  for (const it of f.items) {
    if (current[f.id][it.id] === undefined) current[f.id][it.id] = null;  // новый элемент — пустой
    const item = document.createElement('span');
    item.className = 'tri';
    const rm = `<span class="supp-remove" title="Удалить добавку">×</span>`;
    item.innerHTML = `<span class="mark"></span><span class="lbl">${esc(it.name)}</span>${rm}`;
    const paint = () => {
      const v = current[f.id][it.id];
      item.classList.remove('state-empty', 'state-yes', 'state-no');
      if (v === true) { item.classList.add('state-yes'); item.querySelector('.mark').textContent = '✓'; }
      else if (v === false) { item.classList.add('state-no'); item.querySelector('.mark').textContent = '✗'; }
      else { item.classList.add('state-empty'); item.querySelector('.mark').textContent = '—'; }
    };
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('supp-remove')) { e.stopPropagation(); hideSuppItem(it.id); return; }
      const v = current[f.id][it.id];
      current[f.id][it.id] = v === null || v === undefined ? true : v === true ? false : null;
      paint(); updateSaveBtn();
    });
    item._paint = paint;
    paint();
    box.appendChild(item);
  }
  ctrl.appendChild(box);

  const bar = document.createElement('div');
  bar.className = 'group-bar';
  const clr = document.createElement('button');
  clr.type = 'button'; clr.className = 'group-clear'; clr.textContent = 'очистить группу';
  clr.addEventListener('click', () => {
    for (const it of f.items) current[f.id][it.id] = null;
    box.querySelectorAll('.tri').forEach((el) => el._paint && el._paint());
    updateSaveBtn();
  });
  bar.appendChild(clr);

  // инлайн-добавление своей добавки
  const addBtn = document.createElement('button');
  addBtn.type = 'button'; addBtn.className = 'group-clear'; addBtn.textContent = '+ добавка';
  const inp = document.createElement('input');
  inp.type = 'text'; inp.placeholder = 'название'; inp.maxLength = 40;
  inp.className = 'supp-add-input hidden';
  const commit = () => {
    const name = inp.value.trim();
    if (name) addSuppItem(name); else { inp.classList.add('hidden'); }
  };
  addBtn.addEventListener('click', () => {
    inp.classList.toggle('hidden');
    if (!inp.classList.contains('hidden')) inp.focus();
  });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') inp.classList.add('hidden'); });
  inp.addEventListener('blur', commit);
  bar.appendChild(addBtn);
  bar.appendChild(inp);

  // возврат удалённых добавок
  const hidden = state.config.suppHidden || [];
  if (hidden.length) {
    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button'; restoreBtn.className = 'group-clear';
    restoreBtn.textContent = `вернуть удалённые (${hidden.length})`;
    const panel = document.createElement('div');
    panel.className = 'supp-restore hidden';
    for (const id of hidden) {
      const chip = document.createElement('button');
      chip.type = 'button'; chip.className = 'restore-chip';
      chip.innerHTML = `↩ ${esc(suppItemName(id))}`;
      chip.addEventListener('click', () => restoreSuppItem(id));
      panel.appendChild(chip);
    }
    restoreBtn.addEventListener('click', () => panel.classList.toggle('hidden'));
    bar.appendChild(restoreBtn);
    ctrl.appendChild(bar);
    ctrl.appendChild(panel);
    return;
  }
  ctrl.appendChild(bar);
}

async function addSuppItem(name) {
  const it = { id: 's' + uid(), name };
  state.config.suppItems.push(it);
  if (!current.supplements) current.supplements = {};
  current.supplements[it.id] = null;
  await saveConfig();
  renderForm();
}
/* «удаление» добавки = скрытие (обратимо через возврат) */
async function hideSuppItem(id) {
  if (!state.config.suppHidden) state.config.suppHidden = [];
  if (!state.config.suppHidden.includes(id)) state.config.suppHidden.push(id);
  await saveConfig();
  renderForm();
}
async function restoreSuppItem(id) {
  state.config.suppHidden = (state.config.suppHidden || []).filter((x) => x !== id);
  if (!current.supplements) current.supplements = {};
  if (current.supplements[id] === undefined) current.supplements[id] = null;
  await saveConfig();
  renderForm();
}

/* ---------- активность кнопки Сохранить ---------- */
function updateSaveBtn() {
  const ok = current.productivity != null && $('#recDate').value !== '';
  $('#saveBtn').disabled = !ok;
}

/* ---------- drag & drop сортировка ---------- */
function initSortable(container) {
  let dragEl = null;
  container.querySelectorAll('.handle').forEach((h) => {
    h.addEventListener('dragstart', (e) => {
      dragEl = h.closest('.field-card');
      dragEl.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragEl.dataset.fieldId);
    });
    h.addEventListener('dragend', () => {
      if (dragEl) dragEl.classList.remove('dragging');
      dragEl = null;
      // сохранить новый порядок из DOM
      state.config.order = [...container.querySelectorAll('.field-card')].map((c) => c.dataset.fieldId);
      saveConfig();
    });
  });
  container.addEventListener('dragover', (e) => {
    if (!dragEl) return;
    e.preventDefault();
    const after = getDragAfter(container, e.clientY);
    if (after == null) container.appendChild(dragEl);
    else container.insertBefore(dragEl, after);
  });
}
function getDragAfter(container, y) {
  const els = [...container.querySelectorAll('.field-card:not(.dragging)')];
  let closest = { offset: -Infinity, el: null };
  for (const el of els) {
    const box = el.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) closest = { offset, el };
  }
  return closest.el;
}

/* ---------- добавление / удаление пунктов ---------- */
function setupAddField() {
  const form = $('#addFieldForm');
  $('#addFieldBtn').addEventListener('click', () => form.classList.toggle('hidden'));
  $('#cancelFieldBtn').addEventListener('click', () => { form.classList.add('hidden'); $('#newFieldName').value = ''; });
  $('#newFieldType').addEventListener('change', (e) => {
    $('#newFieldRange').style.display = e.target.value === 'int' ? 'flex' : 'none';
  });
  $('#createFieldBtn').addEventListener('click', async () => {
    const name = $('#newFieldName').value.trim();
    if (!name) { $('#newFieldName').focus(); return; }
    const type = $('#newFieldType').value;
    const f = { id: 'c' + uid(), name, type };
    if (type === 'int') {
      f.min = Number($('#newFieldMin').value || 0);
      f.max = Number($('#newFieldMax').value || 10);
      if (f.max < f.min) [f.min, f.max] = [f.max, f.min];
    }
    state.config.fields.push(f);
    state.config.order.push(f.id);
    // в текущей записи новый пункт — пустой
    current[f.id] = type === 'group' ? {} : null;
    await saveConfig();
    $('#newFieldName').value = '';
    form.classList.add('hidden');
    renderForm();
  });
}
async function removeField(id) {
  const ok = await confirmDialog('Удалить этот пункт? Он исчезнет из формы (сохранённые записи не меняются).');
  if (!ok) return;
  state.config.fields = state.config.fields.filter((f) => f.id !== id);
  state.config.order = state.config.order.filter((x) => x !== id);
  delete current[id];
  await saveConfig();
  renderForm();
}

/* ---------- сохранение записи ---------- */
async function saveRecord() {
  if ($('#saveBtn').disabled) return;
  const date = $('#recDate').value;
  const existing = state.records.find((r) => r.date === date);
  if (existing) {
    const ok = await confirmDialog(`Запись за ${fmtDate(date)} уже есть. Перезаписать её?`);
    if (!ok) return;
  }
  const record = { id: existing ? existing.id : uid(), date, values: JSON.parse(JSON.stringify(current)) };
  await apiPost({ action: 'save_record', record });
  await loadData();
  resetCurrent();
  $('#recDate').value = todayLocal();
  renderForm();
  renderHistory();
}

/* ================= ИСТОРИЯ ================= */
function setupViewSwitch() {
  $('#viewSwitch').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    currentView = btn.dataset.view;
    $('#viewSwitch').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    renderHistory();
  });
}

function renderHistory() {
  const body = $('#historyBody');
  body.innerHTML = '';
  if (!state.records.length) {
    body.innerHTML = '<div class="empty-note">Пока нет сохранённых дней.</div>';
    return;
  }
  const recs = state.records.slice().sort((a, b) => b.date.localeCompare(a.date));
  if (currentView === 'days') recs.forEach((r) => body.appendChild(renderDayRow(r)));
  else if (currentView === 'weeks') renderWeeks(body, recs);
  else renderMonths(body, recs);
}

/* среднее по продуктивности */
function avgProd(recs) {
  const vals = recs.map((r) => r.values.productivity).filter((v) => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
/* средние шаги (пустые исключаются) */
function avgSteps(recs) {
  const vals = recs.map((r) => r.values.steps).filter((v) => v != null);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function badgeProd(v) {
  const b = document.createElement('span');
  b.className = 'badge';
  b.style.background = prodColor(v);
  b.textContent = v;
  return b;
}
function badgeAvg(v) {
  const b = document.createElement('span');
  b.className = 'badge avg';
  b.style.background = prodColorAvg(v);
  b.textContent = v == null ? '—' : v.toFixed(1);
  return b;
}

/* строка одного дня (используется в «днях» и вложенно в неделях/месяцах) */
function renderDayRow(r) {
  const row = document.createElement('div');
  row.className = 'row';

  const head = document.createElement('div');
  head.className = 'row-head';
  head.innerHTML = `<span class="caret">▶</span><span class="row-title">${esc(fmtDate(r.date))}</span>`;
  head.appendChild(badgeProd(r.values.productivity));
  head.addEventListener('click', () => {
    row.classList.toggle('open');
    if (row.classList.contains('open')) collapseTemplate(true); // открыли день — поджать шаблон
  });
  row.appendChild(head);

  const bodyEl = document.createElement('div');
  bodyEl.className = 'row-body';
  bodyEl.appendChild(renderDayDetail(r));
  row.appendChild(bodyEl);
  return row;
}

function renderDayDetail(r) {
  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  const map = allFields();
  for (const id of orderedFieldIds()) {
    const f = map[id];
    const item = document.createElement('div');
    item.className = 'detail-item';
    item.innerHTML = `<span class="k">${esc(f.name)}</span><span class="v">${formatValue(f, r.values[id])}</span>`;
    grid.appendChild(item);
  }
  const actions = document.createElement('div');
  actions.className = 'detail-actions';
  const del = document.createElement('button');
  del.className = 'del-btn';
  del.textContent = '🗑 Удалить день';
  del.addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok = await confirmDialog(`Удалить запись за ${fmtDate(r.date)}?`);
    if (!ok) return;
    await apiPost({ action: 'delete_record', id: r.id });
    await loadData();
    renderHistory();
  });
  actions.appendChild(del);

  const box = document.createElement('div');
  box.appendChild(grid);
  box.appendChild(actions);
  return box;
}

function formatValue(f, val) {
  if (f.type === 'group') {
    const parts = f.items.map((it) => {
      const v = val ? val[it.id] : null;
      const cls = v === true ? 'yes' : v === false ? 'no' : 'em';
      const mark = v === true ? '✓' : v === false ? '✗' : '—';
      return `<span class="${cls}">${mark} ${esc(it.name)}</span>`;
    });
    return `<span class="supp-line">${parts.join('&nbsp; ')}</span>`;
  }
  if (f.type === 'bool') {
    if (val === true) return '<span class="supp-line"><span class="yes">✓ да</span></span>';
    if (val === false) return '<span class="supp-line"><span class="no">✗ нет</span></span>';
    return '<span class="em">—</span>';
  }
  if (val == null || val === '') return '<span style="color:#9a91b4">—</span>';
  return esc(val);
}

/* ---------- недели / месяцы ---------- */
function isoWeek(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = (date.getUTCDay() + 6) % 7;          // пн=0
  date.setUTCDate(date.getUTCDate() - day + 3);    // четверг этой недели
  const firstTh = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const ftDay = (firstTh.getUTCDay() + 6) % 7;
  firstTh.setUTCDate(firstTh.getUTCDate() - ftDay + 3);
  const week = 1 + Math.round((date - firstTh) / (7 * 86400000));
  return { year: date.getUTCFullYear(), week };
}
function weekKey(iso) { const w = isoWeek(iso); return `${w.year}-W${String(w.week).padStart(2, '0')}`; }
function weekRange(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const day = (date.getDay() + 6) % 7;
  const mon = new Date(date); mon.setDate(date.getDate() - day);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return `${mon.getDate()} ${MONTHS[mon.getMonth()]} – ${sun.getDate()} ${MONTHS[sun.getMonth()]}`;
}

function groupBy(recs, keyFn) {
  const m = new Map();
  for (const r of recs) {
    const k = keyFn(r.date);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

function makeGroupRow(title, sub, recs, expand) {
  const row = document.createElement('div');
  row.className = 'row';
  const head = document.createElement('div');
  head.className = 'row-head';
  head.innerHTML = `<span class="caret">▶</span>
                    <span class="row-title">${esc(title)}</span>
                    <span class="row-sub">${esc(sub)}</span>`;
  const avg = avgProd(recs);
  head.appendChild(badgeAvg(avg));
  row.appendChild(head);

  const bodyEl = document.createElement('div');
  bodyEl.className = 'row-body';
  const nested = document.createElement('div');
  nested.className = 'nested';
  bodyEl.appendChild(nested);
  row.appendChild(bodyEl);

  let built = false;
  head.addEventListener('click', () => {
    row.classList.toggle('open');
    if (!built && row.classList.contains('open')) { expand(nested); built = true; }
  });
  return row;
}

function renderWeeks(body, recs) {
  const weeks = groupBy(recs, weekKey);
  const keys = [...weeks.keys()].sort().reverse();
  for (const k of keys) {
    const list = weeks.get(k).slice().sort((a, b) => b.date.localeCompare(a.date));
    const w = k.split('-W');
    const sub = `${weekRange(list[0].date)} · дней: ${list.length}${avgSteps(list) != null ? ` · шаги⌀ ${avgSteps(list)}` : ''}`;
    body.appendChild(makeGroupRow(`Неделя ${Number(w[1])}, ${w[0]}`, sub, list, (nested) => {
      list.forEach((r) => nested.appendChild(renderDayRow(r)));
    }));
  }
}

function renderMonths(body, recs) {
  const months = groupBy(recs, (iso) => iso.slice(0, 7));   // YYYY-MM
  const keys = [...months.keys()].sort().reverse();
  for (const k of keys) {
    const list = months.get(k).slice().sort((a, b) => b.date.localeCompare(a.date));
    const [y, m] = k.split('-').map(Number);
    const sub = `дней: ${list.length}${avgSteps(list) != null ? ` · шаги⌀ ${avgSteps(list)}` : ''}`;
    body.appendChild(makeGroupRow(`${MONTHS_FULL[m - 1]} ${y}`, sub, list, (nested) => {
      // месяц -> недели -> дни
      const weeks = groupBy(list, weekKey);
      const wkeys = [...weeks.keys()].sort().reverse();
      for (const wk of wkeys) {
        const wlist = weeks.get(wk).slice().sort((a, b) => b.date.localeCompare(a.date));
        const w = wk.split('-W');
        const wsub = `${weekRange(wlist[0].date)} · дней: ${wlist.length}`;
        nested.appendChild(makeGroupRow(`Неделя ${Number(w[1])}`, wsub, wlist, (n2) => {
          wlist.forEach((r) => n2.appendChild(renderDayRow(r)));
        }));
      }
    }));
  }
}

/* ---------- сворачивание шаблона ---------- */
function collapseTemplate(collapse) {
  const t = $('#template');
  t.classList.toggle('collapsed', collapse);
  $('#toggleTemplate').textContent = collapse ? 'раскрыть' : 'свернуть';
}
function setupTemplateToggle() {
  $('#toggleTemplate').addEventListener('click', (e) => {
    e.stopPropagation();
    collapseTemplate(!$('#template').classList.contains('collapsed'));
  });
  $('#templateHead').addEventListener('click', () => {
    if ($('#template').classList.contains('collapsed')) collapseTemplate(false);
  });
}

/* ---------- модальное подтверждение ---------- */
let modalResolve = null;
function confirmDialog(text) {
  $('#modalText').textContent = text;
  $('#modal').classList.remove('hidden');
  return new Promise((res) => { modalResolve = res; });
}
function setupModal() {
  $('#modalOk').addEventListener('click', () => { $('#modal').classList.add('hidden'); modalResolve && modalResolve(true); });
  $('#modalCancel').addEventListener('click', () => { $('#modal').classList.add('hidden'); modalResolve && modalResolve(false); });
  $('#modal').addEventListener('click', (e) => {
    if (e.target === $('#modal')) { $('#modal').classList.add('hidden'); modalResolve && modalResolve(false); }
  });
}

/* ================= СТАРТ ================= */
async function init() {
  await loadData();
  resetCurrent();
  $('#recDate').value = todayLocal();
  $('#recDate').addEventListener('change', updateSaveBtn);
  $('#saveBtn').addEventListener('click', saveRecord);
  setupAddField();
  setupViewSwitch();
  setupTemplateToggle();
  setupModal();
  renderForm();
  renderHistory();
}
init();
