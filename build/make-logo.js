// 產生 assets/ 裡的 logo SVG（文字轉成向量路徑，不依賴使用者電腦上的字型）
// 字型：Space Grotesk（SIL Open Font License 1.1）
// 用法：相依套件裝在暫存資料夾就好，不必加進本專案
//   cd <暫存資料夾> && npm i opentype.js@1.3.4 @fontsource/space-grotesk@5.1.0
//   NODE_PATH=<暫存資料夾>/node_modules node build/make-logo.js assets
const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const fontDir = path.join(path.dirname(require.resolve('@fontsource/space-grotesk/package.json')), 'files');
const bold = opentype.loadSync(path.join(fontDir, 'space-grotesk-latin-700-normal.woff'));
const medium = opentype.loadSync(path.join(fontDir, 'space-grotesk-latin-500-normal.woff'));

const f = (n) => Math.round(n * 100) / 100;

// 方孔要能「透出」背景：用 mask 挖洞，淺色、深色背景都適用
function markMasked(cx, cy, d, idp) {
  const r = d * 0.17;
  const h = d * 0.34;
  return `
  <mask id="${idp}m" maskUnits="userSpaceOnUse" x="${f(cx - d)}" y="${f(cy - d)}" width="${f(d * 2)}" height="${f(d * 2)}">
    <rect x="${f(cx - d)}" y="${f(cy - d)}" width="${f(d * 2)}" height="${f(d * 2)}" fill="#fff"/>
    <rect x="${f(cx - h / 2)}" y="${f(cy - h / 2)}" width="${f(h)}" height="${f(h)}" rx="${f(d * 0.06)}" fill="#000" transform="rotate(45 ${f(cx)} ${f(cy)})"/>
  </mask>
  <g mask="url(#${idp}m)">
    <rect x="${f(cx - d / 2)}" y="${f(cy - d / 2)}" width="${f(d)}" height="${f(d)}" rx="${f(r)}" fill="url(#${idp}gl)" transform="rotate(45 ${f(cx)} ${f(cy)})"/>
  </g>`;
}

function gradAbs(idp, cx, cy, d) {
  // 對角漸層：左上青 → 右下靛（旋轉後視覺上是上青下靛）
  return `<linearGradient id="${idp}gl" x1="${f(cx)}" y1="${f(cy - d * 0.7)}" x2="${f(cx)}" y2="${f(cy + d * 0.7)}" gradientUnits="userSpaceOnUse" gradientTransform="rotate(-45 ${f(cx)} ${f(cy)})">
      <stop offset="0" stop-color="#22d3ee"/>
      <stop offset="1" stop-color="#6366f1"/>
    </linearGradient>`;
}

// ---------- 1. 獨立標誌（透明底） ----------
{
  const S = 256, d = 132, cx = S / 2, cy = S / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img" aria-label="CueDeck">
  <title>CueDeck</title>
  <defs>${gradAbs('k', cx, cy, d)}</defs>${markMasked(cx, cy, d, 'k')}
</svg>
`;
  fs.writeFileSync(path.join(out, 'logo-mark.svg'), svg);
}

// ---------- 2. App 圖示（深色圓角底板，與 build/icon.png 一致） ----------
{
  const S = 512, m = S * 0.04, w = S - m * 2, d = S * 0.36, cx = S / 2, cy = S / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img" aria-label="CueDeck">
  <title>CueDeck</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="${S}" y2="${S}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#16213a"/><stop offset="1" stop-color="#0b1120"/>
    </linearGradient>
    <radialGradient id="halo" cx="${S * 0.8}" cy="${S * 0.15}" r="${S * 0.6}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#6366f1" stop-opacity=".45"/><stop offset="1" stop-color="#6366f1" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="${f(S * 0.04)}" result="b"/>
      <feFlood flood-color="#22d3ee" flood-opacity=".65" result="c"/>
      <feComposite in="c" in2="b" operator="in"/>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    ${gradAbs('a', cx, cy, d)}
  </defs>
  <rect x="${m}" y="${m}" width="${w}" height="${w}" rx="${S * 0.22}" fill="url(#bg)" stroke="#94a3b8" stroke-opacity=".28" stroke-width="${S * 0.006}"/>
  <rect x="${m}" y="${m}" width="${w}" height="${w}" rx="${S * 0.22}" fill="url(#halo)"/>
  <g transform="rotate(45 ${cx} ${cy})" filter="url(#glow)">
    <rect x="${f(cx - d / 2)}" y="${f(cy - d / 2)}" width="${f(d)}" height="${f(d)}" rx="${f(S * 0.03)}" fill="url(#ag)"/>
  </g>
  <rect x="${f(cx - d * 0.17)}" y="${f(cy - d * 0.17)}" width="${f(d * 0.34)}" height="${f(d * 0.34)}" rx="${f(S * 0.01)}" fill="#0e1628" transform="rotate(45 ${cx} ${cy})"/>
</svg>
`;
  // 這個版本的漸層 id 用 ag（rotate 前的座標），補一個定義
  fs.writeFileSync(path.join(out, 'app-icon.svg'), svg.replace('</defs>', `<linearGradient id="ag" x1="${f(cx - d / 2)}" y1="${f(cy - d / 2)}" x2="${f(cx + d / 2)}" y2="${f(cy + d / 2)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#6366f1"/></linearGradient>
  </defs>`));
}

// ---------- 3. 橫式標準字（標誌 + CueDeck），淺色與深色兩版 ----------
function lockup(file, ink, sub) {
  const H = 160, d = 92, cx = 80, cy = H / 2, size = 92;
  const gap = 34;
  const x0 = cx + d * 0.71 + gap; // 菱形轉 45° 後半寬約 0.71d
  const p1 = bold.getPath('Cue', 0, 0, size);
  const w1 = bold.getAdvanceWidth('Cue', size);
  const p2 = medium.getPath('Deck', 0, 0, size);
  const w2 = medium.getAdvanceWidth('Deck', size);
  // 以大寫字高置中
  const capH = (bold.tables.os2.sCapHeight || bold.unitsPerEm * 0.7) / bold.unitsPerEm * size;
  const base = cy + capH / 2;
  const t1 = bold.getPath('Cue', x0, base, size).toPathData(2);
  const t2 = medium.getPath('Deck', x0 + w1 + 2, base, size).toPathData(2);
  const W = Math.ceil(x0 + w1 + 2 + w2 + 24);
  void p1; void p2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="CueDeck">
  <title>CueDeck</title>
  <defs>${gradAbs('l', cx, cy, d)}</defs>${markMasked(cx, cy, d, 'l')}
  <path d="${t1}" fill="${ink}"/>
  <path d="${t2}" fill="${sub}"/>
</svg>
`;
  fs.writeFileSync(path.join(out, file), svg);
}
lockup('logo-light.svg', '#0f172a', '#4f46e5'); // 給淺色背景（GitHub 淺色主題）
lockup('logo-dark.svg', '#f8fafc', '#818cf8');  // 給深色背景（GitHub 深色主題）

console.log('done', fs.readdirSync(out));
