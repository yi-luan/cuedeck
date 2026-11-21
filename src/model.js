// CueDeck 資料模型：deck JSON 的驗證、指令列（DSL）與動作物件互轉、Markdown 講稿匯入。
//
// Deck 格式（完整定義見 schema/cuedeck.schema.json）：
// {
//   "cuedeck": 1,
//   "title": "Project02 Demo",
//   "target": "http://localhost:3002",
//   "sections": [
//     { "title": "開場", "notes": "Markdown 講稿", "cues": [
//       { "label": "開啟首頁", "actions": [ { "do": "goto", "url": "/" } ] }
//     ] }
//   ],
//   "flows": { "搜尋示範": [ { "do": "click", "text": "檢索與拼字校正" } ] }
// }

const FORMAT_VERSION = 1;

// 每種動作需要的欄位：one = 至少要有其中一個，req = 全部都要有
const ACTIONS = {
  goto: { req: ['url'], label: '開啟網址' },
  click: { one: ['selector', 'text'], label: '點擊' },
  type: { req: ['selector', 'text'], label: '輸入文字' },
  press: { req: ['key'], label: '按鍵' },
  scroll: { one: ['selector', 'text'], label: '捲動到' },
  scrollTo: { req: ['y'], label: '捲動到位置' },
  wait: { one: ['ms', 'selector'], label: '等待' },
  waitText: { req: ['text'], label: '等待文字出現' },
  highlight: { one: ['selector', 'text'], label: '強調框' },
  eval: { req: ['code'], label: '執行 JavaScript' },
  back: { label: '上一頁' },
  reload: { label: '重新整理' },
  flow: { req: ['name'], label: '執行流程' },
};

// ---------- 驗證 ----------

function validateAction(a, flows) {
  if (!a || typeof a !== 'object') return '動作必須是物件';
  const spec = ACTIONS[a.do];
  if (!spec) return `不認得的動作：${a.do}`;
  for (const k of spec.req || []) if (a[k] === undefined || a[k] === '') return `${a.do} 缺少 ${k}`;
  if (spec.one && !spec.one.some((k) => a[k] !== undefined && a[k] !== '')) return `${a.do} 需要 ${spec.one.join(' 或 ')}`;
  if (a.do === 'flow' && flows && !flows[a.name]) return `沒有名為「${a.name}」的流程`;
  return null;
}

// 把外部讀進來的 JSON 整理成完整結構，並標出每個 cue 的錯誤（不丟例外，讓畫面能顯示哪裡錯）
function normalizeDeck(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') throw new Error('不是有效的 CueDeck 檔');
  if (raw.cuedeck && raw.cuedeck > FORMAT_VERSION) errors.push(`檔案格式版本 ${raw.cuedeck} 比這個程式新，部分功能可能不支援`);
  const flows = {};
  for (const [name, list] of Object.entries(raw.flows || {})) flows[name] = Array.isArray(list) ? list : [];
  const deck = {
    // 保留 $schema，VS Code 才會持續提供自動完成與檢查
    ...(raw.$schema ? { $schema: String(raw.$schema) } : {}),
    cuedeck: FORMAT_VERSION,
    title: String(raw.title || '未命名 Demo'),
    target: raw.target ? String(raw.target) : '',
    sections: (raw.sections || []).map((s) => ({
      title: String(s.title || ''),
      notes: String(s.notes || ''),
      cues: (s.cues || []).map((c) => ({ label: String(c.label || '未命名步驟'), actions: Array.isArray(c.actions) ? c.actions : [] })),
    })),
    flows,
  };
  for (const [name, list] of Object.entries(flows)) {
    list.forEach((a, i) => {
      const e = validateAction(a, flows);
      if (e) errors.push(`流程「${name}」第 ${i + 1} 個動作：${e}`);
    });
  }
  orderedCues(deck).forEach(({ cue: c }, i) => {
    const e = c.actions.length ? c.actions.map((a) => validateAction(a, flows)).find(Boolean) : '沒有任何動作';
    if (e) errors.push(`步驟 ${i + 1}「${c.label}」：${e}`);
  });
  deck.sections.forEach((s, si) => {
    for (const label of cueMarkers(s.notes)) {
      if (!s.cues.some((c) => c.label === label)) errors.push(`段落 ${si + 1}「${s.title}」的講稿裡有觸發點 {{${label}}}，但這個段落沒有同名的步驟`);
    }
    const seen = new Set();
    for (const c of s.cues) {
      if (seen.has(c.label)) errors.push(`段落 ${si + 1}「${s.title}」有兩個步驟都叫「${c.label}」，觸發點會分不出來`);
      seen.add(c.label);
    }
  });
  if (deck.target) {
    try {
      new URL(deck.target);
    } catch {
      errors.push(`target 不是有效網址：${deck.target}`);
    }
  }
  return { deck, errors };
}

// ---------- 講稿中的觸發點 ----------
// 段落講稿裡寫 {{步驟名稱}}，簡報時那個位置會變成可以點的駐點

const MARKER_RE = /\{\{([^{}\n]+?)\}\}/g;

// 依出現順序列出講稿裡的觸發點名稱（不重複）
function cueMarkers(notes) {
  const out = [];
  for (const m of String(notes || '').matchAll(MARKER_RE)) {
    const label = m[1].trim();
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

// 依講述順序列出所有步驟：每個段落先排講稿裡出現的觸發點，再排其餘步驟（「下一步」照這個順序推進）
function orderedCues(deck) {
  const out = [];
  deck.sections.forEach((s, si) => {
    const used = new Set();
    for (const label of cueMarkers(s.notes)) {
      const ci = s.cues.findIndex((c) => c.label === label);
      if (ci >= 0 && !used.has(ci)) {
        used.add(ci);
        out.push({ si, ci, cue: s.cues[ci], inline: true });
      }
    }
    s.cues.forEach((c, ci) => used.has(ci) || out.push({ si, ci, cue: c, inline: false }));
  });
  return out;
}

const flatCues = orderedCues;

// 步驟改名時，把講稿裡的觸發點一起改掉
const renameMarker = (notes, from, to) => String(notes || '').replace(MARKER_RE, (m, label) => (label.trim() === from ? `{{${to}}}` : m));

// ---------- JSONC（允許 // 與 /* */ 註解的 JSON） ----------

function stripJsonComments(text) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === '/' && n === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else {
      out += c;
    }
  }
  // 允許最後一個元素後面多一個逗號（JSONC 常見寫法）
  return out.replace(/,(\s*[}\]])/g, '$1');
}

// 把檔案切成「開頭註解 / JSON 本體 / 結尾註解」，存檔時保留前後的註解（說明文件與範例）
// 註解裡也可能有 { }（例如範例程式碼），所以要跳過註解與字串，找出真正的 JSON 本體頭尾
function splitEnvelope(text) {
  let start = -1;
  let depth = 0;
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (c === '/' && n === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else if (c === '"') {
      inStr = true;
    } else if (c === '{' || c === '[') {
      if (depth === 0 && start < 0) start = i;
      depth++;
    } else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0 && start >= 0) return { head: text.slice(0, start), body: text.slice(start, i + 1), tail: text.slice(i + 1) };
    }
  }
  return { head: '', body: text, tail: '' };
}

const parseDeckText = (text) => JSON.parse(stripJsonComments(text.replace(/^﻿/, '')));


// 把 flow 展開成單純的動作清單
function expandActions(actions, flows, depth = 0) {
  if (depth > 10) throw new Error('流程巢狀太深，可能互相呼叫');
  const out = [];
  for (const a of actions) {
    const e = validateAction(a, flows);
    if (e) throw new Error(e);
    if (a.do === 'flow') out.push(...expandActions(flows[a.name], flows, depth + 1));
    else out.push(a);
  }
  return out;
}

// ---------- 指令列 DSL ⇄ 動作物件 ----------
// 給進階使用者在編輯器裡快速打字用，例如：
//   click #search-btn; wait 800; highlight #result "這就是結果"

function tokenize(line) {
  const tokens = [];
  const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line))) {
    if (m[1] !== undefined) tokens.push({ v: m[1].replace(/\\(.)/g, '$1'), q: true });
    else if (m[2] !== undefined) tokens.push({ v: m[2].replace(/\\(.)/g, '$1'), q: true });
    else tokens.push({ v: m[3], q: false });
  }
  return tokens;
}

// 依「;」與換行切指令，但引號內的「;」不切
function splitCommands(src) {
  const out = [];
  let buf = '';
  let quote = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { buf += c + (src[++i] ?? ''); continue; }
      if (c === quote) quote = null;
      buf += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      buf += c;
    } else if (c === ';' || c === '\n') {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
    } else {
      buf += c;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter((l) => !l.startsWith('//'));
}

const isNum = (t) => t && !t.q && /^\d+$/.test(t.v);
const plain = (toks) => toks.filter((t) => !t.q).map((t) => t.v).join(' ');
const quoted = (toks) => toks.filter((t) => t.q).map((t) => t.v);

function parseLine(line) {
  const [head, ...rest] = tokenize(line);
  const cmd = head.v.toLowerCase();
  const a = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));
  const popMs = () => (isNum(rest[rest.length - 1]) && rest.length > 1 ? Number(rest.pop().v) : undefined);
  switch (cmd) {
    case 'goto': return a({ do: 'goto', url: rest[0]?.v });
    case 'click': return a({ do: 'click', selector: plain(rest) });
    case 'clicktext': return a({ do: 'click', text: rest[0]?.v, within: plain(rest.slice(1)) });
    case 'type': return a({ do: 'type', selector: plain(rest), text: quoted(rest).pop() });
    case 'press': return a({ do: 'press', key: rest[0]?.v });
    case 'scroll': {
      const align = ['top', 'center', 'bottom'].includes(rest[rest.length - 1]?.v) && rest.length > 1 ? rest.pop().v : undefined;
      return a({ do: 'scroll', selector: plain(rest), align });
    }
    case 'scrolltext': return a({ do: 'scroll', text: rest[0]?.v });
    case 'scrollto': return a({ do: 'scrollTo', y: /^\d+$/.test(rest[0]?.v) ? Number(rest[0].v) : rest[0]?.v });
    case 'wait': return isNum(rest[0]) ? { do: 'wait', ms: Number(rest[0].v) } : a({ do: 'wait', selector: plain(rest) });
    case 'waittext': return a({ do: 'waitText', text: rest[0]?.v });
    case 'highlight': {
      const ms = popMs();
      return a({ do: 'highlight', selector: plain(rest), caption: quoted(rest)[0], ms });
    }
    case 'highlighttext': {
      const ms = popMs();
      const [text, caption] = quoted(rest);
      return a({ do: 'highlight', text, caption, ms });
    }
    case 'eval': return a({ do: 'eval', code: rest.map((t) => t.v).join(' ') });
    case 'back': return { do: 'back' };
    case 'reload': return { do: 'reload' };
    case 'flow': return a({ do: 'flow', name: rest.map((t) => t.v).join(' ') });
    default: throw new Error(`不認得的指令：${head.v}`);
  }
}

const parseDsl = (src) => splitCommands(src).map(parseLine);

const q = (s) => `"${String(s).replace(/["\\]/g, '\\$&')}"`;

function actionToDsl(a) {
  switch (a.do) {
    case 'goto': return `goto ${a.url}`;
    case 'click': return a.selector ? `click ${a.selector}` : `clicktext ${q(a.text)}${a.within ? ` ${a.within}` : ''}`;
    case 'type': return `type ${a.selector} ${q(a.text)}`;
    case 'press': return `press ${a.key}`;
    case 'scroll': return a.selector ? `scroll ${a.selector}${a.align ? ` ${a.align}` : ''}` : `scrolltext ${q(a.text)}`;
    case 'scrollTo': return `scrollto ${a.y}`;
    case 'wait': return a.ms !== undefined ? `wait ${a.ms}` : `wait ${a.selector}`;
    case 'waitText': return `waittext ${q(a.text)}`;
    case 'highlight': {
      const tail = `${a.caption ? ` ${q(a.caption)}` : ''}${a.ms ? ` ${a.ms}` : ''}`;
      return a.selector ? `highlight ${a.selector}${tail}` : `highlighttext ${q(a.text)}${tail}`;
    }
    case 'eval': return `eval ${q(a.code)}`;
    case 'flow': return `flow ${a.name}`;
    default: return a.do;
  }
}

const toDsl = (actions) => actions.map(actionToDsl).join('; ');

// 人看得懂的一行摘要（顯示在步驟下方）
function describe(a) {
  const spec = ACTIONS[a.do];
  if (!spec) return a.do;
  const target = a.text ? `「${a.text}」` : a.selector || a.url || a.key || a.name || (a.ms !== undefined ? `${a.ms} ms` : '') || (a.y ?? '');
  return `${spec.label} ${target}`.trim();
}

// ---------- Markdown 講稿匯入（舊版格式） ----------
// ## 標題 → 段落；[[文字|指令]] 與 ```cue 文字``` → 步驟；```flow 名稱``` → 流程

function importMarkdown(text) {
  let body = text.replace(/\r\n/g, '\n');
  const meta = {};
  const fm = body.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const m = line.match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/);
      if (m) meta[m[1]] = m[2];
    }
    body = body.slice(fm[0].length);
  }
  const flows = {};
  body = body.replace(/^```flow[ \t]+(\S+)[^\n]*\n([\s\S]*?)^```[ \t]*$/gm, (_, name, src) => {
    flows[name] = parseDsl(src);
    return '';
  });

  const sections = [];
  let cur = null;
  let title = meta.title;
  const ensure = () => cur || (sections.push((cur = { title: '', notes: '', cues: [] })), cur);
  const cueRe = /^```cue[ \t]+([^\n]+)\n([\s\S]*?)^```[ \t]*$|\[\[([^\]|\n]+)\|([^\n]+?)\]\](?!\])/gm;

  // 先把 cue 區塊換成佔位符，再逐行切段落
  const cues = [];
  body = body.replace(cueRe, (_, bl, bs, l, act) => {
    cues.push(bl !== undefined ? { label: bl.trim(), actions: parseDsl(bs) } : { label: l.trim(), actions: parseDsl(act) });
    return `\u0000${cues.length - 1}\u0000`;
  });
  for (const line of body.split('\n')) {
    const h1 = line.match(/^#\s+(.*)/);
    const h2 = line.match(/^##+\s+(.*)/);
    if (h1 && !title) { title = h1[1].trim(); continue; }
    if (h1) continue;
    if (h2) {
      sections.push((cur = { title: h2[1].trim(), notes: '', cues: [] }));
      continue;
    }
    const sec = ensure();
    // 按鈕原本在講稿哪裡，就在那裡留一個 {{名稱}} 觸發點
    const withMarkers = line.replace(/\u0000(\d+)\u0000/g, (_, i) => {
      const cue = cues[Number(i)];
      sec.cues.push(cue);
      return `{{${cue.label}}}`;
    });
    if (withMarkers.trim() || sec.notes) sec.notes += `${withMarkers.trimEnd()}\n`;
  }
  for (const s of sections) s.notes = s.notes.replace(/\n{3,}/g, '\n\n').trim();
  return { cuedeck: FORMAT_VERSION, title: title || '匯入的講稿', target: meta.target || '', sections: sections.filter((s) => s.title || s.notes || s.cues.length), flows };
}

module.exports = { FORMAT_VERSION, ACTIONS, validateAction, normalizeDeck, flatCues, orderedCues, cueMarkers, renameMarker, stripJsonComments, splitEnvelope, parseDeckText, expandActions, tokenize, splitCommands, parseDsl, toDsl, actionToDsl, describe, importMarkdown };
