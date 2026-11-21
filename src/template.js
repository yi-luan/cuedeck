// 「新增劇本」用的範本：開頭是一段讀寫說明與註解起來的範例（.jsonc 允許 // 註解），本體是可以直接跑的最小劇本。
// 從 CueDeck 存檔時，JSON 前後的註解會保留；寫在 { } 裡面的註解則會在存檔時被拿掉。

const GUIDE = `// ============================================================================
//  CueDeck 劇本（.cuedeck.jsonc）
//  這段說明是註解，不影響執行；從 CueDeck 存檔時會保留，不需要可以整段刪掉。
//  在 VS Code 打開時，打 " 會跳出欄位提示，寫錯會出現紅色波浪線（由 $schema 提供）。
// ============================================================================
//
//  結構：劇本 → 段落 sections（講稿 notes + 步驟 cues）→ 動作 actions
//
//  ▍講稿中的觸發點
//    在 notes 裡寫 {{步驟名稱}}，簡報時那個位置會變成一顆可以點的小按鈕。
//    講到哪裡就點哪裡，或按 Ctrl+Alt+→ 依講稿順序執行下一個。
//    沒有寫進講稿的步驟，會列在該段落的最下面。
//
//      "notes": "先切到詞頻分頁 {{切到 Zipf}}，再看去停用詞的差異 {{看 B → C}}。"
//
//  ▍動作（actions 陣列裡的每一項，依序執行）
//    { "do": "goto",      "url": "/search" }                         開網址（相對路徑以 target 為基準）
//    { "do": "click",     "selector": "#search-btn" }                點擊（會先捲到看得到的位置）
//    { "do": "click",     "text": "詞向量 Word2Vec" }                用畫面上的文字找元素再點
//    { "do": "type",      "selector": "#q", "text": "insulin" }      清空後逐字輸入
//    { "do": "press",     "key": "Enter" }                           按鍵
//    { "do": "scroll",    "selector": "#chart", "align": "top" }     平滑捲到元素（top / center / bottom）
//    { "do": "scrollTo",  "y": "top" }                               捲到頁面頂端 / 底部 / 某個高度
//    { "do": "wait",      "ms": 800 }                                等一段時間
//    { "do": "wait",      "selector": ".result" }                    等元素出現（最多 15 秒）
//    { "do": "waitText",  "text": "搜尋完成" }                        等頁面出現這段文字
//    { "do": "highlight", "selector": "#chart", "caption": "重點在這" } 強調框，caption 是觀眾看得到的說明
//    { "do": "eval",      "code": "window.scrollBy(0, 300)" }        在頁面裡執行 JavaScript
//    { "do": "back" }  /  { "do": "reload" }                         上一頁 / 重新整理
//    { "do": "flow",      "name": "回首頁" }                          執行下面 flows 裡的共用流程
//
//  ▍怎麼找 selector
//    最簡單：在 CueDeck 的編輯模式按「從頁面選取」，到 Demo Chrome 點一下元素就會自動產生。
//    手動：在 Chrome 對元素按右鍵 →「檢查」，看它的 id（寫成 #id）或屬性（例如 button[data-tab="w2v"]）。
//
//  ▍範例：把下面這段複製到 "sections" 陣列裡（拿掉每行開頭的 //）就是一個完整段落
//
//    {
//      "title": "搜尋功能",
//      "notes": "故意打錯字 {{輸入錯字}}，系統會自動校正 {{看校正結果}}。",
//      "cues": [
//        { "label": "輸入錯字", "actions": [
//          { "do": "click", "text": "檢索" },
//          { "do": "type", "selector": "#search-input", "text": "diabetis" },
//          { "do": "click", "selector": "#search-btn" }
//        ] },
//        { "label": "看校正結果", "actions": [
//          { "do": "wait", "selector": "#search-output .result" },
//          { "do": "highlight", "selector": "#search-output", "caption": "自動校正成 diabetes" }
//        ] }
//      ]
//    }
//
//  ▍範例：共用流程（放在 "flows" 裡，步驟用 { "do": "flow", "name": "回首頁" } 呼叫）
//
//    "回首頁": [
//      { "do": "goto", "url": "/" },
//      { "do": "scrollTo", "y": "top" }
//    ]
// ============================================================================
`;

function newDeckText({ title, schema }) {
  const deck = {
    ...(schema ? { $schema: schema } : {}),
    cuedeck: 1,
    title,
    target: 'http://localhost:3000',
    sections: [
      {
        title: '開場',
        notes: '大家好，今天要 demo 的是……\n\n講到這裡點一下觸發點，就會打開首頁：{{開啟首頁}}',
        cues: [{ label: '開啟首頁', actions: [{ do: 'goto', url: '/' }] }],
      },
    ],
    flows: {},
  };
  return `${GUIDE}${JSON.stringify(deck, null, 2)}\n`;
}

module.exports = { newDeckText };
