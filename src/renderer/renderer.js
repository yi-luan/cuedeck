// CueDeck 畫面：簡報模式（看講稿、推進步驟）與編輯模式（結構化編輯、從頁面選取元素）
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = (n) => String(n).padStart(2, '0');

let doc = null; // 主程序送來的 { file, name, imported, deck, errors }
let deck = null; // 編輯中的副本
let mode = 'present';
let current = -1; // 目前講到第幾個步驟（攤平後的索引）
let dirty = false;
let cueStates = []; // 每個步驟的執行狀態：running / done / error
const badDsl = new WeakMap(); // 編輯器裡打錯、還不能存的動作文字：cue → 錯誤訊息
const badFlows = new Map(); // 流程名稱 → 錯誤訊息

// 依講述順序列出所有步驟（講稿裡的觸發點優先），cue 指回編輯中的原物件
const flat = () => (deck ? window.model.orderedCues(deck).map((f) => ({ ...f, cue: deck.sections[f.si].cues[f.ci] })) : []);
const summary = (actions) => actions.map((a) => window.model.describe(a)).join(' → ');

// ---------- 載入 ----------

function loadDoc(payload, { keepPosition = false } = {}) {
  doc = payload;
  deck = payload.deck ? structuredClone(payload.deck) : null;
  dirty = false;
  badFlows.clear();
  if (!keepPosition) {
    current = -1;
    cueStates = [];
  }
  renderAll();
}

function renderAll() {
  $('deck-title').textContent = deck?.title || doc?.name || '—';
  $('deck-title').title = doc?.file || '';
  $('dirty').hidden = !dirty;
  const errs = doc?.errors || [];
  const notes = doc?.imported ? ['這是從 Markdown 匯入的講稿，儲存時會另存成 .cuedeck.json，原本的按鈕已轉成講稿中的 {{觸發點}}'] : [];
  $('errors').hidden = !errs.length && !notes.length;
  $('errors').textContent = [...errs, ...notes].join('\n');
  if (mode === 'present') renderPresent();
  else renderEdit();
}

function setDirty() {
  dirty = true;
  $('dirty').hidden = false;
}

// ---------- 簡報模式 ----------

function renderPresent() {
  const el = $('present');
  if (!deck) {
    el.innerHTML = '<div class="empty"><b>還沒有劇本</b>從右上角「⋯」匯入劇本，或新增一份空白劇本。</div>';
    updateFoot();
    return;
  }
  const order = flat();
  const indexOf = new Map(order.map((f, i) => [`${f.si}:${f.ci}`, i]));
  el.innerHTML = deck.sections
    .map((s, si) => {
      const idx = (ci) => indexOf.get(`${si}:${ci}`);
      // 講稿裡的 {{步驟名稱}} 換成可以點的觸發點，再交給 Markdown
      const notes = s.notes.replace(/\{\{([^{}\n]+?)\}\}/g, (_, raw) => {
        const label = raw.trim();
        const ci = s.cues.findIndex((c) => c.label === label);
        if (ci < 0) return `<span class="chip missing" title="這個段落沒有叫「${esc(label)}」的步驟">${icon('alert')}${esc(label)}</span>`;
        return chipHtml(idx(ci), s.cues[ci]);
      });
      const rest = order.filter((f) => f.si === si && !f.inline).map((f) => cueRowHtml(indexOf.get(`${f.si}:${f.ci}`), f.cue)).join('');
      return `<section class="sec" data-sec="${si}">
        <div class="sec-head"><span class="sec-no">${pad(si + 1)}</span><span class="sec-title">${esc(s.title)}</span></div>
        ${s.notes ? `<div class="notes">${window.model.markdown(notes)}</div>` : ''}
        ${rest ? `<div class="cues">${rest}</div>` : ''}
      </section>`;
    })
    .join('');
  markCurrent(false);
}

const isInvalid = (c) => !c.actions.length || c.actions.some((a) => window.model.validateAction(a, deck.flows));

// 講稿中的觸發點
function chipHtml(i, c) {
  return `<button class="chip ${isInvalid(c) ? 'invalid' : ''} ${cueStates[i] || ''}" data-run="${i}" title="${esc(summary(c.actions))}"><span class="chip-n">${i + 1}</span>${esc(c.label)}</button>`;
}

// 沒寫進講稿的步驟，列在段落下方
function cueRowHtml(i, c) {
  const invalid = isInvalid(c);
  return `<button class="cue ${invalid ? 'invalid' : ''} ${cueStates[i] || ''}" data-run="${i}">
    <span class="cue-n">${i + 1}</span>
    <span class="cue-main"><span class="cue-label">${esc(c.label)}</span><span class="cue-sum">${esc(summary(c.actions))}</span></span>
    <span class="cue-state">${stateIcon(cueStates[i], invalid)}</span>
  </button>`;
}

function stateIcon(state, invalid) {
  if (state === 'done') return icon('check');
  if (state === 'error' || invalid) return icon('alert');
  if (state === 'running') return '';
  return icon('play');
}

function setCueState(i, state) {
  cueStates[i] = state;
  $('present').querySelectorAll(`[data-run="${i}"]`).forEach((btn) => {
    btn.classList.remove('running', 'done', 'error');
    btn.classList.add(state);
    const st = btn.querySelector('.cue-state');
    if (st) st.innerHTML = stateIcon(state);
  });
}

function markCurrent(scroll = true) {
  const btns = Array.from($('present').querySelectorAll('[data-run]'));
  btns.forEach((b) => b.classList.toggle('current', Number(b.dataset.run) === current));
  const cur = flat()[current];
  $('present').querySelectorAll('.sec').forEach((s) => s.classList.toggle('active', !!cur && Number(s.dataset.sec) === cur.si));
  updateFoot();
  const btn = btns.find((b) => Number(b.dataset.run) === current);
  if (scroll && btn) {
    // 把目前這一步捲到上方 1/4，下面接著要講的內容就會露出來
    const box = $('present');
    const top = btn.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTo({ top: Math.max(0, top - box.clientHeight * 0.28) });
  }
}

function updateFoot() {
  const total = flat().length;
  $('pos').textContent = `${current < 0 ? 0 : current + 1} / ${total}`;
  $('progress-bar').style.width = total ? `${((current + 1) / total) * 100}%` : '0';
}

async function runCue(i) {
  const f = flat()[i];
  if (!f) return;
  current = i;
  markCurrent();
  setCueState(i, 'running');
  setLog(`執行中：${f.cue.label}`);
  const r = await window.cue.run({ actions: f.cue.actions, flows: deck.flows, target: deck.target });
  setCueState(i, r.ok ? 'done' : 'error');
  setLog(r.ok ? `✓ ${f.cue.label}` : r.error, r.ok ? 'ok' : 'error');
}

function step(cmd) {
  if (mode !== 'present' || !deck) return;
  if (cmd === 'next') {
    if (current + 1 >= flat().length) return setLog('已經是最後一步');
    runCue(current + 1);
  }
  if (cmd === 'prev') runCue(Math.max(0, current - 1));
  if (cmd === 'again') runCue(Math.max(0, current));
}

function setLog(text, level = '') {
  const log = $('log');
  log.textContent = text;
  log.title = text;
  log.className = `log ${level}`;
}

// ---------- 編輯模式 ----------

function renderEdit() {
  const el = $('edit');
  if (!deck) {
    el.innerHTML = '<div class="empty"><b>還沒有劇本</b>從右上角「⋯」新增一份空白劇本。</div>';
    return;
  }
  const order = flat();
  const indexOf = new Map(order.map((f, i) => [`${f.si}:${f.ci}`, i]));
  const sections = deck.sections
    .map((s, si) => {
      const inNotes = window.model.cueMarkers(s.notes);
      const cues = s.cues.map((c, ci) => editCue(c, si, ci, indexOf.get(`${si}:${ci}`), inNotes.includes(c.label))).join('');
      return `<div class="card" data-si="${si}">
        <div class="card-head">
          <span class="sec-no">${pad(si + 1)}</span>
          <input class="input" data-f="sec-title" data-si="${si}" value="${esc(s.title)}" placeholder="段落標題">
          <button class="mini" data-act="sec-up" data-si="${si}" title="上移">${icon('up')}</button>
          <button class="mini" data-act="sec-down" data-si="${si}" title="下移">${icon('down')}</button>
          <button class="mini danger" data-act="sec-del" data-si="${si}" title="刪除段落">${icon('trash')}</button>
        </div>
        <textarea class="textarea" data-f="sec-notes" data-si="${si}" rows="${Math.min(10, Math.max(2, s.notes.split('\n').length + 1))}" placeholder="講稿（支援 Markdown：**粗體**、- 清單、> 提示）">${esc(s.notes)}</textarea>
        <div class="notes-tools">
          <select class="select insert-select" data-insert="${si}" ${s.cues.length ? '' : 'disabled'}>
            <option value="">插入觸發點…</option>
            ${s.cues.map((c) => `<option value="${esc(c.label)}">${esc(c.label)}</option>`).join('')}
          </select>
          <button class="btn accent" data-act="pick-insert" data-si="${si}" title="到頁面上選一個元素，新增步驟並把觸發點插在講稿游標處">${icon('crosshair')}選取並插在游標處</button>
        </div>
        <div class="hint">講稿中寫 {{步驟名稱}}，簡報時那裡會變成可以點的觸發點</div>
        ${cues}
        <div class="row-actions">
          <button class="btn accent" data-act="pick-new" data-si="${si}">${icon('crosshair')}從頁面選取</button>
          <button class="btn" data-act="cue-add" data-si="${si}">${icon('plus')}新增步驟</button>
        </div>
      </div>`;
    })
    .join('');

  const flows = Object.entries(deck.flows)
    .map(([name, actions]) => {
      const err = badFlows.get(name);
      return `<div class="card" data-flow="${esc(name)}">
        <div class="card-head">
          <span class="sec-no">${icon('flow')}</span>
          <input class="input" data-f="flow-name" data-flow="${esc(name)}" value="${esc(name)}" placeholder="流程名稱">
          <button class="mini danger" data-act="flow-del" data-flow="${esc(name)}" title="刪除流程">${icon('trash')}</button>
        </div>
        <textarea class="textarea mono ${err ? 'bad' : ''}" data-f="flow-dsl" data-flow="${esc(name)}" rows="${Math.max(3, actions.length + 1)}">${esc(err ? err.text : actions.map((a) => window.model.toDsl([a])).join('\n'))}</textarea>
        <div class="hint ${err ? 'bad' : ''}">${esc(err ? err.message : `步驟裡用「flow ${name}」呼叫`)}</div>
      </div>`;
    })
    .join('');

  el.innerHTML = `
    <div class="field"><span>劇本名稱</span><input class="input" data-f="title" value="${esc(deck.title)}"></div>
    <div class="field"><span>Demo 網址（相對路徑以這裡為基準，也用來挑要操作的分頁）</span><input class="input mono" data-f="target" value="${esc(deck.target)}" placeholder="http://localhost:3000"></div>
    <div class="group-title">段落與步驟</div>
    ${sections}
    <button class="btn wide" data-act="sec-add">${icon('plus')}新增段落</button>
    <div class="group-title">共用流程</div>
    ${flows}
    <button class="btn wide" data-act="flow-add">${icon('plus')}新增流程</button>`;
}

function editCue(c, si, ci, n, inNotes) {
  const bad = badDsl.get(c);
  const text = bad ? bad.text : window.model.toDsl(c.actions);
  return `<div class="ecue" data-si="${si}" data-ci="${ci}">
    <div class="ecue-row">
      <span class="cue-n">${n + 1}</span>
      <input class="input" data-f="cue-label" data-si="${si}" data-ci="${ci}" value="${esc(c.label)}" data-prev="${esc(c.label)}" placeholder="按鈕文字">
      ${inNotes ? '<span class="tag" title="這個步驟已經放在講稿裡">講稿內</span>' : `<button class="mini go" data-act="cue-insert" data-si="${si}" data-ci="${ci}" title="把這一步插到講稿游標處">${icon('link')}</button>`}
      <button class="mini go" data-act="cue-test" data-si="${si}" data-ci="${ci}" title="試跑這一步">${icon('play')}</button>
      <button class="mini go" data-act="pick-append" data-si="${si}" data-ci="${ci}" title="從頁面選取，加到這一步">${icon('crosshair')}</button>
      <button class="mini" data-act="cue-up" data-si="${si}" data-ci="${ci}" title="上移">${icon('up')}</button>
      <button class="mini" data-act="cue-down" data-si="${si}" data-ci="${ci}" title="下移">${icon('down')}</button>
      <button class="mini danger" data-act="cue-del" data-si="${si}" data-ci="${ci}" title="刪除">${icon('trash')}</button>
    </div>
    <input class="input mono ${bad ? 'bad' : ''}" data-f="cue-dsl" data-si="${si}" data-ci="${ci}" value="${esc(text)}" placeholder='click #btn; wait 500; highlight #result "說明"'>
    <div class="hint ${bad ? 'bad' : ''}">${esc(bad ? bad.message : summary(c.actions) || '還沒有動作')}</div>
  </div>`;
}

// 解析一段指令文字並驗證；回傳 { actions } 或 { error }
function parseActions(text) {
  try {
    const actions = window.model.parseDsl(text);
    if (!actions.length) return { error: '還沒有動作' };
    const err = actions.map((a) => window.model.validateAction(a, deck.flows)).find(Boolean);
    return err ? { error: err } : { actions };
  } catch (e) {
    return { error: e.message };
  }
}

$('edit').addEventListener('input', (e) => {
  const t = e.target;
  const f = t.dataset.f;
  if (!f) return;
  const si = Number(t.dataset.si);
  const ci = Number(t.dataset.ci);
  if (f === 'title') {
    deck.title = t.value;
    $('deck-title').textContent = t.value;
  } else if (f === 'target') deck.target = t.value.trim();
  else if (f === 'sec-title') deck.sections[si].title = t.value;
  else if (f === 'sec-notes') deck.sections[si].notes = t.value;
  else if (f === 'cue-label') deck.sections[si].cues[ci].label = t.value;
  else if (f === 'cue-dsl') {
    const cue = deck.sections[si].cues[ci];
    const r = parseActions(t.value);
    const hint = t.nextElementSibling;
    if (r.error) badDsl.set(cue, { text: t.value, message: r.error });
    else {
      badDsl.delete(cue);
      cue.actions = r.actions;
    }
    t.classList.toggle('bad', !!r.error);
    hint.classList.toggle('bad', !!r.error);
    hint.textContent = r.error || summary(r.actions);
  } else if (f === 'flow-dsl') {
    const name = t.dataset.flow;
    const r = parseActions(t.value);
    const hint = t.nextElementSibling;
    if (r.error) badFlows.set(name, { text: t.value, message: r.error });
    else {
      badFlows.delete(name);
      deck.flows[name] = r.actions;
    }
    t.classList.toggle('bad', !!r.error);
    hint.classList.toggle('bad', !!r.error);
    hint.textContent = r.error || `步驟裡用「flow ${name}」呼叫`;
  } else return;
  setDirty();
});

// ---------- 講稿觸發點的編輯 ----------

const caret = new Map(); // 段落 → 講稿游標位置（插入觸發點用）
['keyup', 'mouseup', 'focusout', 'input'].forEach((type) =>
  $('edit').addEventListener(type, (e) => {
    if (e.target.dataset?.f === 'sec-notes') caret.set(Number(e.target.dataset.si), e.target.selectionStart);
  }),
);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const removeMarker = (notes, label) => notes.replace(new RegExp(`[ \\t]?\\{\\{\\s*${escapeRe(label)}\\s*\\}\\}`, 'g'), '');

// 同一段落的步驟名稱不能重複，否則觸發點分不出是哪一個
function uniqueLabel(si, label, except = -1) {
  const taken = new Set(deck.sections[si].cues.filter((_, i) => i !== except).map((c) => c.label));
  if (!taken.has(label)) return label;
  for (let k = 2; ; k++) if (!taken.has(`${label} ${k}`)) return `${label} ${k}`;
}

// 在講稿游標處插入 {{label}}（前後自動補空白）
function insertMarker(si, label, at) {
  const sec = deck.sections[si];
  const pos = Math.min(at ?? caret.get(si) ?? sec.notes.length, sec.notes.length);
  const before = sec.notes.slice(0, pos);
  const after = sec.notes.slice(pos);
  const pre = before && !/\s$/.test(before) ? ' ' : '';
  const post = after && !/^\s/.test(after) ? ' ' : '';
  const marker = `${pre}{{${label}}}${post}`;
  sec.notes = before + marker + after;
  caret.set(si, pos + marker.length);
  setDirty();
  renderEdit();
  const ta = $('edit').querySelector(`[data-f="sec-notes"][data-si="${si}"]`);
  if (ta) {
    ta.focus();
    ta.setSelectionRange(pos + marker.length, pos + marker.length);
  }
}

// 「插入觸發點…」下拉選單
$('edit').addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.insert === undefined || !t.value) return;
  insertMarker(Number(t.dataset.insert), t.value);
});

// 步驟改名在離開欄位時套用：檢查重複，並把講稿裡的觸發點一起改名
$('edit').addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.f !== 'cue-label') return;
  const si = Number(t.dataset.si);
  const ci = Number(t.dataset.ci);
  const from = t.dataset.prev;
  const cue = deck.sections[si].cues[ci];
  let to = t.value.trim();
  if (!to) to = from;
  if (to !== uniqueLabel(si, to, ci)) {
    setLog(`這個段落已經有叫「${to}」的步驟`, 'error');
    to = from;
  }
  cue.label = to;
  t.value = to;
  if (to === from) return; // 沒改名就不重畫，免得吃掉使用者正要按的按鈕
  t.dataset.prev = to;
  deck.sections[si].notes = window.model.renameMarker(deck.sections[si].notes, from, to);
  setDirty();
  renderEdit();
});

// 流程改名在離開欄位時才套用，避免打字途中一直改 key
$('edit').addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.f !== 'flow-name') return;
  const from = t.dataset.flow;
  const to = t.value.trim();
  if (!to || to === from) return void (t.value = from);
  if (deck.flows[to]) {
    setLog(`已經有名為「${to}」的流程`, 'error');
    return void (t.value = from);
  }
  deck.flows = Object.fromEntries(Object.entries(deck.flows).map(([k, v]) => [k === from ? to : k, v]));
  // 把呼叫舊名稱的地方一起改掉
  const rename = (list) => list.forEach((a) => a.do === 'flow' && a.name === from && (a.name = to));
  deck.sections.forEach((s) => s.cues.forEach((c) => rename(c.actions)));
  Object.values(deck.flows).forEach(rename);
  setDirty();
  renderEdit();
});

const move = (arr, i, d) => {
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
};

$('edit').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const si = Number(b.dataset.si);
  const ci = Number(b.dataset.ci);
  const secs = deck.sections;
  switch (b.dataset.act) {
    case 'sec-add': secs.push({ title: `段落 ${secs.length + 1}`, notes: '', cues: [] }); break;
    case 'sec-up': move(secs, si, -1); break;
    case 'sec-down': move(secs, si, 1); break;
    case 'sec-del':
      if (secs[si].cues.length && !confirm(`刪除「${secs[si].title}」和裡面的 ${secs[si].cues.length} 個步驟？`)) return;
      secs.splice(si, 1);
      break;
    case 'cue-add': secs[si].cues.push({ label: uniqueLabel(si, '新步驟'), actions: [] }); break;
    case 'cue-up': move(secs[si].cues, ci, -1); break;
    case 'cue-down': move(secs[si].cues, ci, 1); break;
    case 'cue-del': {
      // 講稿裡指向這一步的觸發點一起拿掉
      const label = secs[si].cues[ci].label;
      secs[si].notes = removeMarker(secs[si].notes, label);
      secs[si].cues.splice(ci, 1);
      break;
    }
    case 'cue-insert': insertMarker(si, secs[si].cues[ci].label); break;
    case 'pick-insert': return startPick({ si, insertAt: caret.get(si) ?? secs[si].notes.length });
    case 'cue-test': return testActions(secs[si].cues[ci].actions, secs[si].cues[ci].label);
    case 'pick-new': return startPick({ si });
    case 'pick-append': return startPick({ si, ci });
    case 'flow-add': {
      let name = '新流程';
      for (let k = 2; deck.flows[name]; k++) name = `新流程 ${k}`;
      deck.flows[name] = [{ do: 'wait', ms: 300 }];
      break;
    }
    case 'flow-del': {
      const name = b.dataset.flow;
      const used = flat().some((f) => f.cue.actions.some((a) => a.do === 'flow' && a.name === name));
      if (used && !confirm(`還有步驟在呼叫「${name}」，確定刪除？`)) return;
      delete deck.flows[name];
      badFlows.delete(name);
      break;
    }
    default: return;
  }
  setDirty();
  renderEdit();
});

async function testActions(actions, label) {
  if (!actions.length) return setLog('這一步還沒有動作', 'error');
  setLog(`試跑：${label}`);
  const r = await window.cue.run({ actions, flows: deck.flows, target: deck.target });
  setLog(r.ok ? `✓ 試跑成功：${label}` : r.error, r.ok ? 'ok' : 'error');
}

async function save(saveAs = false) {
  if (!deck) return;
  const badCues = flat().filter((f) => badDsl.has(f.cue)).map((f) => f.cue.label);
  if (badCues.length || badFlows.size) {
    setLog(`還有指令沒寫對，先修正再存：${[...badCues, ...badFlows.keys()].join('、')}`, 'error');
    return;
  }
  const r = await window.cue.saveDeck({ deck, saveAs });
  if (!r) return;
  loadDoc(r, { keepPosition: true });
  setLog(`已儲存 ${r.name}`, 'ok');
}

// ---------- 從頁面選取元素 ----------

const KINDS = [
  { id: 'click', name: '點擊', desc: '切頁籤、按按鈕' },
  { id: 'scroll', name: '捲動到這裡', desc: '捲到畫面中央' },
  { id: 'highlight', name: '強調框', desc: '捲過去並框起來' },
  { id: 'clickhl', name: '點擊並強調', desc: '點完再框結果' },
  { id: 'type', name: '輸入文字', desc: '逐字打進輸入框', inputOnly: true },
];

let pick = null; // 目前選取面板的狀態

function openSheet(html) {
  $('sheet').innerHTML = html;
  $('sheet-wrap').hidden = false;
}
function closeSheet() {
  $('sheet-wrap').hidden = true;
  pick = null;
}

async function startPick(dest) {
  if (!deck) return;
  if (!deck.sections.length) deck.sections.push({ title: '開場', notes: '', cues: [] });
  openSheet(`<div class="waiting"><span class="radar">${icon('crosshair')}</span>
    <div>到 Demo Chrome 點一下要使用的元素<br><small>滑鼠移過去會出現藍框；按 Esc 取消</small></div>
    <button class="btn" id="pick-cancel">取消</button></div>`);
  $('pick-cancel').onclick = () => window.cue.pickCancel();
  const r = await window.cue.pick({ target: deck.target });
  if (!r.ok) {
    closeSheet();
    return setLog(r.error, 'error');
  }
  if (!r.picked) return closeSheet();
  const p = r.picked;
  const kind = p.isInput ? 'type' : /^(button|a|summary|label|input)$/.test(p.tag) ? 'click' : 'highlight';
  pick = { dest, p, kind, loc: 'selector', selector: p.selector, caption: '', typeText: '', label: p.text || '', si: dest.si };
  renderPickSheet();
}

function pickActions() {
  const loc = pick.loc === 'text' && pick.p.text ? { text: pick.p.text } : { selector: pick.selector.trim() };
  const hl = { do: 'highlight', ...loc, ...(pick.caption.trim() ? { caption: pick.caption.trim() } : {}) };
  switch (pick.kind) {
    case 'click': return [{ do: 'click', ...loc }];
    case 'scroll': return [{ do: 'scroll', ...loc }];
    case 'highlight': return [hl];
    case 'clickhl': return [{ do: 'click', ...loc }, { do: 'wait', ms: 400 }, hl];
    case 'type': return [{ do: 'type', selector: pick.selector.trim(), text: pick.typeText }];
    default: return [];
  }
}

function defaultLabel() {
  const sel = pick.selector.trim();
  const what = pick.p.text ? `「${pick.p.text}」` : sel.length <= 28 ? sel : pick.p.tag;
  return { click: `點 ${what}`, scroll: `看 ${what}`, highlight: `強調 ${what}`, clickhl: `點 ${what}`, type: `輸入 ${pick.typeText || '文字'}` }[pick.kind];
}

function renderPickSheet() {
  const appending = pick.dest.ci !== undefined;
  const target = appending ? deck.sections[pick.dest.si].cues[pick.dest.ci] : null;
  const kinds = KINDS.filter((k) => !k.inputOnly || pick.p.isInput)
    .map((k) => `<button class="choice ${pick.kind === k.id ? 'on' : ''}" data-kind="${k.id}"><b>${k.name}</b><small>${k.desc}</small></button>`)
    .join('');
  const canText = !!pick.p.text && pick.kind !== 'type';
  openSheet(`
    <h3>${icon('crosshair')}${appending ? `加到「${esc(target.label)}」` : pick.dest.insertAt !== undefined ? '新增講稿觸發點' : '新增步驟'}</h3>
    <div class="choices">${kinds}</div>
    <div class="field"><span>定位方式</span>
      ${canText ? `<div class="loc"><button data-loc="selector" class="${pick.loc === 'selector' ? 'on' : ''}">CSS selector</button><button data-loc="text" class="${pick.loc === 'text' ? 'on' : ''}">畫面文字「${esc(pick.p.text)}」</button></div>` : ''}
      ${pick.loc === 'selector' || !canText ? `<input class="input mono" id="pk-selector" value="${esc(pick.selector)}">` : ''}
    </div>
    ${pick.kind === 'type' ? `<div class="field"><span>要輸入的文字</span><input class="input" id="pk-type" value="${esc(pick.typeText)}"></div>` : ''}
    ${pick.kind === 'highlight' || pick.kind === 'clickhl' ? `<div class="field"><span>強調框說明（選填，觀眾看得到）</span><input class="input" id="pk-caption" value="${esc(pick.caption)}" placeholder="例如：這裡就是校正後的結果"></div>` : ''}
    ${appending ? '' : `
      <div class="field"><span>按鈕文字</span><input class="input" id="pk-label" value="${esc(pick.label || defaultLabel())}"></div>
      ${pick.dest.insertAt !== undefined ? '' : `<div class="field"><span>放在段落</span><select class="select" id="pk-section">${deck.sections.map((s, i) => `<option value="${i}" ${i === pick.si ? 'selected' : ''}>${pad(i + 1)}　${esc(s.title)}</option>`).join('')}</select></div>`}`}
    <div class="hint" id="pk-summary">${esc(summary(pickActions()))}</div>
    <div class="sheet-actions">
      <button class="btn" id="pk-again">${icon('crosshair')}重新選取</button>
      <span class="grow"></span>
      <button class="btn" id="pk-cancel">取消</button>
      <button class="btn accent" id="pk-test">${icon('play')}試跑</button>
      <button class="btn solid" id="pk-add">${icon('plus')}加入</button>
    </div>`);

  const sync = () => {
    if ($('pk-selector')) pick.selector = $('pk-selector').value;
    if ($('pk-type')) pick.typeText = $('pk-type').value;
    if ($('pk-caption')) pick.caption = $('pk-caption').value;
    if ($('pk-label')) pick.label = $('pk-label').value;
    if ($('pk-section')) pick.si = Number($('pk-section').value);
    $('pk-summary').textContent = summary(pickActions());
  };
  $('sheet').oninput = sync;
  $('sheet').onchange = sync;
  $('sheet').querySelectorAll('[data-kind]').forEach((b) => (b.onclick = () => {
    sync();
    const wasDefault = !pick.label || pick.label === defaultLabel();
    pick.kind = b.dataset.kind;
    if (wasDefault) pick.label = '';
    renderPickSheet();
  }));
  $('sheet').querySelectorAll('[data-loc]').forEach((b) => (b.onclick = () => {
    sync();
    pick.loc = b.dataset.loc;
    renderPickSheet();
  }));
  $('pk-cancel').onclick = closeSheet;
  $('pk-again').onclick = () => startPick(pick.dest);
  $('pk-test').onclick = () => {
    sync();
    testActions(pickActions(), '選取的元素');
  };
  $('pk-add').onclick = () => {
    sync();
    const actions = pickActions();
    const err = actions.map((a) => window.model.validateAction(a, deck.flows)).find(Boolean);
    if (err) return setLog(err, 'error');
    let si = pick.si;
    let ci;
    if (appending) {
      ({ si, ci } = pick.dest);
      deck.sections[si].cues[ci].actions.push(...actions);
    } else {
      const label = uniqueLabel(si, (pick.label || defaultLabel()).trim());
      deck.sections[si].cues.push({ label, actions });
      ci = deck.sections[si].cues.length - 1;
      if (pick.dest.insertAt !== undefined) {
        // 從講稿游標處發起的選取：步驟建好後，把觸發點插回講稿原本的位置
        const at = pick.dest.insertAt;
        closeSheet();
        insertMarker(si, label, at);
        return setLog('已加入並插入講稿，記得儲存（Ctrl+S）', 'ok');
      }
    }
    closeSheet();
    setDirty();
    renderEdit();
    $('edit').querySelector(`.ecue[data-si="${si}"][data-ci="${ci}"]`)?.scrollIntoView({ block: 'center' });
    setLog('已加入，記得儲存（Ctrl+S）', 'ok');
  };
}

// ---------- 模式、工具列、選單 ----------

function setMode(m) {
  mode = m;
  $('mode-present').classList.toggle('on', m === 'present');
  $('mode-edit').classList.toggle('on', m === 'edit');
  $('present').hidden = m !== 'present';
  $('edit').hidden = m !== 'edit';
  $('foot').querySelector('.progress').hidden = m !== 'present';
  $('btn-prev').hidden = m !== 'present';
  $('btn-next').hidden = m !== 'present';
  $('pos').hidden = m !== 'present';
  $('btn-pick').hidden = m !== 'edit';
  $('btn-save').hidden = m !== 'edit';
  renderAll();
}

$('mode-present').onclick = () => setMode('present');
$('mode-edit').onclick = () => setMode('edit');
$('btn-save').onclick = () => save();
$('btn-pick').onclick = () => startPick({ si: Math.max(0, flat()[current]?.si ?? deck.sections.length - 1) });
$('btn-next').onclick = () => step('next');
$('btn-prev').onclick = () => step('prev');
$('present').addEventListener('click', (e) => {
  const b = e.target.closest('[data-run]');
  if (b) runCue(Number(b.dataset.run));
});
$('btn-chrome').onclick = async () => {
  const r = await window.cue.launchChrome(deck?.target);
  setLog(r.ok ? '已啟動 Demo 用 Chrome，請在那個視窗 demo' : r.error, r.ok ? 'ok' : 'error');
};
document.querySelectorAll('[data-win]').forEach((b) => (b.onclick = () => {
  if (b.dataset.win === 'close' && dirty && !confirm('有尚未儲存的變更，確定關閉？')) return;
  window.cue.window(b.dataset.win);
}));

$('btn-menu').onclick = (e) => {
  e.stopPropagation();
  $('menu').hidden = !$('menu').hidden;
};
document.addEventListener('click', () => ($('menu').hidden = true));
$('menu').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-menu]');
  if (!b) return;
  const act = b.dataset.menu;
  if ((act === 'open' || act === 'new') && dirty && !confirm('有尚未儲存的變更，確定要換劇本？')) return;
  if (act === 'open') {
    const r = await window.cue.openDeck();
    if (r) setLog(`已匯入 ${r.name}`, 'ok');
  }
  if (act === 'new') {
    const r = await window.cue.newDeck();
    if (r) setMode('edit');
  }
  if (act === 'saveas') save(true);
  if (act === 'reveal') window.cue.revealDeck();
  if (act === 'settings') $('settings').hidden = !$('settings').hidden;
  if (act === 'screens') {
    screensOpen = true;
    renderScreens(await window.cue.displays());
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    save(e.shiftKey);
    return;
  }
  if (e.key === 'Escape' && !$('sheet-wrap').hidden) {
    if (pick) closeSheet();
    else window.cue.pickCancel();
    return;
  }
  if (mode !== 'present' || e.target.closest('input, textarea, select')) return;
  // 焦點在 CueDeck 上時，方向鍵 / 空白鍵也能推進
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); step('next'); }
  if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); step('prev'); }
});

// ---------- 設定 ----------

function applySettings(s) {
  $('opacity').value = s.opacity;
  $('font').value = s.fontSize;
  $('protect').checked = s.protect;
  document.documentElement.style.setProperty('--fs', `${s.fontSize}px`);
  const pill = $('pill-shield');
  pill.classList.toggle('off', !s.protect);
  pill.innerHTML = `${icon(s.protect ? 'shield' : 'shield-off')}<b>${s.protect ? '隱形' : '可見'}</b>`;
  pill.title = s.protect ? '螢幕分享看不到這個視窗' : '注意：螢幕分享看得到這個視窗';
}

$('opacity').oninput = (e) => window.cue.set('opacity', Number(e.target.value));
$('font').oninput = (e) => {
  document.documentElement.style.setProperty('--fs', `${e.target.value}px`);
  window.cue.set('fontSize', Number(e.target.value));
};
$('protect').onchange = (e) => {
  window.cue.set('protect', e.target.checked);
  applySettings({ opacity: $('opacity').value, fontSize: $('font').value, protect: e.target.checked });
};

// ---------- HDMI / 投影 ----------
// 隱形擋不住 HDMI。延伸模式下 CueDeck 留在筆電、Chrome 放投影幕；同步顯示模式下觀眾一定看得到。

let screensOpen = false; // 使用者主動打開，或剛接上投影機時自動打開

function renderScreens(info) {
  const box = $('screens');
  if (!screensOpen && !info.cuedeckOnProjector) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.classList.toggle('warn', info.cuedeckOnProjector || !info.hasProjector);
  const close = `<button class="mini" id="scr-close" title="關閉">${icon('x')}</button>`;
  if (!info.hasProjector) {
    box.innerHTML = `<div class="scr-head">${icon('monitor')}<b>只偵測到一個螢幕</b>${close}</div>
      <p>如果已經接上 HDMI 卻只看到一個螢幕，代表 Windows 是「同步顯示」：投影幕和筆電是同一張畫面，<b>觀眾會看到 CueDeck</b>。</p>
      <p>請按 <kbd>Win</kbd><kbd>P</kbd> 改成「<b>延伸</b>」，CueDeck 留在筆電，Demo Chrome 放到投影幕。</p>`;
  } else {
    box.innerHTML = `<div class="scr-head">${icon('monitor')}<b>已偵測到投影幕（延伸模式）</b>${close}</div>
      ${info.cuedeckOnProjector ? '<p class="bad">CueDeck 目前在投影幕上，觀眾看得到！</p>' : '<p>CueDeck 在筆電螢幕上，觀眾看不到。只有放到投影幕上的視窗會被看見。</p>'}
      <div class="row-actions">
        <button class="btn solid" id="scr-chrome">${icon('globe')}Chrome 移到投影幕</button>
        <button class="btn ${info.cuedeckOnProjector ? 'accent' : ''}" id="scr-laptop">${icon('monitor')}CueDeck 移回筆電</button>
      </div>`;
    $('scr-chrome').onclick = async () => {
      const r = await window.cue.chromeToProjector(deck?.target);
      setLog(r.ok ? 'Demo Chrome 已移到投影幕並最大化' : r.error, r.ok ? 'ok' : 'error');
    };
    $('scr-laptop').onclick = () => window.cue.cuedeckToLaptop();
  }
  $('scr-close').onclick = () => {
    screensOpen = false;
    box.hidden = true;
  };
}

window.cue.on('displays', (info) => {
  if (info.justAdded && info.hasProjector) screensOpen = true;
  renderScreens(info);
});

// ---------- 主程序事件 ----------

window.cue.on('deck', (payload) => {
  // 外部編輯器改了檔案：手上有未存的修改就先問
  if (dirty && doc && payload.file === doc.file && !confirm('劇本檔在外部被修改了，要載入新版本並放棄目前的修改嗎？')) return;
  loadDoc(payload, { keepPosition: doc?.file === payload.file });
});
window.cue.on('shortcut', step);
window.cue.on('cdp', ({ connected }) => {
  const pill = $('pill-cdp');
  pill.classList.toggle('on', connected);
  pill.querySelector('b').textContent = connected ? 'Chrome' : '未連線';
  pill.title = connected ? 'Demo 用 Chrome 已連線' : '尚未連到 Demo 用 Chrome（按地球圖示啟動）';
  $('btn-chrome').classList.toggle('attn', !connected);
});

hydrateIcons();
window.cue.init().then(({ settings }) => applySettings(settings));
