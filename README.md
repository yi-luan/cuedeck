# CueDeck

CueDeck 是 Demo 時用的隱形講稿與網頁操作面板，適用於任何網站：

- **螢幕分享看不到**：Google Meet、Teams、OBS 分享整個螢幕或視窗時，觀眾看不到 CueDeck，只有你看得到。
- **一鍵操作網頁**：每個步驟都是一顆按鈕，按下去就會在 Demo 用的 Chrome 裡點擊、輸入、捲動，或用**強調框**（可以加說明文字）把重點框給觀眾看。
- **用點選的方式建立步驟**：在 Demo 頁面上直接點元素，CueDeck 會自動產生穩定的 CSS selector，不用自己去 DevTools 找。
- **標準格式**：劇本是有 JSON Schema 的 `.cuedeck.json`，可以版本控管、分享，或由其他系統產生。

## 安裝與啟動

```bash
cd tools/demo-cue
npm install --no-workspaces
node node_modules/electron/install.js   # 下載 Electron 本體，見下方說明
npm start
```

> npm 11 預設會擋套件的安裝腳本（會出現 `allow-scripts` 警告），所以 `npm install` 不會自動下載 Electron 的執行檔，要自己跑第二行。
> 如果從 GitHub 下載很慢，可以改用鏡像站：
> `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js`

## 打包成 Windows 安裝檔

```bash
npm run dist
```

產出 `dist/CueDeck-Setup-<版本>.exe`（約 95 MB）。安裝後：

- 開始功能表裡會有 **CueDeck**，按 Win 鍵搜尋得到，也可以釘選到工作列；桌面也會有捷徑。
- 第一次啟動時，範例劇本和 schema 會複製到 `文件\CueDeck\`，新增的劇本預設也存在這裡。
- 重複啟動不會開出第二個視窗，而是叫出已經開著的那一個。
- 安裝檔沒有程式碼簽章，所以第一次執行時 Windows SmartScreen 可能會顯示「Windows 已保護您的電腦」。按「其他資訊 → 仍要執行」即可。

> 打包時需要下載 Electron 和 NSIS。如果很慢，可以加上鏡像站（`package.json` 已經設定好 Electron 的鏡像）：
> `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ npm run dist`
>
> App 圖示是用 `build/make-icon.js` 畫出來的；改完之後執行 `node_modules/.bin/electron build/make-icon.js` 重新產生 `build/icon.png`。

## 使用流程

### 1. 準備

1. 把要 demo 的網站跑起來。
2. `npm start` 打開 CueDeck。
3. 按工具列的**地球圖示**，會啟動「Demo 用 Chrome」（獨立的 profile，帶遠端除錯埠 9222）。**請在這個視窗 demo**，CueDeck 只能操作它。標題列出現綠色的「Chrome」就代表連上了。

### 2. 建立劇本（編輯模式）

- 選單「⋯」→「新增空白劇本」，會建立一份 `.cuedeck.jsonc`。檔案開頭附有完整的讀寫說明和註解起來的範例，用 VS Code 打開就能照著寫。也可以匯入現成的 `.cuedeck.json(c)` 或 Markdown 講稿。
- 填上 **Demo 網址**（例如 `http://localhost:3002`）。
- 每個**段落**有標題和講稿，講稿支援 Markdown，只有你看得到。
- **講稿中的觸發點**：在講稿裡寫 `{{步驟名稱}}`，簡報時那個位置會變成一顆可以點的小按鈕，講到哪裡就點哪裡。「下一步」也照講稿中出現的順序推進；沒寫進講稿的步驟會列在段落最下面。
  - 「**插入觸發點…**」：把現有的步驟插到講稿游標處（步驟旁的連結圖示也可以）。
  - 「**選取並插在游標處**」：先把游標放在講稿要觸發的位置，再到頁面上選元素，新步驟建好後觸發點就會插在那裡。
  - 步驟改名時，講稿裡的觸發點會跟著改；刪除步驟時，觸發點也會一起拿掉。
- 按「**從頁面選取**」，然後到 Demo Chrome 點一下元素（滑鼠移過去會出現藍框，按 Esc 取消），再選要做什麼：

  | 選項 | 產生的動作 |
  | --- | --- |
  | 點擊 | 捲到看得到的位置後點擊（切頁籤、按按鈕） |
  | 捲動到這裡 | 把這個區塊平滑捲到畫面中央 |
  | 強調框 | 捲過去並框起來，可以加一行給觀眾看的說明 |
  | 點擊並強調 | 點擊後再框起來 |
  | 輸入文字 | 逐字打進輸入框（只有選到輸入框時才會出現） |

  如果元素上有文字，還可以選擇改用「畫面文字」來定位。這樣網頁改版、selector 變了，步驟通常還是能用。
- 每個步驟旁的準心圖示可以再選一個元素，**追加**到同一步驟裡，例如先點分頁、再框出結果。
- 進階用法：每個步驟下方的指令列可以直接打字，例如 `click #search-btn; wait 800; highlight #result "就是這裡"`。
- 常用的一串動作可以寫成「**共用流程**」，在步驟裡用 `flow 名稱` 呼叫。
- `Ctrl+S` 存檔。用 VS Code 直接改 JSON 也可以，存檔後 CueDeck 會自動更新。

### 3. Demo（簡報模式）

在 Meet 選「分享整個螢幕」或「分享視窗 → Demo 用 Chrome」，然後照著講稿講，點步驟按鈕或用快速鍵推進：

| 快速鍵（任何視窗都有效） | 作用 |
| --- | --- |
| `Ctrl+Alt+→` | 執行下一步 |
| `Ctrl+Alt+←` | 回到上一步並執行 |
| `Ctrl+Alt+↓` | 重跑目前這一步 |
| `Ctrl+Alt+H` | 隱藏或顯示 CueDeck |

> 第一次使用時，先用 Meet 的分享預覽確認 CueDeck 真的沒被拍到。標題列顯示「隱形」代表保護開著，顯示黃色的「可見」代表保護被關掉了（可以在「⋯ → 外觀與快速鍵」切換）。

### 用 HDMI 接投影機 / 外接螢幕

「隱形」只擋得住螢幕擷取（Meet、Teams、OBS、錄影、截圖），**擋不住 HDMI**，因為 HDMI 是顯示卡直接輸出的畫面。所以接投影機時要靠螢幕配置：

1. 按 `Win+P`，選「**延伸**」（不要選「同步顯示」：同步顯示時兩邊是同一張畫面，觀眾一定看得到 CueDeck）。
2. CueDeck 接上投影機時會自動提示。如果 CueDeck 跑到投影幕上，會先把它搬回筆電螢幕。
3. 按提示裡的「**Chrome 移到投影幕**」，Demo Chrome 會移到投影幕並最大化。如果還沒開 Demo Chrome，按地球圖示啟動時就會直接開在投影幕上。
4. 隨時可以從選單「⋯ → HDMI / 投影設定」叫出這個提示。

## 劇本格式（`.cuedeck.jsonc` / `.cuedeck.json`）

完整定義在 [schema/cuedeck.schema.json](schema/cuedeck.schema.json)，範例是 [decks/project02-demo.cuedeck.json](decks/project02-demo.cuedeck.json)。在檔案開頭加上 `"$schema"`，VS Code 就會提供自動完成和錯誤檢查。

- `.cuedeck.jsonc`：允許 `//` 和 `/* */` 註解。新增劇本預設用這個格式，開頭附有說明和範例。從 CueDeck 存檔時，JSON 本體**前後**的註解會保留；寫在 `{ }` **裡面**的註解則會在存檔時被拿掉。
- `.cuedeck.json`：純 JSON，方便其他系統讀寫。從 CueDeck 存檔時一律寫成純 JSON。

```json
{
  "$schema": "../schema/cuedeck.schema.json",
  "cuedeck": 1,
  "title": "我的 Demo",
  "target": "http://localhost:3000",
  "sections": [
    {
      "title": "搜尋功能",
      "notes": "故意打錯字，展示**拼字校正** {{示範拼字校正}}。",
      "cues": [
        {
          "label": "示範拼字校正",
          "actions": [
            { "do": "click", "text": "檢索" },
            { "do": "type", "selector": "#search-input", "text": "diabetis" },
            { "do": "click", "selector": "#search-btn" },
            { "do": "wait", "ms": 800 },
            { "do": "highlight", "selector": "#results", "caption": "自動校正成 diabetes" }
          ]
        }
      ]
    }
  ],
  "flows": {
    "回首頁": [{ "do": "goto", "url": "/" }, { "do": "scrollTo", "y": "top" }]
  }
}
```

### 動作一覽

| `do` | 欄位 | 指令列寫法 | 說明 |
| --- | --- | --- | --- |
| `goto` | `url` | `goto /path` | 開網址，相對路徑以 `target` 為基準 |
| `click` | `selector` 或 `text`（可加 `within`） | `click #btn` / `clicktext "文字"` | 捲到看得到的位置再點擊 |
| `type` | `selector`, `text` | `type #q "文字"` | 清空後逐字輸入 |
| `press` | `key` | `press Enter` | 按一個鍵 |
| `scroll` | `selector` 或 `text`，`align`：top / center / bottom | `scroll #sec top` | 平滑捲到元素 |
| `scrollTo` | `y`（數字、`top` 或 `bottom`） | `scrollto top` | 捲到頁面的某個高度 |
| `wait` | `ms` 或 `selector` | `wait 500` / `wait .result` | 等一段時間，或等元素出現（最多 15 秒） |
| `waitText` | `text` | `waittext "完成"` | 等頁面出現這段文字 |
| `highlight` | `selector` 或 `text`，`caption`、`ms`（選填） | `highlight #x "說明" 3000` | 強調框（**觀眾看得到**） |
| `eval` | `code` | `eval "..."` | 在頁面裡執行 JavaScript |
| `back` / `reload` | — | `back` / `reload` | 上一頁、重新整理 |
| `flow` | `name` | `flow 名稱` | 執行共用流程 |

### 從其他格式匯入

- **Markdown 講稿**（`.md`）：`## 標題` 會變成段落，`[[按鈕文字|指令列]]` 會變成步驟，```` ```flow 名稱 ```` 區塊會變成共用流程。範例在 [examples/legacy-markdown.md](examples/legacy-markdown.md)。匯入後存檔會另存成 `.cuedeck.json`。
- **其他系統**：只要輸出符合 schema 的 JSON 就能匯入。例如測試團隊既有的 E2E 步驟、或各產品各自維護一份 demo 劇本。

## 彩排與測試

```bash
npm run rehearse -- decks/my-demo.cuedeck.json   # 用無頭 Chrome 把每個步驟跑一遍，確認 selector 都找得到
npm test                                          # 資料模型、動作引擎、DOM 選取器的自動測試
```

## 原理與限制

- 「螢幕分享看不到」靠的是 Electron 的 `setContentProtection(true)`，在 Windows 上會呼叫 `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`。這需要 **Windows 10 2004 以上**，更舊的版本會被拍成一塊黑色。macOS 也有效。
- 如果 Meet 只分享「Chrome 分頁」，本來就只拍得到那個分頁。
- 操作網頁是透過 Chrome DevTools Protocol。Chrome 136 以後，遠端除錯只能搭配非預設的 profile，所以 Demo 用 Chrome 第一次開的時候，沒有你平常的書籤和登入狀態。網站如果需要登入，請先在裡面登入一次，之後就會記住。
- 有多個分頁時，會優先操作網址符合 `target`、而且目前在前景的那一個。點擊步驟時，Chrome 會切到正確的分頁，但如果 Chrome 視窗被其他視窗蓋住，不會自動跳到最前面。
- DOM 選取器會避開看起來是自動產生的 id 和 class（含長串數字或 hash，例如 CSS-in-JS 產生的名稱），優先使用 `id`、`data-testid`、`data-*`、`name`、`aria-label`。如果網站有 `data-testid`，選出來的 selector 會最穩定。
- 設定（視窗位置、透明度、上次開的劇本）存在 `%APPDATA%/cuedeck/settings.json`。如果找不到 Chrome，可以在這裡加上 `"chromePath"`。
