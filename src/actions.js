// 動作執行：把結構化的動作物件（見 model.js 的 ACTIONS）在瀏覽器頁面上跑出來。
// 不依賴 Electron，方便單獨用 node 測試。

const { expandActions } = require('./model');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 在頁面內執行的小工具（會被序列化送進瀏覽器） ----

function pageFind(sel, text, within) {
  if (text == null) return document.querySelector(sel);
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const want = norm(text);
  const scope = within ? document.querySelector(within) || document : document;
  const pool = Array.from(scope.querySelectorAll('button, a, [role=tab], [role=button], summary, label, input[type=button], input[type=submit], h1, h2, h3, h4, h5, li, td, th, p, span, div'));
  const visible = (el) => el.getClientRects().length > 0;
  // 先找完全相符，再找包含；同樣條件下取最內層（字最短）的元素
  const exact = pool.filter((el) => visible(el) && norm(el.innerText || el.value) === want);
  const hits = exact.length ? exact : pool.filter((el) => visible(el) && norm(el.innerText || el.value).includes(want));
  hits.sort((a, b) => norm(a.innerText || a.value).length - norm(b.innerText || b.value).length);
  return hits[0] || null;
}

function pageHighlight(el, ms, caption) {
  const r = el.getBoundingClientRect();
  const wrap = document.createElement('div');
  wrap.setAttribute('data-cuedeck', 'highlight');
  Object.assign(wrap.style, {
    position: 'absolute',
    left: `${r.left + window.scrollX - 6}px`,
    top: `${r.top + window.scrollY - 6}px`,
    width: `${r.width + 12}px`,
    height: `${r.height + 12}px`,
    border: '2px solid #22d3ee',
    borderRadius: '10px',
    boxShadow: '0 0 0 9999px rgba(2,6,23,.38), 0 0 0 6px rgba(34,211,238,.18), 0 0 28px rgba(34,211,238,.55)',
    pointerEvents: 'none',
    zIndex: 2147483647,
    opacity: '0',
    transform: 'scale(1.04)',
    transition: 'opacity .25s ease, transform .25s ease',
  });
  if (caption) {
    const tag = document.createElement('div');
    tag.textContent = caption;
    const above = r.top > 48;
    Object.assign(tag.style, {
      position: 'absolute',
      left: '-2px',
      [above ? 'bottom' : 'top']: 'calc(100% + 8px)',
      maxWidth: '420px',
      padding: '6px 12px',
      borderRadius: '8px',
      background: 'linear-gradient(135deg,#0ea5e9,#6366f1)',
      color: '#fff',
      font: '600 14px/1.4 "Segoe UI","Microsoft JhengHei",system-ui,sans-serif',
      boxShadow: '0 6px 20px rgba(2,6,23,.35)',
      whiteSpace: 'normal',
    });
    wrap.appendChild(tag);
  }
  document.body.appendChild(wrap);
  requestAnimationFrame(() => {
    wrap.style.opacity = '1';
    wrap.style.transform = 'scale(1)';
  });
  setTimeout(() => { wrap.style.opacity = '0'; }, ms);
  setTimeout(() => wrap.remove(), ms + 300);
}

// ---- 動作 ----

async function find(ctx, a) {
  const handle = await ctx.page.evaluateHandle(pageFind, a.selector ?? null, a.text ?? null, a.within ?? null);
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    throw new Error(a.selector ? `找不到元素：${a.selector}` : `找不到含有「${a.text}」的元素`);
  }
  return el;
}

async function reveal(el, block = 'center') {
  const moved = await el.evaluate((node, b) => {
    const r = node.getBoundingClientRect();
    const inView = r.top >= 0 && r.bottom <= window.innerHeight;
    if (!inView || b !== 'center') node.scrollIntoView({ behavior: 'smooth', block: b });
    return !inView || b !== 'center';
  }, block);
  if (moved) await sleep(550);
}

const RUNNERS = {
  async goto(ctx, a) {
    const url = new URL(a.url, ctx.baseUrl || undefined).href;
    await ctx.page.goto(url, { waitUntil: 'domcontentloaded' });
  },
  async click(ctx, a) {
    const el = await find(ctx, a);
    await reveal(el);
    await el.evaluate((node) => node.click());
  },
  async type(ctx, a) {
    // type 的 text 是要輸入的內容，不拿來找元素
    const el = await find(ctx, { selector: a.selector });
    await reveal(el);
    await el.evaluate((node) => {
      node.focus();
      const proto = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(node, ''); else node.value = '';
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // 用真的鍵盤輸入，觀眾看得到打字過程，框架也收得到事件
    await el.type(String(a.text), { delay: ctx.typeDelay ?? 35 });
    await el.evaluate((node) => node.dispatchEvent(new Event('change', { bubbles: true })));
  },
  async press(ctx, a) {
    await ctx.page.keyboard.press(a.key);
  },
  async scroll(ctx, a) {
    const el = await find(ctx, a);
    await reveal(el, { top: 'start', center: 'center', bottom: 'end' }[a.align || 'center']);
  },
  async scrollTo(ctx, a) {
    await ctx.page.evaluate((y) => {
      const target = y === 'top' ? 0 : y === 'bottom' ? document.documentElement.scrollHeight : Number(y);
      window.scrollTo({ top: target, behavior: 'smooth' });
    }, a.y);
    await sleep(600);
  },
  async wait(ctx, a) {
    if (a.ms !== undefined) return sleep(Number(a.ms));
    await ctx.page.waitForSelector(a.selector, { visible: true, timeout: 15000 });
  },
  async waitText(ctx, a) {
    await ctx.page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 15000 }, a.text);
  },
  async highlight(ctx, a) {
    const el = await find(ctx, a);
    await reveal(el);
    await el.evaluate(pageHighlight, a.ms ?? 2500, a.caption ?? '');
  },
  async eval(ctx, a) {
    await ctx.page.evaluate(a.code);
  },
  back: (ctx) => ctx.page.goBack(),
  reload: (ctx) => ctx.page.reload({ waitUntil: 'domcontentloaded' }),
};

async function runActions(ctx, actions, flows = {}) {
  const steps = expandActions(actions, flows);
  for (const a of steps) {
    ctx.onStep?.(a);
    try {
      await RUNNERS[a.do](ctx, a);
    } catch (err) {
      throw new Error(`${a.do} 失敗：${err.message}`);
    }
    // 動作之間留一點空檔，讓頁面的動畫與重繪跟得上
    await sleep(ctx.stepGap ?? 150);
  }
}

module.exports = { runActions, pageHighlight };
