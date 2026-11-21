// 產生 App 圖示 build/icon.png（512×512）：node_modules/.bin/electron build/make-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZE = 512;
const html = `<!doctype html><style>html,body{margin:0;overflow:hidden;background:transparent}canvas{display:block;width:${SIZE}px;height:${SIZE}px}</style><body><canvas id="c" width="${SIZE * 2}" height="${SIZE * 2}"></canvas><script>
const c = document.getElementById('c').getContext('2d');
const S = ${SIZE * 2}; // 用兩倍解析度畫，縮放比例 200% 的螢幕也不會糊
// 深色圓角底板
const r = S * 0.22, m = S * 0.04, w = S - m * 2;
c.beginPath(); c.roundRect(m, m, w, w, r);
const bg = c.createLinearGradient(0, 0, S, S); bg.addColorStop(0, '#16213a'); bg.addColorStop(1, '#0b1120');
c.fillStyle = bg; c.fill();
c.lineWidth = S * 0.012; c.strokeStyle = 'rgba(148,163,184,.28)'; c.stroke();
// 右上角的靛紫光暈
c.save(); c.clip();
const glow = c.createRadialGradient(S * 0.8, S * 0.15, 0, S * 0.8, S * 0.15, S * 0.6);
glow.addColorStop(0, 'rgba(99,102,241,.45)'); glow.addColorStop(1, 'rgba(99,102,241,0)');
c.fillStyle = glow; c.fillRect(0, 0, S, S); c.restore();
// 漸層菱形（同介面 logo）
c.save(); c.translate(S / 2, S / 2); c.rotate(Math.PI / 4);
const d = S * 0.36;
c.shadowColor = 'rgba(34,211,238,.65)'; c.shadowBlur = S * 0.08;
c.beginPath(); c.roundRect(-d / 2, -d / 2, d, d, S * 0.06);
const g = c.createLinearGradient(-d / 2, -d / 2, d / 2, d / 2); g.addColorStop(0, '#22d3ee'); g.addColorStop(1, '#6366f1');
c.fillStyle = g; c.fill();
// 中間挖一個小方孔，像「提示點」
c.shadowBlur = 0; c.beginPath(); c.roundRect(-d * 0.17, -d * 0.17, d * 0.34, d * 0.34, S * 0.02);
c.fillStyle = '#0e1628'; c.fill(); c.restore();
</script></body>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: SIZE, height: SIZE, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
  fs.writeFileSync(path.join(__dirname, 'icon.png'), img.resize({ width: SIZE, height: SIZE }).toPNG());
  console.log('icon.png', img.getSize());
  app.exit(0);
});
