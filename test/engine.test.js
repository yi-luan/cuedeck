// 資料模型與動作引擎測試（用無頭 Chrome）：npm test
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const model = require('../src/model');
const { runActions } = require('../src/actions');
const { installPicker } = require('../src/picker');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));

const PAGE = `<!doctype html><meta charset="utf-8">
<nav><button data-tab="a">分頁 A</button><button data-tab="b">詞向量 Word2Vec</button></nav>
<div class="card"><span>說明</span></div><div class="card"><span id="x123456">第二張</span></div>
<div style="height:3000px"></div>
<input id="q" name="query"><button id="go" onclick="document.getElementById('out').textContent='查詢:'+document.getElementById('q').value">搜尋</button>
<div id="out"></div>
<script>document.querySelector('[data-tab=b]').onclick=()=>document.body.dataset.tab='b'</script>`;

(async () => {
  // ---- DSL ⇄ 動作物件 ----
  const dsl = 'click #step-switch button[data-step="BC"]; highlight #zipf-chart "頭部下降" 3000; clicktext "CBOW"; type #q "a;b"; wait 500; flow 搜尋';
  const actions = model.parseDsl(dsl);
  assert.deepStrictEqual(actions, [
    { do: 'click', selector: '#step-switch button[data-step="BC"]' },
    { do: 'highlight', selector: '#zipf-chart', caption: '頭部下降', ms: 3000 },
    { do: 'click', text: 'CBOW' },
    { do: 'type', selector: '#q', text: 'a;b' },
    { do: 'wait', ms: 500 },
    { do: 'flow', name: '搜尋' },
  ]);
  assert.deepStrictEqual(model.parseDsl(model.toDsl(actions)), actions, 'DSL 來回轉換要一致');
  console.log('✓ DSL 與動作物件可以互轉');

  // ---- 驗證 ----
  const { errors } = model.normalizeDeck({ title: 't', sections: [{ title: 's', cues: [{ label: 'a', actions: [{ do: 'click' }] }, { label: 'b', actions: [{ do: 'flow', name: 'nope' }] }] }] });
  assert.strictEqual(errors.length, 2);
  assert.match(errors[0], /需要 selector 或 text/);
  assert.match(errors[1], /沒有名為「nope」/);
  const sample = model.normalizeDeck(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'decks', 'project02-demo.cuedeck.json'), 'utf8')));
  assert.deepStrictEqual(sample.errors, []);
  assert.strictEqual(sample.deck.$schema, '../schema/cuedeck.schema.json');
  console.log(`✓ 驗證：範例劇本 ${model.flatCues(sample.deck).length} 個步驟無錯誤，錯誤的動作會被指出`);

  // ---- 講稿觸發點 ----
  const inline = {
    title: 't',
    sections: [{ title: 's', notes: '先講 {{B}}，再講 {{ A }}，又提到 {{B}}', cues: [{ label: 'A', actions: [{ do: 'wait', ms: 1 }] }, { label: 'B', actions: [{ do: 'wait', ms: 1 }] }, { label: 'C', actions: [{ do: 'wait', ms: 1 }] }] }],
  };
  assert.deepStrictEqual(model.orderedCues(inline).map((f) => `${f.cue.label}${f.inline ? '*' : ''}`), ['B*', 'A*', 'C'], '依講稿順序，沒寫進講稿的排最後');
  assert.strictEqual(model.renameMarker(inline.sections[0].notes, 'B', 'B2'), '先講 {{B2}}，再講 {{ A }}，又提到 {{B2}}');
  const missing = model.normalizeDeck({ title: 't', sections: [{ title: 's', notes: '{{不存在}}', cues: [{ label: 'x', actions: [{ do: 'wait', ms: 1 }] }, { label: 'x', actions: [{ do: 'wait', ms: 1 }] }] }] });
  assert.ok(missing.errors.some((e) => e.includes('{{不存在}}')), '指向不存在步驟的觸發點要報錯');
  assert.ok(missing.errors.some((e) => e.includes('兩個步驟都叫「x」')), '同段落重複的步驟名稱要報錯');
  console.log('✓ 講稿觸發點：依出現順序推進、改名同步、錯誤會被指出');

  // ---- JSONC 與新劇本範本 ----
  const { newDeckText } = require('../src/template');
  const tpl = newDeckText({ title: '新劇本', schema: '../schema/cuedeck.schema.json' });
  const parsedTpl = model.normalizeDeck(model.parseDeckText(tpl));
  assert.deepStrictEqual(parsedTpl.errors, []);
  assert.strictEqual(model.orderedCues(parsedTpl.deck)[0].inline, true, '範本示範講稿觸發點');
  const env = model.splitEnvelope(tpl);
  assert.ok(env.head.includes('{{步驟名稱}}') && env.head.includes('"do": "highlight"'), '開頭說明含觸發點與動作範例');
  assert.ok(env.body.startsWith('{') && env.body.endsWith('}'), '說明裡的大括號不能干擾切分');
  // 把說明裡註解起來的段落範例取消註解，必須是合法的段落
  const block = env.head.slice(env.head.indexOf('▍範例：把下面這段'), env.head.indexOf('▍範例：共用流程'));
  const example = block.split('\n').filter((l) => l.startsWith('//    ')).map((l) => l.slice(6)).join('\n');
  const exampleSection = JSON.parse(example);
  const exDeck = model.normalizeDeck({ title: 't', sections: [exampleSection] });
  assert.deepStrictEqual(exDeck.errors, [], '說明裡的段落範例取消註解後要能直接用');
  assert.deepStrictEqual(model.parseDeckText('{ "a": "http://x//y", /* c */ "b": [1, 2,], }'), { a: 'http://x//y', b: [1, 2] });
  console.log('✓ JSONC：可讀註解與尾逗號，新劇本範本附說明，範例取消註解即可使用');

  // ---- Markdown 匯入 ----
  const md = model.importMarkdown(fs.readFileSync(path.join(__dirname, '..', 'examples', 'legacy-markdown.md'), 'utf8'));
  assert.strictEqual(md.target, 'http://localhost:3002');
  assert.deepStrictEqual(md.sections.map((s) => s.cues.length), [0, 1, 4, 1, 4, 1, 1]);
  assert.deepStrictEqual(md.flows['搜尋示範'][0], { do: 'click', text: '檢索與拼字校正' });
  console.log('✓ Markdown 講稿可以匯入成劇本');

  // ---- 在瀏覽器裡執行 ----
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  await page.setContent(PAGE);
  const ctx = { page, typeDelay: 0, stepGap: 0 };
  const flows = { 搜尋: model.parseDsl('clicktext "詞向量 Word2Vec"\ntype #q "insulin"; click #go; waittext "查詢:insulin"') };
  await runActions(ctx, [{ do: 'flow', name: '搜尋' }, { do: 'highlight', selector: '#out', caption: '結果', ms: 400 }], flows);
  assert.strictEqual(await page.evaluate(() => document.body.dataset.tab), 'b');
  assert.strictEqual(await page.$eval('#out', (e) => e.textContent), '查詢:insulin');
  assert.ok((await page.evaluate(() => window.scrollY)) > 1000, '應該捲到搜尋框');
  assert.strictEqual(await page.$eval('[data-cuedeck=highlight]', (e) => e.textContent), '結果');
  await assert.rejects(runActions(ctx, [{ do: 'click', selector: '#nope' }]), /找不到元素/);
  console.log('✓ 動作引擎：流程、輸入、點擊、捲動、強調框說明都正常，找不到元素會回報');

  // ---- DOM 選取器 ----
  const picks = [];
  await page.exposeFunction('__pickTest', (r) => picks.push(r));
  await new Promise((r) => setTimeout(r, 1000));
  await page.evaluate(() => { window.scrollTo(0, 0); document.body.dataset.tab = 'a'; });
  const clickAt = async (sel) => {
    await page.evaluate(installPicker, '__pickTest');
    const box = await (await page.$(sel)).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await new Promise((r) => setTimeout(r, 100));
  };
  await clickAt('nav [data-tab=b]');
  await clickAt('#x123456');
  await page.evaluate(() => document.querySelector('#q').scrollIntoView());
  await clickAt('#q');
  const [tab, generated, input] = picks;
  assert.strictEqual(tab.selector, 'button[data-tab="b"]');
  assert.strictEqual(tab.text, '詞向量 Word2Vec');
  assert.ok(!generated.selector.includes('x123456'), `自動產生的 id 不該被採用：${generated.selector}`);
  assert.strictEqual(await page.$eval(generated.selector, (e) => e.id), 'x123456', '產生的 selector 要指到同一個元素');
  assert.strictEqual(input.selector, '#q');
  assert.strictEqual(input.isInput, true);
  assert.strictEqual(await page.$('[data-cuedeck=picker]'), null, '選完要清掉選取器的畫面');
  assert.strictEqual(await page.evaluate(() => document.body.dataset.tab), 'a', '選取時的點擊不能觸發頁面原本的 onclick');
  console.log(`✓ DOM 選取器：${picks.map((p) => p.selector).join('、')}，點擊不會觸發頁面原本的動作`);
  await browser.close();
})().catch((e) => {
  console.error('✗', e);
  process.exit(1);
});
