import { expect, test, type Page } from '@playwright/test';
import { readRevisionComments, writeRevisionComments, type RevisionComment } from '../../src/doc/comments';
import { clickIn, launch, openFile, readFixture, saveViaDownload, selectedId, trackErrors } from './helpers';

const source = '<!DOCTYPE html><html><head><style>body{margin:0;font:18px sans-serif;background:#f5f2ec}h1{margin:40px}#near{margin:40px;width:300px;padding:20px;background:white}#viewport{margin:1100px 40px 80px;width:650px;height:200px;overflow:auto;border:2px solid #aaa}#board{position:relative;width:1600px;height:700px}#far{position:absolute;left:1100px;top:450px;width:260px;padding:20px;background:white}#missing{margin:40px}</style></head><body><h1>Navigation fixture</h1><div id="near">Original near card</div><div id="missing">Removed card</div><div id="viewport"><div id="board"><div id="far">Far shared card</div></div></div></body></html>';
const commentsButton = (page: Page) => page.getByRole('button', { name: 'Comments', exact: true });
const request = (page: Page) => page.getByRole('textbox', { name: 'Revision request', exact: true });
const card = (page: Page, id: string) => page.locator(`#comment-history [data-comment-id="${id}"]`);
async function mount(page: Page, html: string) {
  await page.evaluate(async (html) => (window as any).tweakerr.stage.mount(html, 'navigation.html', null), html);
}
async function records(page: Page, definitions: { selectors: string[]; status: 'pending' | 'resolved'; text: string; resolution?: string }[]): Promise<RevisionComment[]> {
  return page.evaluate((definitions) => {
    const { editor } = (window as any).tweakerr;
    return definitions.map(({ selectors, ...definition }, index) => ({
      id: `C${index + 1}`, ...definition,
      targets: editor.comments.prepareTargets(selectors.map((selector) => editor.doc.querySelector(selector))),
    }));
  }, definitions);
}
async function expectLocated(page: Page, selector: string) {
  await expect.poll(() => page.evaluate((selector) => {
    const { editor, stage } = (window as any).tweakerr;
    const el = editor.doc.querySelector(selector);
    if (editor.selected !== el || !el?.isConnected) return false;
    const r = el.getBoundingClientRect(), origin = stage.stage.getBoundingClientRect();
    const canvas = stage.canvas.getBoundingClientRect();
    const sidebar = document.querySelector('.side.left')!.getBoundingClientRect();
    const visibleLeft = Math.max(canvas.left, sidebar.right);
    const left = origin.left + r.left * stage.zoom, top = origin.top + r.top * stage.zoom;
    const right = canvas.left + stage.canvas.clientLeft + stage.canvas.clientWidth;
    const bottom = canvas.top + stage.canvas.clientTop + stage.canvas.clientHeight;
    if (left < visibleLeft || top < canvas.top || left + r.width * stage.zoom > right || top + r.height * stage.zoom > bottom) return false;
    for (let parent = el.parentElement; parent && parent !== editor.doc.body; parent = parent.parentElement) {
      const css = editor.win.getComputedStyle(parent), clip = parent.getBoundingClientRect();
      if (/auto|scroll/.test(css.overflowX) && (r.left < clip.left || r.right > clip.right)) return false;
      if (/auto|scroll/.test(css.overflowY) && (r.top < clip.top || r.bottom > clip.bottom)) return false;
    }
    return true;
  }, selector)).toBe(true);
  await expect(page.locator('.ov-select').first()).toBeVisible();
  await expect(page.locator('.ov-label')).toContainText(selector.slice(1));
}

test('Comments view visibility follows current records, with independent collapsed rail access and deterministic loads', async ({ page }, info) => {
  await launch(page);
  await mount(page, source);
  await expect(commentsButton(page)).toBeHidden();
  await expect(page.locator('#comments-strip')).toBeHidden();
  await expect(page.locator('#comment-history')).toBeHidden();
  await clickIn(page, '#near');
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  await request(page).fill('Keep the original card separate.');
  await request(page).press('Escape');
  await expect(commentsButton(page)).toBeVisible();
  await expect(page.locator('#layers')).toBeVisible(); // first comment must not switch views
  await expect(page.locator('#comment-history')).toBeHidden();
  const saved = await saveViaDownload(page);
  await page.locator('#layers-toggle').click();
  await expect(page.locator('#comments-strip')).toBeVisible();
  await expect(page.locator('#layers-strip')).toBeVisible();
  await page.screenshot({ path: info.outputPath('comments-collapsed-rail.png') });
  await page.locator('#comments-strip').click();
  await expect(page.locator('#comment-history')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pending (1)', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Resolved (0)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await expect(page.locator('#layers')).toBeVisible();
  await page.locator('#layers-toggle').click();
  await page.locator('#comments-strip').focus();
  await page.locator('#comments-strip').press('Enter');
  await expect(page.locator('#comment-history')).toBeVisible();
  await page.locator('#layers-toggle').click();
  await page.locator('#layers-strip').click();
  await expect(page.locator('#layers')).toBeVisible();
  await commentsButton(page).click();
  await page.getByRole('button', { name: 'Edit pending comment C1', exact: true }).click();
  await expect(request(page)).toHaveValue('Keep the original card separate.');
  await page.getByRole('button', { name: 'Delete comment C1', exact: true }).click();
  await expect(commentsButton(page)).toBeHidden();
  await expect(page.locator('#layers')).toBeVisible();
  await expect(page.locator('#comment-history')).toBeHidden();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(commentsButton(page)).toBeVisible();
  await expect(page.locator('#layers')).toBeVisible();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(commentsButton(page)).toBeHidden();
  await mount(page, saved); // pending-only reopen
  await expect(commentsButton(page)).toBeVisible();
  await expect(page.locator('#layers')).toBeVisible();
  await commentsButton(page).click();
  const resolved = readRevisionComments(saved);
  resolved.comments[0].status = 'resolved';
  await mount(page, writeRevisionComments(resolved.source, resolved.comments));
  await expect(commentsButton(page)).toBeVisible();
  await expect(page.locator('#layers')).toBeVisible(); // each new file starts in Layers
  await commentsButton(page).click();
  await expect(page.getByRole('heading', { name: 'Resolved (1)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete resolved comment C1', exact: true }).click();
  await expect(page.locator('#layers')).toBeVisible();
  await expect(commentsButton(page)).toBeHidden();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await commentsButton(page).click();
  await mount(page, source);
  await expect(commentsButton(page)).toBeHidden();
  await expect(page.locator('#comments-strip')).toBeHidden();
  await expect(page.locator('#comment-history')).toBeHidden();
  await expect(page.locator('#layers')).toBeVisible();
});

test('pointer and keyboard locate each shared pending/resolved target through nested scroll at zoom without editing', async ({ page }, info) => {
  const errors = trackErrors(page);
  await launch(page);
  await mount(page, source);
  const notes = await records(page, [
    { selectors: ['#near', '#far'], status: 'resolved', text: 'Keep both cards distinct.', resolution: 'Updated the near card wording.' },
    { selectors: ['#near', '#far'], status: 'pending', text: 'Review their spacing.' },
    { selectors: ['#missing'], status: 'resolved', text: 'Remove the third card.', resolution: 'Removed.' },
  ]);
  // Simulate LLM work with a retained identity but an intentionally old fingerprint/label.
  const revised = source.replace('Original near card', 'LLM-revised near card').replace('<div id="missing">Removed card</div>', '');
  await mount(page, writeRevisionComments(revised, notes));
  const before = await saveViaDownload(page);
  // Pending references still refresh on save by the existing metadata contract;
  // resolved references must retain their original fingerprint, even with an ID.
  expect(readRevisionComments(before).comments).toEqual([
    notes[0],
    { ...notes[1], targets: [
      { ...notes[1].targets[0], fingerprint: { ...notes[1].targets[0].fingerprint, text: 'LLM-revised near card', textHash: 'b2eb8011' } },
      notes[1].targets[1],
    ] },
    notes[2],
  ]);
  const historyBefore = await page.evaluate(() => {
    const { editor } = (window as any).tweakerr;
    return { undo: editor.history.peekUndo()?.label ?? null, redo: editor.history.peekRedo()?.label ?? null, changes: editor.history.changes };
  });
  await commentsButton(page).click();
  await page.locator('[data-cmd="zoom-reset"]').click();
  await page.locator('[data-cmd="zoom-in"]').click();
  const zoom = await page.evaluate(() => (window as any).tweakerr.editor.zoom);
  const nearLabel = notes[0].targets[0].label, farLabel = notes[0].targets[1].label;
  await card(page, 'C1').getByRole('button', { name: `Locate ${nearLabel}`, exact: true }).click();
  await expectLocated(page, '#near');
  const far = card(page, 'C1').getByRole('button', { name: `Locate ${farLabel}`, exact: true });
  await far.focus();
  await far.press('Enter');
  await expectLocated(page, '#far');
  await expect(far).toBeFocused();
  expect(await page.evaluate(() => (window as any).tweakerr.editor.doc.querySelector('#viewport').scrollLeft)).toBeGreaterThan(0);
  expect(await page.locator('#canvas').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await card(page, 'C2').getByRole('button', { name: `Locate ${nearLabel}`, exact: true }).click();
  await expectLocated(page, '#near');
  const pendingFar = card(page, 'C2').getByRole('button', { name: `Locate ${farLabel}`, exact: true });
  await pendingFar.focus();
  await pendingFar.press('Space');
  await expectLocated(page, '#far');
  expect(await page.evaluate(() => (window as any).tweakerr.editor.zoom)).toBe(zoom);
  await expect(card(page, 'C3')).toContainText('Target unavailable');
  await expect(card(page, 'C3').getByRole('button', { name: /^Locate / })).toHaveCount(0);
  await expect(card(page, 'C1').getByRole('button', { name: /Edit|Resolve|Reopen/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Resolve|Reopen)(\s|$)/ })).toHaveCount(0);
  await expect(page.locator('#file-name')).not.toHaveClass(/dirty/);
  expect(await page.evaluate(() => {
    const { editor } = (window as any).tweakerr;
    return { undo: editor.history.peekUndo()?.label ?? null, redo: editor.history.peekRedo()?.label ?? null, changes: editor.history.changes };
  })).toEqual(historyBefore);
  expect(await saveViaDownload(page)).toBe(before);
  await page.screenshot({ path: info.outputPath('comments-navigation-light.png') });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.screenshot({ path: info.outputPath('comments-navigation-dark.png') });
  await page.setViewportSize({ width: 900, height: 800 });
  await page.locator('#layers-toggle').click();
  await expect(page.locator('#comments-strip')).toBeVisible();
  await page.locator('#comments-strip').click();
  await expect(card(page, 'C1')).toBeVisible();
  await page.locator('[data-cmd="zoom-reset"]').click(); // both targets fit the unoccluded area at 100%
  await card(page, 'C1').getByRole('button', { name: `Locate ${nearLabel}`, exact: true }).click();
  await expectLocated(page, '#near');
  await far.focus();
  await far.press('Enter');
  await expectLocated(page, '#far');
  expect(await page.evaluate(() => (window as any).tweakerr.editor.zoom)).toBe(1);
  await expect(page.locator('#file-name')).not.toHaveClass(/dirty/);
  expect(await saveViaDownload(page)).toBe(before);
  await page.screenshot({ path: info.outputPath('comments-navigation-narrow.png') });
  expect(errors).toEqual([]);
});

test('wrapped pending and resolved target bullets align with the first text line', async ({ page }, info) => {
  await launch(page);
  await mount(page, source);
  const notes = await records(page, [
    { selectors: ['#near', '#far'], status: 'pending', text: 'Review these synthetic cards.' },
    { selectors: ['#near'], status: 'resolved', text: 'Keep the updated card.' },
  ]);
  for (const note of notes) for (const target of note.targets) {
    target.label = 'div — A long synthetic target description that wraps across several lines while keeping its bullet beside the first line of text.';
  }
  await mount(page, writeRevisionComments(source, notes));
  await commentsButton(page).click();
  const links = page.locator('#comment-history .comment-locate');
  await expect(links).toHaveCount(3);
  const alignment = await links.evaluateAll((buttons) => buttons.map((button) => {
    // A zero-width inline probe shares the list marker's line without changing wrapping.
    const probe = document.createTextNode('\u200b');
    button.before(probe);
    try {
      const markerLine = document.createRange();
      markerLine.selectNode(probe);
      const firstLine = document.createRange();
      firstLine.setStart(button.firstChild!, 0);
      firstLine.setEnd(button.firstChild!, 1);
      return {
        markerTop: markerLine.getBoundingClientRect().top,
        firstTop: firstLine.getBoundingClientRect().top,
        lineHeight: firstLine.getBoundingClientRect().height,
        linkHeight: button.getBoundingClientRect().height,
      };
    } finally {
      probe.remove();
    }
  }));
  for (const box of alignment) {
    expect(box.linkHeight).toBeGreaterThan(box.lineHeight * 2);
    expect(Math.abs(box.markerTop - box.firstTop)).toBeLessThan(box.lineHeight);
  }
  await page.screenshot({ path: info.outputPath('wrapped-target-bullets.png') });
});

test('keyboard sidebar Edit returns to the current action after typing and never resurrects a deleted action', async ({ page }) => {
  await launch(page);
  await mount(page, source);
  const notes = await records(page, [{ selectors: ['#near'], status: 'pending', text: 'Keep this request.' }]);
  await mount(page, writeRevisionComments(source, notes));
  await commentsButton(page).click();
  const edit = page.getByRole('button', { name: 'Edit pending comment C1', exact: true });
  await edit.focus();
  await edit.press('Enter');
  await expect(request(page)).toBeFocused();
  await request(page).press('End');
  await request(page).pressSequentially(' Updated.');
  await expect(card(page, 'C1')).toContainText('Keep this request. Updated.');
  await request(page).press('Escape');
  await expect(edit).toBeFocused();
  expect(await edit.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  await edit.press('Space');
  await expect(request(page)).toHaveValue('Keep this request. Updated.');
  await page.getByRole('button', { name: 'Delete comment C1', exact: true }).click();
  await expect(edit).toHaveCount(0);
  await expect(page.locator('#layers')).toBeVisible();
  await expect(page.locator('#canvas')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(edit).toHaveCount(0);
  await expect(commentsButton(page)).toBeHidden();
});

test('missing and ambiguous targets stay readable/unavailable and pending requests remain recoverable', async ({ page }) => {
  await launch(page);
  const twins = '<!DOCTYPE html><div id="board"><button>Same card</button><button>Same card</button></div><button id="declared">Named card</button>';
  await mount(page, twins);
  const notes = await records(page, [
    { selectors: ['#board button:first-child'], status: 'pending', text: 'Recover this missing anonymous card.' },
    { selectors: ['#declared'], status: 'resolved', text: 'A retained but now duplicated identity.' },
  ]);
  const changed = twins.replace('<button>Same card</button>', '').replace('</div>', '</div><button id="declared">Unrelated lookalike</button>');
  await mount(page, writeRevisionComments(changed, notes));
  await commentsButton(page).click();
  await expect(card(page, 'C1')).toContainText('Same card');
  await expect(card(page, 'C2')).toContainText('Named card');
  await expect(page.locator('#comment-history .comment-target-unavailable')).toHaveCount(2);
  await expect(page.locator('#comment-history .comment-locate')).toHaveCount(0);
  expect(await selectedId(page)).toBeNull();
  await page.getByRole('button', { name: 'Edit pending comment C1', exact: true }).click();
  await expect(request(page)).toHaveValue(notes[0].text);
  await expect(page.locator('.comment-popover')).toContainText('unavailable');
  await request(page).fill('Restore the removed card, not its twin.');
  await request(page).press('Escape');
  const saved = readRevisionComments(await saveViaDownload(page));
  expect(saved.comments[0]).toMatchObject({ status: 'pending', text: 'Restore the removed card, not its twin.' });
  expect(saved.comments[1]).toEqual(notes[1]);
  await page.getByRole('button', { name: 'Edit pending comment C1', exact: true }).click();
  await page.getByRole('button', { name: 'Delete comment C1', exact: true }).click();
  await expect(card(page, 'C1')).toHaveCount(0);
  await expect(card(page, 'C2')).toBeVisible();
});

test('live redraw refreshes availability and locate always selects the current connected node', async ({ page }) => {
  await launch(page);
  await openFile(page, 'comments-live.html');
  const notes = await records(page, [
    { selectors: ['#board .node:first-child'], status: 'resolved', text: 'Keep Contractors separate.', resolution: 'Done.' },
    { selectors: ['#board .node:nth-child(2)'], status: 'pending', text: 'Keep Employee data separate.' },
  ]);
  await mount(page, writeRevisionComments(readFixture('comments-live.html'), notes));
  const before = await saveViaDownload(page);
  await commentsButton(page).click();
  const locate = card(page, 'C1').getByRole('button', { name: `Locate ${notes[0].targets[0].label}`, exact: true });
  await locate.click();
  const old = await page.evaluateHandle(() => (window as any).tweakerr.editor.selected);
  await page.evaluate(() => (window as any).tweakerr.editor.win.commentsFixture.reorder());
  await expect.poll(() => old.evaluate((el) => el.isConnected)).toBe(false);
  await locate.focus();
  await locate.press('Enter');
  expect(await page.evaluate(() => {
    const { editor } = (window as any).tweakerr;
    return editor.selected?.isConnected && editor.selected === editor.doc.querySelector('#board .node:last-child') && editor.selected.textContent.includes('Contractors');
  })).toBe(true);
  await page.evaluate(() => (window as any).tweakerr.editor.win.commentsFixture.removeContractors());
  await expect(card(page, 'C1')).toContainText('Target unavailable');
  await expect(locate).toHaveCount(0);
  await expect(card(page, 'C2').getByRole('button', { name: /^Locate / })).toHaveCount(1);
  // Restore a confidently matched target on a later redraw, without remounting.
  await page.evaluate(() => {
    const { editor } = (window as any).tweakerr;
    const button = editor.doc.createElement('button');
    button.className = 'node';
    button.innerHTML = '<h2>Contractors</h2><p>Temporary workforce records from an uploaded sheet.</p>';
    editor.doc.querySelector('#board').append(button);
  });
  await expect(locate).toBeVisible();
  await locate.click();
  expect(await page.evaluate(() => (window as any).tweakerr.editor.selected?.isConnected)).toBe(true);
  await expect(page.locator('#file-name')).not.toHaveClass(/dirty/);
  expect(await saveViaDownload(page)).toBe(before);
  await old.dispose();
});

test('locate safely finishes a genuine active page text edit', async ({ page }) => {
  await launch(page);
  await mount(page, source);
  const notes = await records(page, [{ selectors: ['#near'], status: 'resolved', text: 'Historical request.' }]);
  await mount(page, writeRevisionComments(source, notes));
  await commentsButton(page).click();
  await clickIn(page, '#near');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Actual user edit');
  await card(page, 'C1').getByRole('button', { name: `Locate ${notes[0].targets[0].label}`, exact: true }).click();
  expect(await page.evaluate(() => {
    const { editor, text } = (window as any).tweakerr;
    return { active: !!text.active, transaction: editor.history.inTransaction, text: editor.selected.textContent, editable: editor.selected.hasAttribute('contenteditable') };
  })).toEqual({ active: false, transaction: false, text: 'Actual user edit', editable: false });
  await expect(page.locator('#file-name')).toHaveClass(/dirty/);
  const saved = await saveViaDownload(page);
  expect(saved).toContain('Actual user edit');
  expect(saved).not.toContain('contenteditable');
  expect(saved).toContain('Edit text');
});
