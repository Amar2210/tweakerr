// Capture ONLY the synthetic Orbit fixture with the current standalone editor.
// Windows Node + installed Windows Chrome; no providers, credentials or network.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const { chromium, expect } = await import(process.argv[2] || process.env.TWEAKERR_PLAYWRIGHT || '@playwright/test');
const here = path.dirname(fileURLToPath(import.meta.url));
const build = await fs.readFile(path.resolve(here, '../../dist/tweakerr.html'));
const source = await fs.readFile(path.join(here, 'orbit-dashboard.html'));
const errors = [], external = [], requests = [], shots = {};
const server = createServer((req, res) => {
  requests.push(req.url);
  if (req.url === '/tweakerr.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(build); }
  else { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.TWEAKERR_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 920 }, deviceScaleFactor: 2, colorScheme: 'dark', reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    if (route.request().url().startsWith(origin + '/')) return route.continue();
    external.push(route.request().url().split(':')[0]); return route.abort();
  });
  await context.addInitScript(() => { window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined; });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/tweakerr.html');
  assert.equal(await page.locator('#editor-surface, #ai-settings, #file-intent, [data-cmd="revise-ai"]').count(), 0);
  const snap = async name => {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(here, 'shots', name + '.png') });
    shots[name] = await page.evaluate(() => {
      const box = sel => { const el = document.querySelector(sel); if (!el || el.hidden) return null; const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(n => Math.round(n * 100) / 100); };
      const { editor, stage } = window.tweakerr;
      const rect = editor.doc.querySelector('#hero-title').getBoundingClientRect(), base = stage.stage.getBoundingClientRect(), z = editor.zoom;
      return { headline: [base.x + rect.x*z, base.y + rect.y*z, rect.width*z, rect.height*z], frame: box('#frame'), props: box('#props'), popover: box('.popover'), comment: box('.comment-popover'), add: box('.comment-add'), marker: box('.comment-marker'), save: box('.toolbar [data-cmd="save"]') };
    });
    console.log('Captured', name);
  };
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.toolbar [data-cmd="open"]').click();
  await (await chooser).setFiles({ name: 'orbit-dashboard.html', mimeType: 'text/html', buffer: source });
  await expect.poll(() => page.evaluate(() => !!window.tweakerr?.editor?.doc)).toBe(true);
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 10000 });
  await snap('opened');
  const point = async selector => page.evaluate(sel => {
    const { editor, stage } = window.tweakerr, r = editor.doc.querySelector(sel).getBoundingClientRect(), b = stage.stage.getBoundingClientRect();
    return { x: b.x + (r.x + r.width*.35)*editor.zoom, y: b.y + (r.y+r.height*.4)*editor.zoom };
  }, selector);
  let p = await point('#hero-title'); await page.mouse.click(p.x,p.y);
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  await snap('selected');
  p = await point('#hero-title'); await page.mouse.dblclick(p.x,p.y);
  const title = page.frameLocator('#frame').locator('#hero-title');
  await expect(title).toHaveAttribute('contenteditable','plaintext-only');
  await page.keyboard.press('Control+a'); await page.keyboard.type('Make'); await snap('type1');
  await page.keyboard.type(' it'); await snap('type2');
  await page.keyboard.type(' yours.'); await snap('type3');
  await page.keyboard.press('Escape'); await snap('text-edited');
  const field = (label, section) => page.locator('#props details.section').filter({ has: page.locator('summary', { hasText: new RegExp(`^${section}$`) }) }).locator('.ctl-row, .ctl-inline, .ctl-block').filter({ has: page.locator(':scope > .ctl-label', { hasText: new RegExp(`^${label}$`) }) }).first();
  await field('Font','Text').locator('input').fill('Georgia');
  await field('Font','Text').locator('input').press('Enter');
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  await snap('font-edited');
  await field('Colour','Text').locator('button').first().click();
  await snap('hex-before');
  await page.getByRole('textbox', { name: 'HEX colour' }).fill('#caff79');
  await page.getByRole('textbox', { name: 'HEX colour' }).press('Enter');
  await snap('hex-edited');
  await page.keyboard.press('Escape'); await snap('colour-edited');
  p = await point('#launch-button'); await page.mouse.click(p.x,p.y);
  await page.getByRole('tab', { name: 'Style', exact: true }).click();
  await field('Gradient','Fill & border').getByRole('checkbox').check();
  for (const [label,value] of [['Colour 1','#caff79'],['Colour 2','#83dccf']]) {
    const input = field(label,'Gradient').locator('input.ctl-input'); await input.fill(value); await input.press('Enter');
  }
  await page.getByRole('tab', { name: 'Style', exact: true }).click();
  await snap('gradient-edited');
  // The actual canvas selection, comment Add/input/Save buttons and file Save.
  p = await point('#hero-title'); await page.mouse.click(p.x,p.y);
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  await snap('comment-target');
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  await snap('comment-open');
  await page.locator('.comment-input').pressSequentially('Keep this headline', { delay: 12 });
  await snap('comment-typing');
  await page.locator('.comment-input').pressSequentially(' short and bold.', { delay: 12 });
  await snap('comment-written');
  await page.locator('.comment-save').click();
  await expect(page.locator('.comment-popover')).toBeHidden();
  await expect(page.locator('.comment-marker')).toHaveAttribute('aria-label','Open comment 1');
  await snap('comment-saved');
  const download = page.waitForEvent('download');
  await page.locator('.toolbar [data-cmd="save"]').click();
  const result = await download; await result.saveAs(path.join(here,'orbit-dashboard-edited.html'));
  await snap('saved');
  const saved = await fs.readFile(path.join(here,'orbit-dashboard-edited.html'),'utf8');
  const state = await page.evaluate(() => {
    const { editor } = window.tweakerr, doc = editor.doc, h = doc.querySelector('#hero-title'), b = doc.querySelector('#launch-button'), cs = doc.defaultView.getComputedStyle(h);
    return { headline: h.textContent, font: cs.fontFamily, colour: cs.color, gradient: doc.defaultView.getComputedStyle(b).backgroundImage, comments: editor.comments.export(), dirty: editor.dirty };
  });
  assert.equal(state.headline,'Make it yours.'); assert.equal(state.font,'Georgia, serif'); assert.equal(state.colour,'rgb(202, 255, 121)');
  assert.equal(state.gradient,'linear-gradient(rgb(202, 255, 121), rgb(131, 220, 207))');
  assert.equal(state.comments.length,1); assert.equal(state.comments[0].text,'Keep this headline short and bold.');
  assert.equal(state.comments[0].targets[0].identity.value,'hero-title');
  assert(saved.includes('Tweakerr revision comments v1') && saved.includes(state.comments[0].text));
  assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
  const report = { result:'PASS', buildSha256:createHash('sha256').update(build).digest('hex'), viewport:{width:1440,height:920,deviceScaleFactor:2}, fixture:'orbit-dashboard.html', savedFile:'orbit-dashboard-edited.html', downloadName:result.suggestedFilename(), ...state, shots, errors, external, requests, providerCalls:0 };
  await fs.writeFile(path.join(here,'capture-validation.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({result:report.result,buildSha256:report.buildSha256,shots:Object.keys(shots).length,errors,external,providerCalls:0}));
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
