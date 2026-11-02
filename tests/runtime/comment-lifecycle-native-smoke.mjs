// Bounded native-Chrome UI check, separate from the stopped E2E regression suite.
// Run with installed Windows Node/Chrome; optional args are an installed Playwright
// module URL and a built tweakerr.html path. No provider/key/inference/download is used.
const { chromium, expect } = await import(process.argv[2] ?? '@playwright/test');
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const html = readFileSync(process.argv[3] ?? new URL('../../dist/tweakerr.html', import.meta.url));
const artifacts = mkdtempSync(join(tmpdir(), 'tweakerr-comment-lifecycle-'));
const errors = [], dialogs = [], external = [], unexpectedRequests = [], downloads = [];
const hash = (text) => { let value = 2166136261; for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619); return (value >>> 0).toString(16); };
const target = (id, key, text) => ({ key, label: `button#${id} — ${text}`, selector: `[id="${id}"]`, identity: { attribute: 'id', value: id },
  fingerprint: { tag: 'button', text, textHash: hash(text), attributes: {} }, unique: true });
const notes = [
  { id: 'C2', status: 'resolved', text: 'Earlier completed request', resolution: 'Legacy summary', targets: [target('second', 'resolved-target', 'Second card')] },
  { id: 'C5', status: 'pending', text: 'Current request', targets: [target('first', 'pending-target', 'First card')] },
];
const source = '<!-- Tweakerr revision comments v1\n' + JSON.stringify({ version: 1, comments: notes }, null, 2) + '\n-->\n'
  + '<!doctype html><html><head><title>Comment lifecycle</title><style>body{margin:0;padding:100px 90px;background:#eee;color:#222;font-family:system-ui}button{display:block;width:360px;height:120px;margin:0 0 100px;font:24px system-ui}</style></head><body><button id="first">First card</button><button id="second">Second card</button></body></html>\n';
const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/tweakerr.html') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end(html); }
  else {
    if (request.method !== 'GET' || request.url !== '/favicon.ico') unexpectedRequests.push({ method: request.method, path: request.url });
    response.writeHead(404); response.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', colorScheme: 'dark' });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(origin + '/')) return route.continue();
    external.push(url.split(':')[0]); return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', async (dialog) => { dialogs.push(dialog.type()); await dialog.dismiss(); });
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await page.addInitScript(() => { if (window === window.top) { window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined; } });
  await page.goto(origin + '/tweakerr.html');
  assert.equal(await page.locator('#editor-surface, #ai-settings, #file-intent, [data-cmd="revise-ai"]').count(), 0);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#empty [data-cmd="open"]').click();
  await (await chooser).setFiles({ name: 'comment-lifecycle.html', mimeType: 'text/html', buffer: Buffer.from(source) });
  await expect(page.locator('#file-name')).toContainText('comment-lifecycle.html');
  await expect.poll(() => page.evaluate(() => !!window.tweakerr?.editor?.doc)).toBe(true);
  const state = () => page.evaluate(() => ({ comments: window.tweakerr.editor.comments.export(), html: window.tweakerr.serialize(), journal: window.tweakerr.editor.history.changes }));
  const labels = () => page.locator('.comment-history-heading strong').allTextContents();
  await page.locator('#comments-view').click();
  await expect.poll(labels).toEqual(['#1', '#2']);
  await expect(page.locator('.comment-marker')).toHaveAttribute('aria-label', 'Open comment 1');
  assert.deepEqual((await state()).comments.map((comment) => comment.id), ['C2', 'C5']);
  await page.screenshot({ path: join(artifacts, 'sparse-records-compact-labels.png') });

  // Genuine Add/input/keyboard interaction; only fixture selection is set through
  // the root editor debug API so this does not depend on a page's click behavior.
  await page.evaluate(() => window.tweakerr.editor.select(window.tweakerr.editor.doc.querySelector('#first')));
  await page.locator('.comment-add').click();
  await page.locator('.comment-input').fill('CANCELLED-NATIVE-DRAFT');
  await expect(page.locator('.comment-cancel')).toBeVisible();
  await expect.poll(labels).toEqual(['#1', '#2', '#3']);
  await page.locator('.comment-input').press('Tab');
  await expect(page.locator('.comment-save')).toBeFocused();
  await page.locator('.comment-save').press('Tab');
  await expect(page.locator('.comment-cancel')).toBeFocused();
  await page.screenshot({ path: join(artifacts, 'new-draft-cancel-focus.png') });
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.locator('.comment-cancel')).toBeVisible();
  assert.ok(await page.locator('.comment-popover').evaluate((el) => {
    const box = el.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && el.scrollWidth <= el.clientWidth;
  }));
  await page.screenshot({ path: join(artifacts, 'new-draft-cancel-390.png') });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('.comment-cancel').press('Enter');
  await expect(page.locator('.comment-popover')).toBeHidden();
  await expect.poll(labels).toEqual(['#1', '#2']);
  let current = await state();
  assert.deepEqual(current.comments.map((comment) => comment.id), ['C2', 'C5']);
  assert.ok(!current.html.includes('CANCELLED-NATIVE-DRAFT'));
  assert.deepEqual(current.journal, []);

  await page.locator('.comment-add').click();
  await page.locator('.comment-input').fill('ESCAPE-NATIVE-DRAFT');
  await page.locator('.comment-input').press('Escape');
  await expect(page.locator('.comment-popover')).toBeHidden();
  current = await state(); assert.ok(!current.html.includes('ESCAPE-NATIVE-DRAFT'));
  await expect.poll(labels).toEqual(['#1', '#2']);

  // Keep the established textarea -> Tab -> Enter Save comment flow intact.
  await page.locator('.comment-add').click();
  await page.locator('.comment-input').fill('KEEP-VIA-KEYBOARD-SAVE');
  await page.locator('.comment-input').press('Tab');
  await expect(page.locator('.comment-save')).toBeFocused();
  await page.locator('.comment-save').press('Enter');
  await expect(page.locator('.comment-popover')).toBeHidden();
  assert.ok((await state()).comments.some((comment) => comment.text === 'KEEP-VIA-KEYBOARD-SAVE'));
  await page.getByRole('button', { name: 'Edit pending comment 2', exact: true }).click();
  await expect(page.locator('.comment-cancel')).toBeHidden();
  await page.getByRole('button', { name: 'Delete comment 2', exact: true }).click();
  await expect.poll(labels).toEqual(['#1', '#2']);

  // Existing-note Escape keeps ordinary autosaved edits; Delete really removes
  // the record, and Undo/Redo relabel the survivor without changing its ID.
  await page.getByRole('button', { name: 'Edit pending comment 1', exact: true }).click();
  await expect(page.locator('.comment-cancel')).toBeHidden();
  await page.locator('.comment-input').fill('Existing note intentionally edited');
  await page.locator('.comment-input').press('Escape');
  assert.equal((await state()).comments.find((comment) => comment.id === 'C5').text, 'Existing note intentionally edited');
  await page.getByRole('button', { name: 'Edit pending comment 1', exact: true }).click();
  await page.getByRole('button', { name: 'Delete comment 1', exact: true }).click();
  await expect.poll(labels).toEqual(['#1']);
  current = await state();
  assert.deepEqual(current.comments.map((comment) => comment.id), ['C2']);
  assert.equal(current.comments[0].resolution, 'Legacy summary');
  assert.ok(!current.html.includes('Existing note intentionally edited'));
  assert.deepEqual(current.journal, []);
  await page.locator('.toolbar [data-cmd="undo"]').click();
  await expect.poll(labels).toEqual(['#1', '#2']);
  assert.equal((await state()).comments.find((comment) => comment.id === 'C5').text, 'Existing note intentionally edited');
  await page.locator('.toolbar [data-cmd="redo"]').click();
  await expect.poll(labels).toEqual(['#1']);
  await page.screenshot({ path: join(artifacts, 'deleted-pending-resolved-retained.png') });
  assert.deepEqual(errors, []); assert.deepEqual(dialogs, []); assert.deepEqual(external, []);
  assert.deepEqual(unexpectedRequests, []); assert.deepEqual(downloads, []);
  const result = { result: 'PASS', artifacts, providerCalls: 0, downloads: downloads.length, errors, dialogs, external, unexpectedRequests,
    checks: 'direct root editor with no integrated API controls; real Add/input/Cancel/Escape and Tab+Enter Save comment; 390px footer fit and keyboard focus; compact sidebar/canvas/popover numbering; stable sparse IDs and legacy resolved record; current HTML omits deleted drafts and records; no comment text in journal; Undo/Redo relabeling' };
  writeFileSync(join(artifacts, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  console.log('Cleanup complete: owned browser and loopback server closed.');
}
