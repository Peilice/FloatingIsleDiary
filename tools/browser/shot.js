// 無頭 Chrome 截圖與執行腳本（不需要瀏覽器擴充、不出聲）
// 用法：node tools/browser/shot.js <腳本檔.js> [輸出資料夾]
//   腳本檔內容是一個 async 函式本體，可以用：
//     await go(url)              開網址（自動加 mute=1）
//     await js('運算式')          在頁面執行並回傳結果（可 await）
//     await shot('名稱')          截圖存成 <輸出資料夾>/<名稱>.png
//     await wait(毫秒)
//     await click(x, y)          點遊戲座標
//     log(...)                   印到終端機
// 需要先開著遊戲伺服器：cd game && python -m http.server 8080
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
  .find((p) => fs.existsSync(p));
const script = fs.readFileSync(process.argv[2], 'utf8');
const outDir = process.argv[3] || path.join(os.tmpdir(), 'fid-shots');
fs.mkdirSync(outDir, { recursive: true });
const PORT = 9333 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fid-chrome-'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
    '--window-size=1280,720', '--mute-audio', '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await wait(200);
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page'); } catch (e) { /* 還沒起來 */ }
  }
  if (!target) { console.error('Chrome 沒有啟動'); proc.kill(); process.exit(1); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = {};
  const errors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

  const go = async (url) => { url += (url.includes('?') ? '&' : '?') + 'mute=1'; await send('Page.navigate', { url }); await wait(1500); };
  const js = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `(async () => (${expr}))()`, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result.result.value;
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const f = path.join(outDir, name + '.png'); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); console.log('shot', f);
  };
  const log = (...a) => console.log(...a);
  // 點畫面座標（視窗 1280×720，遊戲 canvas 剛好填滿，座標＝遊戲座標）
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    await wait(300);
  };
  try {
    await new Function('go', 'js', 'shot', 'wait', 'log', 'click', 'return (async () => {' + script + '\n})()')(go, js, shot, wait, log, click);
  } catch (e) { console.error('腳本錯誤：', e.message); }
  if (errors.length) console.log('頁面錯誤：\n' + errors.join('\n'));
  ws.close(); proc.kill();
  setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* Chrome 還沒放開 */ } process.exit(0); }, 500);
})();
