---
title: Project02 Demo 講稿
target: http://localhost:3002
---

# Project02 Demo

> 先在 `project02-zipf-word2vec-ir/server` 跑 `npm run dev`，再按工具列的 🌐 開 Demo 用 Chrome。

## 1. 開場

大家好，今天 demo 的是 **Zipf 定律 + Word2Vec** 的檢索系統。

[[開啟首頁|goto /]]

## 2. 詞頻分布 Zipf

先看前處理每一步對詞頻分布的影響。

[[切到 Zipf 分頁|clicktext "詞頻分布 Zipf"; scroll #step-switch top]]

- A → B 去標點：長尾變短
- B → C 去停用詞：頭部最明顯

[[看 B → C|click #step-switch button[data-step="BC"]; highlight #zipf-chart]]
[[四組一起比|click #step-switch button[data-step="ALL"]]]

接著疊上 Luhn 的上下切點，說明中間那一段才是有鑑別力的詞。

[[疊上 Luhn 切點|click #luhn-toggle; scroll #luhn-panel]]

## 3. 單詞統計

```cue 查 osa 的 CF / DF / IDF
scroll #term-input
type #term-input "osa"
click #term-btn
wait 600
highlight #term-output
```

## 4. Word2Vec

[[切到 Word2Vec|flow 到W2V]]

查跟 insulin 最相近的詞，說明 Skip-gram 抓到的是語意鄰居。

[[查 insulin 近鄰|type #w2v-input "insulin"; click #w2v-btn; wait 800; highlight #sim-list]]

比較 Skip-gram 與 CBOW 的投影圖：

[[切 CBOW|clicktext "CBOW"]] [[切 t-SNE|clicktext "t-SNE"]]

## 5. 檢索與拼字校正

故意打錯字 diabetis，看系統怎麼校正。

[[示範拼字校正|flow 搜尋示範]]

## 6. 結語

謝謝大家！[[回到頂端|scrollto top]]

```flow 到W2V
clicktext "詞向量 Word2Vec"
wait 300
scroll #w2v-input top
```

```flow 搜尋示範
clicktext "檢索與拼字校正"
type #search-input "diabetis"
click #search-btn
wait 1000
highlight #search-output 3000
```
