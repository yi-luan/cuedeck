// DOM 選取器：注入到 Demo 頁面裡，滑鼠移過去會框出元素，點一下就回傳一個穩定的 selector。
// 整個函式會被序列化後在頁面中執行，所以裡面不能用到外部變數。

function installPicker(binding) {
  if (window.__cuedeckPickerStop) window.__cuedeckPickerStop();

  const ACCENT = '#22d3ee';
  const root = document.createElement('div');
  root.setAttribute('data-cuedeck', 'picker');
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
  const box = document.createElement('div');
  box.style.cssText = `position:fixed;border:2px solid ${ACCENT};background:rgba(34,211,238,.12);border-radius:6px;box-shadow:0 0 0 1px rgba(2,6,23,.4),0 0 18px rgba(34,211,238,.45);transition:all .06s linear;display:none;`;
  const tip = document.createElement('div');
  tip.style.cssText = 'position:fixed;max-width:520px;padding:5px 10px;border-radius:6px;background:#0b1220;color:#e2e8f0;font:12px/1.45 ui-monospace,Consolas,monospace;box-shadow:0 6px 20px rgba(0,0,0,.35);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:none;';
  const bar = document.createElement('div');
  bar.textContent = 'CueDeck 選取模式：點一下要使用的元素　·　Esc 取消';
  bar.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);padding:8px 16px;border-radius:999px;background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff;font:600 13px/1.4 "Segoe UI","Microsoft JhengHei",system-ui,sans-serif;box-shadow:0 8px 24px rgba(2,6,23,.35);';
  root.append(box, tip, bar);
  document.documentElement.appendChild(root);

  const unique = (sel) => {
    try {
      return document.querySelectorAll(sel).length === 1;
    } catch {
      return false;
    }
  };
  // 自動產生的 id / class（含長串數字或 hash）不穩定，不拿來用
  const looksGenerated = (s) => /\d{3,}|[a-f0-9]{6,}|^(css|sc|jsx|ember|ng|react|svelte)-|__/i.test(s);
  const STABLE_ATTRS = ['data-testid', 'data-test', 'data-cy', 'data-qa', 'name', 'aria-label', 'placeholder', 'title', 'for', 'href'];

  function segment(el) {
    const tag = el.tagName.toLowerCase();
    if (el.id && !looksGenerated(el.id)) return { sel: `#${CSS.escape(el.id)}`, strong: true };
    const attrs = [...STABLE_ATTRS, ...Array.from(el.attributes).map((a) => a.name).filter((n) => n.startsWith('data-') && !STABLE_ATTRS.includes(n))];
    for (const name of attrs) {
      const v = el.getAttribute(name);
      if (v && v.length <= 60 && !looksGenerated(v)) {
        const sel = `${tag}[${name}="${CSS.escape(v)}"]`;
        if (unique(sel)) return { sel, strong: true };
      }
    }
    const classes = Array.from(el.classList).filter((c) => !looksGenerated(c) && !/^(active|selected|hover|focus|open|is-|has-)/.test(c));
    for (const c of classes) {
      const sel = `${tag}.${CSS.escape(c)}`;
      if (unique(sel)) return { sel, strong: true };
    }
    let sel = classes.length ? `${tag}.${CSS.escape(classes[0])}` : tag;
    const parent = el.parentElement;
    if (parent) {
      const same = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
      if (same.length > 1) sel += `:nth-of-type(${same.indexOf(el) + 1})`;
    }
    return { sel, strong: false };
  }

  // 由下往上組 selector，直到整條路徑在頁面上唯一
  function selectorFor(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      const seg = segment(node);
      parts.unshift(seg.sel);
      const sel = parts.join(' > ');
      if (unique(sel)) {
        // 嘗試把中間層拿掉，讓 selector 短一點、比較不怕版面調整
        if (parts.length > 2) {
          const short = `${parts[0]} ${parts[parts.length - 1]}`;
          if (unique(short) && document.querySelector(short) === el) return short;
        }
        return sel;
      }
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  const textOf = (el) => (el.innerText || el.value || '').replace(/\s+/g, ' ').trim();

  let current = null;
  function onMove(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || root.contains(el) || el === current) return;
    current = el;
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { display: 'block', left: `${r.left - 2}px`, top: `${r.top - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px` });
    tip.textContent = selectorFor(el);
    tip.style.display = 'block';
    tip.style.left = `${Math.max(4, Math.min(r.left, innerWidth - 530))}px`;
    tip.style.top = `${r.bottom + 30 < innerHeight ? r.bottom + 6 : Math.max(4, r.top - 30)}px`;
  }
  function swallow(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }
  function onClick(e) {
    swallow(e);
    const el = current || document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    const text = textOf(el);
    const tag = el.tagName.toLowerCase();
    const result = {
      selector: selectorFor(el),
      text: text.length && text.length <= 40 ? text : '',
      tag,
      isInput: tag === 'input' || tag === 'textarea' || el.isContentEditable,
      url: location.href,
    };
    stop();
    window[binding]?.(result);
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      swallow(e);
      stop();
      window[binding]?.(null);
    }
  }
  function stop() {
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('mousedown', swallow, true);
    window.removeEventListener('mouseup', swallow, true);
    window.removeEventListener('keydown', onKey, true);
    root.remove();
    delete window.__cuedeckPickerStop;
  }
  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('mousedown', swallow, true);
  window.addEventListener('mouseup', swallow, true);
  window.addEventListener('keydown', onKey, true);
  window.__cuedeckPickerStop = stop;
}

module.exports = { installPicker };
