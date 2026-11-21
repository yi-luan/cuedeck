// CueDeck — Electron 主程序
//
// 重點：
// 1. setContentProtection(true)：Windows 10 2004 以後會呼叫 SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)，
//    螢幕分享、錄影、截圖都拍不到這個視窗，但你自己看得到。
// 2. 透過 Chrome DevTools Protocol（遠端除錯埠 9222）操作「Demo 用 Chrome」裡的頁面。
// 講稿內容的顯示與編輯都在畫面端（renderer）處理，主程序只負責檔案、瀏覽器、快速鍵。

const { app, BrowserWindow, ipcMain, globalShortcut, dialog, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const { normalizeDeck, importMarkdown, parseDeckText, splitEnvelope } = require('./model');
const { newDeckText } = require('./template');
const { runActions } = require('./actions');
const { installPicker } = require('./picker');

const CDP_PORT = 9222;
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const BUNDLED_DECK = path.join(__dirname, '..', 'decks', 'project02-demo.cuedeck.json');
const DEFAULTS = { opacity: 0.96, fontSize: 14, protect: true };

let win;
let settings = loadSettings();
let deckFile = null;
let lastWritten = null; // 自己存檔時寫入的內容，用來忽略隨後的檔案變更通知
let watcher = null;
let browser = null;
let running = false;
let pendingPick = null; // { page, resolve }
// 每次啟動用不同的名稱：頁面上可能還留著上一次連線掛的同名函式，同名會掛不上去
const PICK_BINDING = `__cuedeckPick_${Date.now().toString(36)}`;

// ---------- 設定 ----------

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings() {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// ---------- 視窗 ----------

function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  let b = settings.bounds || { width: 400, height: 640, x: wa.x + wa.width - 420, y: wa.y + 40 };
  // 上次的位置如果在已拔掉的螢幕上，就放回主螢幕
  const onScreen = screen.getAllDisplays().some((d) => b.x < d.bounds.x + d.bounds.width && b.x + b.width > d.bounds.x && b.y < d.bounds.y + d.bounds.height && b.y + b.height > d.bounds.y);
  if (!onScreen) b = { ...b, x: wa.x + wa.width - b.width - 20, y: wa.y + 40 };
  win = new BrowserWindow({
    ...b,
    minWidth: 300,
    minHeight: 220,
    frame: false,
    backgroundColor: '#0b1120',
    alwaysOnTop: true,
    title: 'CueDeck',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false },
  });
  // 'screen-saver' 層級才壓得過全螢幕的瀏覽器與簡報
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.setContentProtection(settings.protect);
  win.setOpacity(settings.opacity);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  const remember = () => {
    if (!win.isMinimized()) {
      settings.bounds = win.getBounds();
      saveSettings();
    }
  };
  win.on('moved', remember);
  win.on('resized', remember);
}

// ---------- Deck 檔 ----------

// 讀檔：.json / .jsonc（可含註解）直接用；.md 是舊版講稿，轉成 deck 後標記為「匯入」，存檔時會另存成 .cuedeck.json
function readDeck(file) {
  const text = fs.readFileSync(file, 'utf8');
  const imported = /\.(md|markdown|txt)$/i.test(file);
  const raw = imported ? importMarkdown(text) : parseDeckText(text);
  const { deck, errors } = normalizeDeck(raw);
  return { file, name: path.basename(file), imported, deck, errors };
}

function openDeck(file) {
  let payload;
  try {
    payload = readDeck(file);
  } catch (err) {
    payload = { file, name: path.basename(file), imported: false, deck: null, errors: [`讀不到 ${path.basename(file)}：${err.message}`] };
  }
  deckFile = file;
  settings.deckFile = file;
  saveSettings();
  watchDeck(file);
  send('deck', payload);
  return payload;
}

function watchDeck(file) {
  watcher?.close();
  let t;
  try {
    // 用外部編輯器（VS Code）改檔存檔，畫面會自動更新
    watcher = fs.watch(file, () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (!fs.existsSync(file)) return;
        if (fs.readFileSync(file, 'utf8') === lastWritten) return;
        openDeck(file);
      }, 250);
    });
  } catch {
    watcher = null;
  }
}

// .jsonc 存檔時保留原檔 JSON 前後的註解（說明與範例）；.json 一律存成純 JSON，其他工具才讀得懂
function writeDeck(file, deck) {
  let head = '';
  let tail = '\n';
  if (/\.jsonc$/i.test(file) && fs.existsSync(file)) {
    const env = splitEnvelope(fs.readFileSync(file, 'utf8'));
    head = env.head;
    tail = env.tail || '\n';
  }
  const text = `${head}${JSON.stringify(deck, null, 2)}${tail}`;
  lastWritten = text;
  fs.writeFileSync(file, text, 'utf8');
}

// schema 的位置：安裝版在「文件\CueDeck\schema」，開發時在專案裡
function schemaFile() {
  if (!app.isPackaged) return path.join(__dirname, '..', 'schema', 'cuedeck.schema.json');
  defaultDeck(); // 確保已複製
  return path.join(app.getPath('documents'), 'CueDeck', 'schema', 'cuedeck.schema.json');
}

// 給 $schema 用的路徑：同一顆磁碟用相對路徑，否則用 file:// 網址
function schemaRef(deckPath) {
  const target = schemaFile();
  if (path.parse(target).root.toLowerCase() !== path.parse(deckPath).root.toLowerCase()) return `file:///${target.replace(/\\/g, '/')}`;
  return path.relative(path.dirname(deckPath), target).replace(/\\/g, '/');
}

// 安裝版的程式檔在唯讀的 app.asar 裡，第一次啟動時把範例劇本與 schema 複製到「文件\CueDeck」，之後在那裡讀寫
function defaultDeck() {
  if (!app.isPackaged) return BUNDLED_DECK;
  const home = path.join(app.getPath('documents'), 'CueDeck');
  const deck = path.join(home, 'decks', path.basename(BUNDLED_DECK));
  const schema = path.join(home, 'schema', 'cuedeck.schema.json');
  try {
    fs.mkdirSync(path.dirname(deck), { recursive: true });
    fs.mkdirSync(path.dirname(schema), { recursive: true });
    if (!fs.existsSync(deck)) fs.copyFileSync(BUNDLED_DECK, deck);
    // schema 每次都更新成目前版本，VS Code 的自動完成才會跟著程式走
    fs.copyFileSync(path.join(__dirname, '..', 'schema', 'cuedeck.schema.json'), schema);
    return deck;
  } catch {
    return BUNDLED_DECK;
  }
}

// ---------- 瀏覽器（CDP） ----------

async function getBrowser() {
  if (browser?.connected) return browser;
  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${CDP_PORT}`, defaultViewport: null });
  browser.on('disconnected', () => {
    browser = null;
    send('cdp', { connected: false });
  });
  send('cdp', { connected: true });
  return browser;
}

// 挑要操作的分頁：符合 target 網址的優先，其中再挑目前看得到的那一個
async function pickPage(target) {
  const b = await getBrowser();
  const pages = (await b.pages()).filter((p) => !p.url().startsWith('devtools://'));
  if (!pages.length) return b.newPage();
  let origin = null;
  try {
    origin = target ? new URL(target).origin : null;
  } catch {
    /* target 格式錯誤時當作沒設定 */
  }
  const matched = origin ? pages.filter((p) => p.url().startsWith(origin)) : [];
  const pool = matched.length ? matched : pages;
  for (const p of pool) {
    try {
      if (await p.evaluate(() => document.visibilityState === 'visible')) return p;
    } catch {
      /* 分頁可能正在關閉 */
    }
  }
  return pool[0];
}

function findChrome() {
  const candidates = [
    settings.chromePath,
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ];
  return candidates.find((p) => p && fs.existsSync(p));
}

// ---------- 雙螢幕（HDMI / 投影機） ----------
// 隱形只擋得住「螢幕擷取」，擋不住 HDMI 直接輸出的畫面。Windows 設成「延伸」模式時，
// 把 CueDeck 放在筆電螢幕、Demo Chrome 放在投影幕，觀眾就看不到 CueDeck。
// 「同步顯示」模式下兩邊是同一張畫面，作業系統層級沒辦法只在一邊隱藏視窗。

// 筆電本身的螢幕：Electron 標記為 internal 的優先，沒有的話用主螢幕
function laptopDisplay() {
  const all = screen.getAllDisplays();
  return all.find((d) => d.internal) || screen.getPrimaryDisplay();
}

// 投影幕：筆電螢幕以外的那一個（有多個時取最大的）
function projectorDisplay() {
  const laptop = laptopDisplay();
  const others = screen.getAllDisplays().filter((d) => d.id !== laptop.id);
  return others.sort((a, b) => b.bounds.width * b.bounds.height - a.bounds.width * a.bounds.height)[0] || null;
}

function displayInfo() {
  const projector = projectorDisplay();
  const onProjector = !!projector && win && !win.isDestroyed() && screen.getDisplayMatching(win.getBounds()).id === projector.id;
  return { count: screen.getAllDisplays().length, hasProjector: !!projector, cuedeckOnProjector: onProjector };
}

function moveCueDeckToLaptop() {
  const wa = laptopDisplay().workArea;
  const { width, height } = win.getBounds();
  const w = Math.min(width, wa.width - 40);
  const h = Math.min(height, wa.height - 40);
  win.setBounds({ x: wa.x + wa.width - w - 20, y: wa.y + 20, width: w, height: h });
  send('displays', displayInfo());
}

// 透過 CDP 把 Demo Chrome 的視窗搬到投影幕並最大化
async function moveChromeToProjector(target) {
  const projector = projectorDisplay();
  if (!projector) throw new Error('只偵測到一個螢幕。請先接上投影機，並按 Win+P 選「延伸」');
  const page = await pickPage(target);
  const cdp = await page.createCDPSession();
  try {
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    const wa = projector.workArea;
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: wa.x + 40, top: wa.y + 40, width: Math.max(800, wa.width - 80), height: Math.max(600, wa.height - 80) } });
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'maximized' } });
  } finally {
    await cdp.detach().catch(() => {});
  }
  await page.bringToFront();
}

function watchDisplays() {
  const changed = (added) => {
    const info = displayInfo();
    // 剛接上投影機時，CueDeck 如果跑到投影幕上，先搬回筆電
    if (added && info.cuedeckOnProjector) moveCueDeckToLaptop();
    send('displays', { ...displayInfo(), justAdded: added });
  };
  screen.on('display-added', () => changed(true));
  screen.on('display-removed', () => changed(false));
  screen.on('display-metrics-changed', () => send('displays', displayInfo()));
}

// Chrome 136 起，遠端除錯埠只能搭配「非預設」的使用者資料夾，所以開一個專用的 Demo profile
function launchChrome(url) {
  const exe = findChrome();
  if (!exe) throw new Error('找不到 Chrome / Edge，請在設定檔加上 chromePath');
  const profile = path.join(app.getPath('userData'), 'demo-chrome-profile');
  // 有投影幕的話，Demo Chrome 直接開在投影幕上
  const projector = projectorDisplay();
  const place = projector ? [`--window-position=${projector.workArea.x + 40},${projector.workArea.y + 40}`, '--start-maximized'] : [];
  const child = spawn(exe, [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', ...place, '--new-window', url || 'about:blank'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

const friendly = (err) =>
  /ECONNREFUSED|Failed to fetch browser|fetch failed/.test(err.message) ? '連不到 Demo 用 Chrome — 先按「啟動 Chrome」，並在那個視窗 demo' : err.message;

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// ---------- IPC ----------

ipcMain.handle('init', () => ({ settings }));

ipcMain.handle('run', async (_, { actions, flows, target }) => {
  if (running) return { ok: false, error: '上一個動作還在跑' };
  running = true;
  try {
    const page = await pickPage(target);
    await page.bringToFront();
    await runActions({ page, baseUrl: target || undefined }, actions, flows);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  } finally {
    running = false;
  }
});

ipcMain.handle('pick', async (_, { target }) => {
  try {
    if (pendingPick) cancelPick();
    const page = await pickPage(target);
    if (!page.__cuedeckExposed) {
      // exposeFunction 換頁後仍有效，所以每個分頁只需要掛一次
      await page.exposeFunction(PICK_BINDING, (result) => {
        if (pendingPick?.page === page) {
          pendingPick.resolve(result);
          pendingPick = null;
        }
      });
      page.__cuedeckExposed = true;
    }
    await page.bringToFront();
    const result = new Promise((resolve) => (pendingPick = { page, resolve }));
    await page.evaluate(installPicker, PICK_BINDING);
    const picked = await result;
    win.showInactive();
    return { ok: true, picked };
  } catch (err) {
    pendingPick = null;
    return { ok: false, error: friendly(err) };
  }
});

function cancelPick() {
  if (!pendingPick) return;
  const { page, resolve } = pendingPick;
  pendingPick = null;
  page.evaluate(() => window.__cuedeckPickerStop?.()).catch(() => {});
  resolve(null);
}
ipcMain.handle('pick-cancel', cancelPick);

ipcMain.handle('displays', () => displayInfo());
ipcMain.handle('cuedeck-to-laptop', () => moveCueDeckToLaptop());
ipcMain.handle('chrome-to-projector', async (_, target) => {
  try {
    await moveChromeToProjector(target);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
});

ipcMain.handle('launch-chrome', (_, url) => {
  try {
    launchChrome(url);
    // 給 Chrome 一點時間開好再連
    setTimeout(() => getBrowser().catch(() => {}), 2500);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('open-deck', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '匯入 Demo 劇本',
    filters: [{ name: 'CueDeck 劇本', extensions: ['jsonc', 'json', 'md'] }],
    properties: ['openFile'],
  });
  if (!r.canceled && r.filePaths[0]) return openDeck(r.filePaths[0]);
  return null;
});

ipcMain.handle('new-deck', async () => {
  const r = await dialog.showSaveDialog(win, {
    title: '新增劇本',
    defaultPath: path.join(app.getPath('documents'), 'CueDeck', 'decks', '新的 Demo.cuedeck.jsonc'),
    filters: [{ name: 'CueDeck 劇本（含說明註解）', extensions: ['jsonc'] }, { name: 'CueDeck 劇本（純 JSON）', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePath) return null;
  const title = path.basename(r.filePath).replace(/(\.cuedeck)?\.jsonc?$/i, '');
  const text = newDeckText({ title, schema: schemaRef(r.filePath) });
  // 存成 .json 的話拿掉說明註解，保持純 JSON
  lastWritten = /\.jsonc$/i.test(r.filePath) ? text : `${splitEnvelope(text).body}\n`;
  fs.mkdirSync(path.dirname(r.filePath), { recursive: true });
  fs.writeFileSync(r.filePath, lastWritten, 'utf8');
  return openDeck(r.filePath);
});

// 存檔；匯入的 Markdown 或指定另存時，跳出另存新檔
ipcMain.handle('save-deck', async (_, { deck, saveAs }) => {
  let file = deckFile;
  if (saveAs || !file || /\.(md|markdown|txt)$/i.test(file)) {
    const base = file ? file.replace(/\.(md|markdown|txt|jsonc?)$/i, '').replace(/\.cuedeck$/i, '') : deck.title;
    const ext = file && /\.jsonc$/i.test(file) ? 'jsonc' : 'json';
    const r = await dialog.showSaveDialog(win, {
      title: '儲存劇本',
      defaultPath: `${base}.cuedeck.${ext}`,
      filters: [{ name: 'CueDeck 劇本', extensions: [ext, ext === 'json' ? 'jsonc' : 'json'] }],
    });
    if (r.canceled || !r.filePath) return null;
    file = r.filePath;
  }
  writeDeck(file, deck);
  if (file !== deckFile) return openDeck(file);
  return readDeck(file);
});

ipcMain.handle('reveal-deck', () => deckFile && shell.showItemInFolder(deckFile));
ipcMain.handle('set', (_, key, value) => {
  settings[key] = value;
  saveSettings();
  if (key === 'opacity') win.setOpacity(value);
  if (key === 'protect') win.setContentProtection(value);
});
ipcMain.handle('window', (_, cmd) => {
  if (cmd === 'minimize') win.minimize();
  if (cmd === 'close') win.close();
});

// ---------- 全域快速鍵：講話時不用切到 CueDeck 也能推進 ----------

function registerShortcuts() {
  const map = {
    'CommandOrControl+Alt+Right': () => send('shortcut', 'next'),
    'CommandOrControl+Alt+Left': () => send('shortcut', 'prev'),
    'CommandOrControl+Alt+Down': () => send('shortcut', 'again'),
    'CommandOrControl+Alt+H': () => (win.isVisible() ? win.hide() : win.showInactive()),
  };
  for (const [acc, fn] of Object.entries(map)) {
    if (!globalShortcut.register(acc, fn)) console.warn(`快速鍵 ${acc} 被其他程式占用`);
  }
}

// 只允許開一個 CueDeck：再次從開始功能表啟動時，把已開的視窗叫出來
const isPrimary = app.requestSingleInstanceLock();
if (!isPrimary) app.quit();
app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.whenReady().then(() => {
  if (!isPrimary) return;
  createWindow();
  registerShortcuts();
  const file = settings.deckFile && fs.existsSync(settings.deckFile) ? settings.deckFile : defaultDeck();
  watchDisplays();
  win.webContents.once('did-finish-load', () => {
    openDeck(file);
    send('displays', displayInfo());
    getBrowser().catch(() => send('cdp', { connected: false }));
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
