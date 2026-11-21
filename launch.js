// 從 VS Code 等環境啟動時可能帶著 ELECTRON_RUN_AS_NODE，會讓 Electron 變成純 Node 執行，先清掉
const { spawn } = require('child_process');
const electron = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.'], { cwd: __dirname, env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
