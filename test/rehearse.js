// 彩排：用無頭 Chrome 把劇本的每個步驟依序跑一遍，確認 selector 都找得到
//   npm run rehearse -- decks/my-demo.cuedeck.json   （也可以是 .md 講稿）
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { runActions } = require('../src/actions');
const { normalizeDeck, importMarkdown, flatCues } = require('../src/model');

const file = path.resolve(process.argv[2] || path.join(__dirname, '..', 'decks', 'project02-demo.cuedeck.json'));
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));

(async () => {
  const text = fs.readFileSync(file, 'utf8');
  const { deck, errors } = normalizeDeck(/\.(md|markdown|txt)$/i.test(file) ? importMarkdown(text) : JSON.parse(text));
  if (errors.length) console.log(`格式問題：\n  ${errors.join('\n  ')}\n`);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1440, height: 900 } });
  const page = await browser.newPage();
  if (deck.target) await page.goto(deck.target, { waitUntil: 'networkidle2' });
  const cues = flatCues(deck);
  let failed = 0;
  for (const [i, { cue }] of cues.entries()) {
    const t = Date.now();
    try {
      await runActions({ page, baseUrl: deck.target || undefined, typeDelay: 0 }, cue.actions, deck.flows);
      console.log(`✓ ${i + 1}. ${cue.label}  (${Date.now() - t} ms)`);
    } catch (err) {
      failed++;
      console.log(`✗ ${i + 1}. ${cue.label}\n    ${err.message}`);
    }
  }
  await browser.close();
  console.log(failed ? `\n${failed} 個步驟失敗` : `\n全部 ${cues.length} 個步驟都成功`);
  process.exit(failed ? 1 : 0);
})();
