// Deterministic Canvas composition rendered in installed native Chrome.
// Usage: node render.mjs [Playwright module URL] --work=C:/unique/Temp/folder [--preview]
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
const moduleArg = process.argv.slice(2).find(x => !x.startsWith('--'));
const { chromium } = await import(moduleArg || process.env.TWEAKERR_PLAYWRIGHT || '@playwright/test');
const root = path.dirname(fileURLToPath(import.meta.url));
const workArg = process.argv.find(x => x.startsWith('--work='))?.slice(7);
const work = workArg ? path.resolve(workArg) : await fs.mkdtemp(path.join(tmpdir(), 'tweakerr-demo-comments-'));
await fs.mkdir(work, { recursive: true });
const types = { '.html':'text/html', '.js':'text/javascript', '.svg':'image/svg+xml', '.png':'image/png', '.wav':'audio/wav' };
const allowed = new Map([['/',path.join(root,'motion.html')],['/motion.js',path.join(root,'motion.js')],['/soundtrack-film.wav',path.join(root,'soundtrack-film.wav')],['/logo.svg',path.join(root,'../logo.svg')]]);
const server = createServer(async (req,res) => {
  const file = allowed.get(req.url) || (/^\/shots\/[a-z0-9-]+\.png$/.test(req.url) ? path.join(root,req.url.slice(1)) : null);
  try { if(!file)throw Error('not allowed'); const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream'});res.end(bytes); }
  catch { res.writeHead(404);res.end(); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless:true, executablePath:process.env.TWEAKERR_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const context = await browser.newContext({ viewport:{width:1920,height:1080}, deviceScaleFactor:1 });
  const errors=[], external=[];
  await context.route('**/*',route => { if(route.request().url().startsWith(origin+'/'))return route.continue(); external.push(route.request().url().split(':')[0]);return route.abort(); });
  const page = await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/'); await page.evaluate(()=>window.assetsReady);
  await page.locator('#play').evaluate(el=>el.remove());
  const spec=await page.evaluate(()=>window.videoSpec), frames=Math.round(spec.duration*spec.fps);
  const preview=process.argv.includes('--preview');
  const output=path.join(work,preview?'previews':'frames');await fs.mkdir(output,{recursive:true});
  const times=preview?[11.8,15,18,19.4]:Array.from({length:frames},(_,i)=>i/spec.fps);
  for(let i=0;i<times.length;i++) {
    const data=await page.evaluate(async t=>{await window.renderFrame(t);return document.querySelector('#film').toDataURL('image/jpeg',.98).split(',')[1];},times[i]);
    await fs.writeFile(path.join(output,preview?`frame-${times[i]}.jpg`:`${String(i).padStart(4,'0')}.jpg`),Buffer.from(data,'base64'));
    if(!preview&&i%120===0)console.log(`${i}/${frames} frames rendered`);
  }
  if(errors.length||external.length)throw Error(JSON.stringify({errors,external}));
  const report={...spec,frames,renderedFrames:times.length,preview,previewTimes:preview?times:undefined,errors,external,work,renderer:'Installed Windows Chrome; deterministic Canvas; real editor still captures'};
  await fs.writeFile(path.join(work,preview?'preview-validation.json':'render-validation.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally { await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
