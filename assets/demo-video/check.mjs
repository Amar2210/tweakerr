// Bounded final-MP4 native Chrome playback/seek check; no app tests or network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const { chromium } = await import(process.argv[2] || process.env.TWEAKERR_PLAYWRIGHT || '@playwright/test');
const root = path.dirname(fileURLToPath(import.meta.url));
const movie = path.join(root,'../tweakerr-demo.mp4');
const validation = JSON.parse(fs.readFileSync(path.join(root,'validation.json')));
assert.equal(createHash('sha256').update(fs.readFileSync(movie)).digest('hex'),validation.sha256);
const server = createServer((req,res) => {
  if(req.url === '/') { res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Local film check</title><video id="v" muted playsinline preload="auto" src="/film.mp4"></video>');return; }
  if(req.url !== '/film.mp4') { res.writeHead(404);res.end();return; }
  const size=fs.statSync(movie).size, range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
  res.setHeader('Content-Type','video/mp4');res.setHeader('Accept-Ranges','bytes');
  if(range) { const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),size-1):size-1;res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});fs.createReadStream(movie,{start,end}).pipe(res); }
  else { res.writeHead(200,{'Content-Length':size});fs.createReadStream(movie).pipe(res); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,executablePath:process.env.TWEAKERR_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context=await browser.newContext();const errors=[],external=[];
  await context.route('**/*',route=>{if(route.request().url().startsWith(origin+'/'))return route.continue();external.push(route.request().url().split(':')[0]);return route.abort();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/');
  await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
  const check=await page.evaluate(async()=>{
    const v=document.querySelector('video');
    const technical={duration:v.duration,width:v.videoWidth,height:v.videoHeight};
    v.playbackRate=2;
    const playback=await new Promise((resolve,reject)=>{
      let count=0,last=-1;const milestones=[],targets=[.8,5.4,8.9,11.4,13.8,15.8,18.2];
      const timeout=setTimeout(()=>{v.pause();reject(Error('Film playback stalled'));},20000);
      v.onerror=()=>{clearTimeout(timeout);reject(Error('Film decode failed'));};
      v.onended=()=>{clearTimeout(timeout);resolve({ended:true,rate:2,frameCallbacks:count,lastPresentedSeconds:last,milestones});};
      const frame=(_,meta)=>{
        if(meta.mediaTime<last) { clearTimeout(timeout);v.pause();reject(Error('Non-monotonic presented frames'));return; }
        count++;last=meta.mediaTime;
        while(targets.length&&last>=targets[0])milestones.push({requested:targets.shift(),presented:last});
        if(!v.ended)v.requestVideoFrameCallback(frame);
      };
      v.requestVideoFrameCallback(frame);v.play().catch(reject);
    });
    const seeks=[];
    for(const t of [5.4,13.8,18.2]) {
      v.pause();v.playbackRate=1;
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Seek stalled')),5000);v.onseeked=()=>{clearTimeout(timer);resolve();};v.currentTime=t;});
      const picture=await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{v.pause();reject(Error('No timestamp-matched decoded frame'));},5000);
        const frame=(_,meta)=>{if(meta.mediaTime>=t-.04&&meta.mediaTime<t+.2){v.pause();clearTimeout(timer);resolve(meta.mediaTime);}else v.requestVideoFrameCallback(frame);};
        v.requestVideoFrameCallback(frame);v.play().catch(reject);
      });
      const c=document.createElement('canvas');c.width=192;c.height=108;c.getContext('2d').drawImage(v,0,0,192,108);
      seeks.push({requested:t,presented:picture,pixels:c.toDataURL('image/jpeg')});
    }
    return {...technical,playback,seeks};
  });
  assert.equal(check.duration,18.8);assert.equal(check.width,1920);assert.equal(check.height,1080);
  assert(check.playback.ended&&check.playback.lastPresentedSeconds>=18.7&&check.playback.frameCallbacks>200);
  assert.equal(check.playback.milestones.length,7);
  for(const mark of check.playback.milestones)assert(mark.presented-mark.requested<.3);
  for(const seek of check.seeks){assert(Math.abs(seek.presented-seek.requested)<.2);seek.pictureSha256=createHash('sha256').update(seek.pixels).digest('hex');delete seek.pixels;}
  assert.equal(new Set(check.seeks.map(x=>x.pictureSha256)).size,3);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  validation.chromePlayback={result:'PASS',...check,errors,external,audioAuditioned:false};
  fs.writeFileSync(path.join(root,'validation.json'),JSON.stringify(validation,null,2)+'\n');
  console.log(JSON.stringify(validation.chromePlayback,null,2));
} finally {await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
