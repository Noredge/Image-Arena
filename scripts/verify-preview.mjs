// Isolated Edge/CDP acceptance of the production Web build. No external packages.
// Run after npm run build: node scripts/verify-preview.mjs
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'test-results/acceptance');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(resolve(output, 'edge-profile-'));
const dist = resolve(root, 'dist');
const server = createServer(async (req, res) => {
  const path = resolve(dist, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (path !== dist && !path.startsWith(dist + sep)) { res.writeHead(403).end(); return; }
  try {
    const file = path === dist ? resolve(dist, 'index.html') : path;
    const bytes = await readFile(file);
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' })[extname(file)] ?? 'application/octet-stream');
    res.end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
const edge = spawn(process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(r => setTimeout(r, ms));
let socket, sequence = 0;
const requests = new Map(), errors = [], checks = [];
function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { requests.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 15000);
    requests.set(id, { resolve: r => { clearTimeout(timer); resolve(r); }, reject: e => { clearTimeout(timer); reject(e); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function until(expression) {
  for (let n = 0; n < 100; n++) { if (await evaluate(`Boolean(${expression})`)) return; await delay(100); }
  throw Error(`Timed out waiting: ${expression}`);
}
async function check(name, expression) { assert.ok(await evaluate(`Boolean(${expression})`), name); checks.push(name); }
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
async function mouse(selector) {
  const p = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 });
}
async function viewport(width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await delay(150);
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(resolve(output, name + '.png'), Buffer.from(r.data, 'base64'));
}
try {
  let port;
  for (let n = 0; n < 100; n++) {
    try { port = Number((await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await delay(100); }
  }
  assert.ok(port, 'Edge debug port');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
  socket.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.id) { const waiter = requests.get(data.id); requests.delete(data.id); if (data.error) waiter?.reject(Error(JSON.stringify(data.error))); else waiter?.resolve(data.result); }
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails);
    if (data.method === 'Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog', { accept: false });
  };
  await send('Runtime.enable'); await send('Page.enable');
  await viewport(1366, 900); await send('Page.navigate', { url });
  await until('!!document.querySelector(".prepare-main")');
  // Generate six real PNGs in the isolated browser, then feed its native file input.
  await evaluate(`(async()=>{const d=new DataTransfer();for(let i=0;i<6;i++){const c=document.createElement('canvas');c.width=i%2?480:320;c.height=i%2?320:480;const x=c.getContext('2d');x.fillStyle=['#bd7857','#779a90','#7d8cbb','#c5a555','#9d7dad','#739bae'][i];x.fillRect(0,0,c.width,c.height);x.fillStyle='#fff';x.font='80px sans-serif';x.fillText(String(i+1),80,180);d.items.add(new File([await new Promise(r=>c.toBlob(r))], 'sample-'+i+'.png',{type:'image/png'}));}const input=document.querySelector('input[type=file]');input.files=d.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until('document.querySelectorAll(".thumbnail").length===6 && !document.querySelector(".start").disabled');
  await check('successful import clears progress', '!document.querySelector(".import-progress") && !document.querySelector(".import-errors")');
  await click('.start'); await until('!!document.querySelector("[data-testid=vote-0]:not(:disabled)")');
  const zoom = async () => {
    const p = await evaluate('(()=>{const r=document.querySelector("[data-testid=image-0]").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p });
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...p, deltaX: 0, deltaY: -240 });
    await until('Number(document.querySelector("[data-testid=image-0]").dataset.zoom)>1');
  };
  await zoom(); checks.push('wide mouse wheel zoom');
  await viewport(640, 900);
  await check('resize preserves zoom', 'Number(document.querySelector("[data-testid=image-0]").dataset.zoom)>1 && document.querySelector(".compact")');
  await click('.inspect-controls button:last-child'); await zoom(); checks.push('narrow mouse wheel zoom');
  await mouse('.compact-settings > summary');
  await mouse('[data-testid=vote-0]'); await delay(100);
  await check('outside settings click closes without voting', '!document.querySelector(".compact-settings").open && document.querySelector("[data-testid=comparison-count]").textContent==="0"');
  await mouse('[data-testid=vote-0]'); await until('document.querySelector("[data-testid=comparison-count]").textContent==="1" && !!document.querySelector("[data-testid=vote-0]:not(:disabled)")');
  await click('.battle-meta button'); await until('document.querySelector("[data-testid=comparison-count]").textContent==="0" && !!document.querySelector("[data-testid=vote-0]:not(:disabled)")');
  checks.push('vote then undo');
  await click('.zoom-button'); await until('!!document.querySelector(".viewer")');
  await evaluate('history.back()'); await until('!document.querySelector(".viewer")');
  await check('compact browser back closes viewer only', 'document.querySelector("[data-testid=comparison-count]").textContent==="0"');
  await click('.brand'); await until('!!document.querySelector(".confirm-dialog")');
  await click('.confirm-dialog .secondary');
  await check('cancel return preserves match', '!!document.querySelector(".battle-main") && !document.querySelector(".confirm-dialog")');
  for (const [w,h] of [[390,844],[844,390],[360,640],[1366,900]]) {
    await viewport(w,h);
    await check(`layout ${w}x${h} fits width`, 'document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll("[data-testid^=vote-]")].every(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.bottom<=innerHeight+1})');
    await shot(`battle-${w}x${h}`);
  }
  await click('.brand'); await click('.confirm-dialog .primary'); await until('!!document.querySelector(".prepare-main")');
  for (let mode = 0; mode < 5; mode++) {
    await evaluate(`document.querySelectorAll('.competition-picker button')[${mode}].click()`);
    await click('.start');
    let votes = 0;
    while (!(await evaluate('!!document.querySelector(".results-main")'))) {
      await until('!!document.querySelector(".results-main") || !!document.querySelector("[data-testid=vote-0]:not(:disabled)")');
      if (await evaluate('!!document.querySelector(".results-main")')) break;
      await click('[data-testid=vote-0]'); await delay(330);
      assert.ok(++votes < 100, 'tournament terminates');
    }
    await check(`mode ${mode + 1} results`, `document.querySelectorAll('.podium-card').length===${mode === 0 ? 3 : 1}`);
    await until('!!document.querySelector(".brand:not(:disabled)")');
    await click('.brand'); await until('!!document.querySelector(".prepare-main")');
    await check(`mode ${mode + 1} completed return retains images`, 'document.querySelectorAll(".thumbnail").length===6 && !document.querySelector(".confirm-dialog")');
  }
  // A malformed import reports a named error without removing accepted pictures.
  await evaluate(`(()=>{const d=new DataTransfer();d.items.add(new File(['broken'],'broken.png',{type:'image/png'}));const i=document.querySelector('input[type=file]');i.files=d.files;i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until('!!document.querySelector(".import-errors")');
  await check('bad import retains originals and reports progress/error', 'document.querySelectorAll(".thumbnail").length===6 && document.querySelector(".import-errors").textContent.includes("broken.png") && document.querySelector(".import-progress").textContent.includes("1 / 1")');
  await shot('import-error');
  assert.deepEqual(errors, [], 'no unhandled runtime exceptions');
  await writeFile(resolve(output, 'proof.json'), JSON.stringify({ date: new Date().toISOString(), checks, runtimeErrors: errors, scope: 'Isolated headless Edge production Web build; DOM actions plus actual CDP mouse/wheel; no physical mobile or native EXE claim.' }, null, 2));
  console.log(`PASS: ${checks.length} acceptance checks; evidence in ${output}`);
} catch (error) {
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ error: String(error), checks, runtimeErrors: errors }, null, 2));
  throw error;
} finally {
  if (socket?.readyState === WebSocket.OPEN) { await send('Browser.close').catch(() => {}); socket.close(); }
  else edge.kill();
  server.close();
}
