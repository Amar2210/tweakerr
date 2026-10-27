import { expect, test, type Page } from '@playwright/test';
import { readChangeLog, writeChangeLog } from '../../src/doc/changelog';
import { readRevisionComments, writeRevisionComments } from '../../src/doc/comments';
import { clickIn, domDiff, launch, openFile, readFixture, saveViaDownload, select, trackErrors } from './helpers';

const split = (html: string) => {
  const log = readChangeLog(html);
  return { ...readRevisionComments(log.source), changes: log.records };
};
const request = (page: Page) => page.getByRole('textbox', { name: 'Revision request', exact: true });
async function mount(page: Page, html: string) {
  await page.evaluate(async (source) => (window as any).tweakerr.stage.mount(source, 'returned.html', null), html);
}
async function add(page: Page, selector: string, text: string) {
  await select(page, selector);
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  await request(page).fill(text);
}
async function collapse(page: Page) {
  await page.locator('.side.left .side-title-text').click();
  await expect(page.getByRole('dialog', { name: /Comment|New comment/ })).toBeHidden();
}

test('single comment edits, collapses, saves while typing and deletes without UI/log leakage', async ({ page }) => {
  const errors = trackErrors(page);
  await launch(page);
  await openFile(page, 'board.html');
  const text = 'Move this card beside Order. --> <img src=x onerror=alert(1)> <!--';
  await add(page, '#box-a', text);
  await expect(page.locator('#file-name')).toHaveClass(/dirty/);
  await expect(page.locator('.comment-marker')).toHaveCount(1);
  await expect(page.locator('.comment-target-border')).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).tweakerr.editor.selected.id)).toBe('box-a');
  await collapse(page);
  await page.getByRole('button', { name: 'Open comment C1', exact: true }).click();
  await expect(request(page)).toHaveValue(text);
  await request(page).fill(text + ' Keep its label.');
  // No blur/Enter before saving: the active text must be included.
  const saved = await saveViaDownload(page);
  const metadata = split(saved);
  expect(metadata.comments).toHaveLength(1);
  expect(metadata.comments[0]).toMatchObject({ id: 'C1', status: 'pending', text: text + ' Keep its label.' });
  expect(metadata.changes).toEqual([]);
  expect(await domDiff(page, readFixture('board.html'), metadata.source)).toEqual([]);
  expect(await saveViaDownload(page)).toBe(saved);
  await expect(page.locator('#file-name')).not.toHaveClass(/dirty/);
  expect(await page.evaluate(() => (window as any).tweakerr.editor.doc.documentElement.outerHTML)).not.toMatch(/comment-marker|comment-popover|Tweakerr revision comments|data-tweakerr/);
  await mount(page, saved);
  await expect(page.locator('.comment-marker')).toHaveCount(1);
  await page.getByRole('button', { name: 'Open comment C1', exact: true }).click();
  await expect(request(page)).toHaveValue(text + ' Keep its label.');
  await page.getByRole('button', { name: 'Delete comment C1', exact: true }).click();
  await expect(page.locator('.comment-marker')).toHaveCount(0);
  await page.locator('[data-cmd="undo"]').click();
  await expect(page.locator('.comment-marker')).toHaveCount(1);
  await page.locator('[data-cmd="redo"]').click();
  const deleted = await saveViaDownload(page);
  expect(deleted).not.toContain('Move this card');
  expect(split(deleted).comments).toEqual([]);
  expect(split(deleted).changes).toEqual([]);
  await mount(page, deleted);
  await expect(page.locator('.comment-marker')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Save comment confirms pending notes without saving the page or resolving them', async ({ page }, info) => {
  await launch(page);
  await openFile(page, 'board.html');
  let downloads = 0;
  page.on('download', () => downloads++);
  await select(page, '#box-a');
  const addButton = page.getByRole('button', { name: 'Add comment', exact: true });
  await addButton.click();
  const dialog = page.getByRole('dialog', { name: /Comment|New comment/ });
  const saveComment = dialog.getByRole('button', { name: 'Save comment', exact: true });
  await expect(saveComment).toBeVisible();
  await expect(saveComment).toBeDisabled();
  await expect(dialog).not.toContainText('Ctrl+S');
  await expect(dialog).toContainText('Save the page to write HTML');
  await request(page).fill('   ');
  await expect(saveComment).toBeDisabled();
  await expect(page.locator('.comment-marker')).toHaveCount(0);
  await request(page).fill('Align the two cards without merging their labels.');
  await expect(saveComment).toBeEnabled();
  await expect(saveComment.locator('svg')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('comment-save-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: info.outputPath('comment-save-dark.png') });
  await saveComment.click();
  await expect(dialog).toBeHidden();
  await expect(addButton).toBeFocused();
  await expect(page.locator('.toast', { hasText: 'Comment saved in editor · still pending' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).tweakerr.editor.comments.all[0])).toMatchObject({
    id: 'C1', status: 'pending', text: 'Align the two cards without merging their labels.',
  });
  await expect(page.locator('#file-name')).toHaveClass(/dirty/);
  // Confirming must not add a redundant undo step after the typing session.
  await page.locator('[data-cmd="undo"]').click();
  await expect(page.locator('.comment-marker')).toHaveCount(0);
  await page.locator('[data-cmd="redo"]').click();
  await expect(page.locator('.comment-marker')).toHaveCount(1);
  await page.getByRole('button', { name: 'Comments', exact: true }).click();
  const edit = page.getByRole('button', { name: 'Edit pending comment C1', exact: true });
  await edit.click();
  await request(page).fill('Keep the labels distinct and align the cards.');
  await request(page).press('Tab');
  await expect(saveComment).toBeFocused();
  await saveComment.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(edit).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Pending (1)', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Resolved (0)', exact: true })).toBeVisible();
  expect(downloads).toBe(0);
  const saved = await saveViaDownload(page); // Page Save/Ctrl+S still writes the HTML.
  expect(downloads).toBe(1);
  expect(split(saved).comments[0]).toMatchObject({ id: 'C1', status: 'pending', text: 'Keep the labels distinct and align the cards.' });
  expect(split(saved).changes).toEqual([]);
  await expect(page.locator('#file-name')).not.toHaveClass(/dirty/);
  await mount(page, saved);
  await page.getByRole('button', { name: 'Open comment C1', exact: true }).click();
  await expect(request(page)).toHaveValue('Keep the labels distinct and align the cards.');
  await saveComment.click();
  await expect(page.locator('#file-name')).not.toHaveClass(/dirty/);
  expect(await saveViaDownload(page)).toBe(saved);
});

test('multi-selection has one shared request, individual borders and matching markers', async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
  await page.evaluate(() => {
    const { editor } = (window as any).tweakerr;
    editor.setSelection([editor.doc.querySelector('#box-a'), editor.doc.querySelector('#box-b')]);
  });
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  await request(page).fill('Merge these two cards, keeping both descriptions.');
  await expect(page.locator('.comment-marker[aria-expanded="true"]')).toHaveCount(2);
  await expect(page.locator('.comment-marker')).toHaveCount(2);
  await expect(page.locator('.comment-target-border')).toHaveCount(2);
  expect(split(await saveViaDownload(page)).comments[0].targets).toHaveLength(2);
  expect(await page.evaluate(() => (window as any).tweakerr.editor.comments.all.length)).toBe(1);
  await collapse(page);
  await page.getByRole('button', { name: 'Open comment C1', exact: true }).nth(1).click();
  await request(page).fill('Keep both cards; align them instead.');
  await collapse(page);
  await expect(page.locator('.comment-marker').first()).toHaveAttribute('title', 'C1: Keep both cards; align them instead.');
  await expect(page.locator('.comment-marker').nth(1)).toHaveAttribute('title', 'C1: Keep both cards; align them instead.');
  await page.getByRole('button', { name: 'Open comment C1', exact: true }).first().click();
  await page.getByRole('button', { name: 'Delete comment C1', exact: true }).click();
  await expect(page.locator('.comment-marker, .comment-target-border')).toHaveCount(0);
});

test('icon-only Add avoids the label and handles on small top-edge selections', async ({ page }, info) => {
  await launch(page);
  await mount(page, '<!DOCTYPE html><style>body{margin:0}button{position:absolute;top:0;width:50px;height:24px}#left{left:0}#right{right:0}</style><button id="left">Left</button><button id="right">Right</button>');
  const action = page.getByRole('button', { name: 'Add comment', exact: true });
  for (const id of ['left', 'right']) {
    await clickIn(page, `#${id}`);
    await expect(page.locator('.ov-label')).toContainText(`button#${id}`);
    await expect(action).toBeVisible();
    await page.screenshot({ path: info.outputPath(`small-top-${id}.png`) });
    await expect(action).toHaveText('');
    await expect(action).toHaveAttribute('title', 'Add comment');
    await expect(action.locator('svg')).toHaveCount(1);
    expect(await action.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return [...document.querySelectorAll('.ov-label, .ov-handle, .comment-marker')].some((other) => {
        const b = other.getBoundingClientRect();
        return rect.left < b.right && rect.right > b.left && rect.top < b.bottom && rect.bottom > b.top;
      });
    })).toBe(false);
    const box = (await action.boundingBox())!;
    const canvas = (await page.locator('#canvas').boundingBox())!;
    expect(box.width).toBe(box.height);
    expect(box.x).toBeGreaterThanOrEqual(canvas.x);
    expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width);
    expect(box.y).toBeGreaterThanOrEqual(canvas.y);
    expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + canvas.height);
    await action.click({ timeout: 2500 });
    await expect(page.getByRole('dialog', { name: 'New comment', exact: true })).toBeVisible();
    await request(page).press('Escape');
    await expect(action).toBeFocused();
    await action.press('Enter');
    await expect(request(page)).toBeFocused();
    await request(page).press('Escape');
    await expect(action).toBeFocused();
    expect(await action.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  }
});

test('card marker keeps its target and relative slot through child selections, drafts and later notes', async ({ page }, info) => {
  await launch(page);
  const source = '<!DOCTYPE html><style>body{margin:0;background:#f5f2ec;font:16px sans-serif}article.card{box-sizing:border-box;margin:80px 0 0 40px;padding:20px;width:368px;height:220px;border:1px solid #ddd;border-radius:16px;background:#fff}h3{margin:18px 0 8px;font-size:16px}p{margin:0 0 12px}small{display:block}</style><article class="card" id="action-card"><h3 id="action-title">Action</h3><p id="action-description">EventCode, EventBaseCode, and EventRootCode provide three levels of CAMEO detail.</p><small id="action-detail">Interactive event record</small></article>';
  await mount(page, source);
  const pick = async (selector: string, fy = 0.5) => {
    await clickIn(page, selector, 0.5, fy);
    await expect.poll(() => page.evaluate((sel) => (window as any).tweakerr.editor.selected?.matches(sel), selector)).toBe(true);
    // Wait for both overlay and comment layout, not just the synchronous selection.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  };
  const action = page.getByRole('button', { name: 'Add comment', exact: true });
  await pick('article.card', 0.95);
  await action.click();
  await request(page).fill('Keep this request on the whole Action card.');
  await request(page).press('Escape');
  const marker = page.getByRole('button', { name: 'Open comment C1', exact: true });
  const originalNode = (await marker.elementHandle())!;
  const relativeRect = () => marker.evaluate((el) => {
    const { editor, stage } = (window as any).tweakerr;
    const target = editor.doc.querySelector('article.card').getBoundingClientRect();
    const origin = stage.stage.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    return { x: rect.left - origin.left - target.left * stage.zoom, y: rect.top - origin.top - target.top * stage.zoom, width: rect.width, height: rect.height };
  });
  const originalRect = await relativeRect();
  const originalTarget = split(await saveViaDownload(page)).comments[0].targets[0];
  expect(originalTarget.identity).toEqual({ attribute: 'id', value: 'action-card' });
  await page.screenshot({ path: info.outputPath('article-card.png') });
  const expectStable = async () => {
    const current = await relativeRect();
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(current[key] - originalRect[key]), key).toBeLessThanOrEqual(0.75);
    expect(await originalNode.evaluate((node) => node.isConnected && node === document.querySelector('.comment-marker[data-comment-id="C1"]'))).toBe(true);
    expect(await page.evaluate(() => {
      const { editor } = (window as any).tweakerr;
      return editor.comments.targets(editor.comments.get('C1'))[0] === editor.doc.querySelector('article.card');
    })).toBe(true);
    expect(await page.evaluate(() => (window as any).tweakerr.editor.comments.export()[0].targets[0])).toEqual(originalTarget);
  };
  for (const selector of ['h3', 'p', 'small']) {
    await pick(selector);
    if (selector === 'h3') await page.screenshot({ path: info.outputPath('article-child.png') });
    await expectStable();
    await action.click({ timeout: 2500 });
    await expect(page.getByRole('dialog', { name: 'New comment', exact: true })).toBeVisible();
    await expectStable();
    await request(page).press('Escape');
    await expectStable();
    await marker.click({ timeout: 2500 });
    await expect(request(page)).toHaveValue('Keep this request on the whole Action card.');
    await request(page).press('Escape');
    await expect(marker).toBeFocused();
  }
  await pick('h3');
  await action.click();
  await request(page).fill('Change only the Action heading.');
  await request(page).press('Escape');
  await expectStable();
  const childRect = await page.getByRole('button', { name: 'Open comment C2', exact: true }).boundingBox();
  await pick('article.card', 0.95);
  await action.click();
  await request(page).fill('Another request on the whole card.');
  await request(page).press('Escape');
  await expectStable();
  expect(await page.getByRole('button', { name: 'Open comment C2', exact: true }).boundingBox()).toEqual(childRect);
  await page.screenshot({ path: info.outputPath('article-later-notes.png') });
  const saved = split(await saveViaDownload(page));
  expect(saved.comments[0].targets[0]).toEqual(originalTarget);
  expect(saved.comments.map((comment) => comment.targets[0].identity?.value)).toEqual(['action-card', 'action-title', 'action-card']);
  expect(new Set(saved.comments.map((comment) => comment.targets[0].key)).size).toBe(3);
  expect(saved.changes).toEqual([]);
  expect(await domDiff(page, source, saved.source)).toEqual([]);
  for (const [id, text] of [['C1', 'Keep this request on the whole Action card.'], ['C2', 'Change only the Action heading.'], ['C3', 'Another request on the whole card.']]) {
    await page.getByRole('button', { name: `Open comment ${id}`, exact: true }).click({ timeout: 2500 });
    await expect(request(page)).toHaveValue(text);
    await request(page).press('Escape');
  }
  await originalNode.dispose();
});

test('top-edge selection action does not cover an existing comment marker', async ({ page }) => {
  await launch(page);
  await mount(page, '<!DOCTYPE html><style>body{margin:0}#top{width:300px;height:100px;background:#eee}</style><div id="top">Top edge</div>');
  await add(page, '#top', 'The top-edge marker must remain clickable.');
  await collapse(page);
  // Use a real hit-tested click, not force or dispatchEvent: Add comment used
  // to cover this marker when the target had no room for a toolbar above it.
  await page.getByRole('button', { name: 'Open comment C1', exact: true }).click({ timeout: 2500 });
  await expect(request(page)).toHaveValue('The top-edge marker must remain clickable.');
});

test('every note on a narrow left-edge target stays clickable through scroll and zoom', async ({ page }) => {
  await launch(page);
  await mount(page, '<!DOCTYPE html><style>body{margin:0}#viewport{width:500px;height:180px;overflow:auto}#board{height:600px;padding-top:200px}#tiny{width:12px;height:10px;background:#666}</style><div id="viewport"><div id="board"><div id="tiny"></div></div></div>');
  await page.evaluate(() => { (window as any).tweakerr.editor.doc.querySelector('#viewport').scrollTop = 180; });
  for (let i = 1; i <= 6; i++) {
    await add(page, '#tiny', `Narrow target request ${i}`);
    await collapse(page);
  }
  await expect(page.locator('.comment-marker')).toHaveCount(6);
  const reopenEveryNote = async () => {
    for (let i = 1; i <= 6; i++) {
      await page.getByRole('button', { name: `Open comment C${i}`, exact: true }).click({ timeout: 2500 });
      await expect(request(page)).toHaveValue(`Narrow target request ${i}`);
      await request(page).press('Escape');
    }
  };
  await reopenEveryNote();
  await page.evaluate(() => { (window as any).tweakerr.editor.doc.querySelector('#viewport').scrollTop = 190; });
  await page.locator('[data-cmd="zoom-in"]').click();
  await reopenEveryNote();
});

test('keyboard opening/editing/collapse keeps focus on the stable marker', async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
  await add(page, '#box-a', 'Keyboard request');
  await collapse(page);
  const marker = page.getByRole('button', { name: 'Open comment C1', exact: true });
  await marker.focus();
  await marker.press('Enter');
  await expect(request(page)).toBeFocused();
  await request(page).pressSequentially(' updated');
  await expect(marker).toHaveAttribute('aria-expanded', 'true');
  await request(page).press('Escape');
  await expect(marker).toBeFocused();
  await expect(marker).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => (window as any).tweakerr.editor.selected.id)).toBe('box-a');
});

test('typing session is one undo step, and metadata changes participate in dirty prompts', async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
  await select(page, '#box-a');
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  await request(page).fill('   ');
  await collapse(page);
  await expect(page.locator('#file-name')).not.toHaveClass(/dirty/);
  await expect(page.locator('[data-cmd="undo"]')).toBeDisabled();
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  await request(page).fill('M');
  await page.waitForTimeout(1300); // longer than the page edit merge window
  await request(page).pressSequentially('ove this card');
  const confirmation = page.waitForEvent('dialog');
  const click = page.getByRole('button', { name: 'Tweakerr home', exact: true }).click();
  const dialog = await confirmation;
  expect(dialog.message()).toContain('unsaved changes');
  await dialog.dismiss();
  await click;
  await expect(page.locator('.comment-marker')).toHaveCount(1);
  await page.locator('[data-cmd="undo"]').click();
  await expect(page.locator('.comment-marker')).toHaveCount(0);
  await expect(page.locator('#file-name')).not.toHaveClass(/dirty/);
  await page.locator('[data-cmd="redo"]').click();
  await page.getByRole('button', { name: 'Open comment C1', exact: true }).click();
  await expect(request(page)).toHaveValue('Move this card');
  expect(split(await saveViaDownload(page)).changes).toEqual([]);
});

test('LLM-resolved imports survive removed targets and are readable/deletable only in left history', async ({ page }) => {
  const errors = trackErrors(page);
  await launch(page);
  await openFile(page, 'board.html');
  await add(page, '#box-a', 'Remove this quote card.');
  const saved = split(await saveViaDownload(page));
  const revised = await page.evaluate((html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelector('#box-a')!.remove();
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  }, saved.source);
  saved.comments[0].status = 'resolved';
  saved.comments[0].resolution = 'Removed the card. <img src=x onerror=alert(1)>';
  await mount(page, writeRevisionComments(revised, saved.comments));
  await expect(page.locator('.comment-marker, .comment-target-border')).toHaveCount(0);
  await page.getByRole('button', { name: 'Comments', exact: true }).click();
  const history = page.getByRole('region', { name: 'Resolved comments', exact: true });
  await expect(history).toContainText('Remove this quote card.');
  await expect(history).toContainText('div#box-a');
  await expect(history).toContainText(saved.comments[0].resolution);
  await expect(history.locator('img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Resolve|Reopen)(\s|$)/ })).toHaveCount(0);
  expect(split(await saveViaDownload(page)).comments).toEqual(saved.comments);
  await page.getByRole('button', { name: 'Delete resolved comment C1', exact: true }).click();
  const deleted = await saveViaDownload(page);
  expect(deleted).not.toContain('Remove this quote card.');
  expect(deleted).not.toContain('Removed the card.');
  await page.locator('[data-cmd="undo"]').click();
  await page.getByRole('button', { name: 'Comments', exact: true }).click();
  await expect(history).toContainText('Remove this quote card.');
  expect(errors).toEqual([]);
});

test('static targets follow nudges and zoom; external reordering cannot change their identity', async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
  await add(page, '#box-a', 'Keep this note attached to Quote.');
  await collapse(page);
  const before = await page.locator('.comment-marker').boundingBox();
  await page.locator('#canvas').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await page.locator('.comment-marker').boundingBox())!.x).toBeGreaterThan(before!.x);
  await page.locator('[data-cmd="zoom-in"]').click();
  await expect(page.locator('.comment-marker')).toHaveCount(1);
  const saved = split(await saveViaDownload(page));
  const reordered = await page.evaluate((html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelector('.row')!.append(doc.querySelector('#box-a')!);
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  }, saved.source);
  await mount(page, writeChangeLog(writeRevisionComments(reordered, saved.comments), saved.changes));
  expect(await page.evaluate(() => {
    const { editor } = (window as any).tweakerr;
    return editor.comments.targets(editor.comments.all[0])[0]?.id;
  })).toBe('box-a');
  await expect(page.locator('.comment-marker')).toHaveCount(1);
});

test('script-generated no-ID targets survive redraw, reorder, scrolling and save/reopen', async ({ page }) => {
  const errors = trackErrors(page);
  await launch(page);
  await openFile(page, 'comments-live.html');
  await expect(page.locator('#live-badge')).toBeVisible();
  const text = 'Move Contractors next to Employee data without merging.';
  await add(page, '#board .node:first-child', text);
  const reopenAtTarget = async () => {
    const marker = page.getByRole('button', { name: 'Open comment C1', exact: true });
    await expect.poll(() => marker.evaluate((el) => {
      const { editor, stage } = (window as any).tweakerr;
      const target = editor.comments.targets(editor.comments.get('C1'))[0].getBoundingClientRect();
      const viewport = editor.doc.querySelector('#viewport');
      const clip = viewport.getBoundingClientRect();
      const origin = stage.stage.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      return Math.max(Math.abs(rect.right - origin.left - Math.min(target.right, clip.left + viewport.clientWidth) * stage.zoom + 3),
        Math.abs(rect.top - origin.top - target.top * stage.zoom - 3));
    })).toBeLessThanOrEqual(0.75);
    await marker.click({ timeout: 2500 });
    await expect(request(page)).toHaveValue(text);
    await request(page).press('Escape');
  };
  const saved = split(await saveViaDownload(page));
  expect(saved.source).toBe(readFixture('comments-live.html'));
  expect(saved.comments[0].targets[0].identity).toBeUndefined();
  expect(saved.comments[0].targets[0].selector).toContain('nth-child');
  await collapse(page);
  await page.evaluate(() => {
    const { editor } = (window as any).tweakerr;
    editor.win.dispatchEvent(new editor.win.Event('resize'));
  });
  await expect(page.locator('.comment-marker')).toHaveCount(1);
  await reopenAtTarget();
  await page.evaluate(() => (window as any).tweakerr.editor.win.commentsFixture.reorder());
  await expect.poll(() => page.evaluate(() => {
    const { editor } = (window as any).tweakerr;
    return editor.comments.targets(editor.comments.all[0])[0]?.querySelector('h2').textContent;
  })).toBe('Contractors');
  // The last card is initially partially visible. At the far right its edge is
  // exactly at the clipping boundary; no ghost marker may remain there.
  await expect(page.locator('.comment-marker')).toHaveCount(1);
  await reopenAtTarget();
  await page.evaluate(() => { (window as any).tweakerr.editor.doc.querySelector('#viewport').scrollLeft = 750; });
  await expect(page.locator('.comment-marker')).toHaveCount(0);
  await page.evaluate(() => { (window as any).tweakerr.editor.doc.querySelector('#viewport').scrollLeft = 500; });
  await expect(page.locator('.comment-marker')).toHaveCount(1);
  await reopenAtTarget();
  const afterReorder = await saveViaDownload(page);
  // The original script order is restored on reopen; the saved positional path
  // now points at a different item, but fingerprint matching still picks Contractors.
  await mount(page, afterReorder);
  await expect(page.locator('.comment-marker')).toHaveCount(1);
  expect(await page.evaluate(() => {
    const { editor } = (window as any).tweakerr;
    return editor.comments.targets(editor.comments.all[0])[0]?.querySelector('h2').textContent;
  })).toBe('Contractors');
  await page.locator('[data-cmd="zoom-in"]').click();
  await expect(page.locator('.comment-marker')).toHaveCount(1);
  await reopenAtTarget();
  expect(errors).toEqual([]);
});

test('a new draft retains its request when a live redraw removes the selection before typing', async ({ page }) => {
  await launch(page);
  await openFile(page, 'comments-live.html');
  await select(page, '#board .node:first-child');
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  await page.evaluate(() => (window as any).tweakerr.editor.win.commentsFixture.removeContractors());
  await request(page).fill('Restore the Contractors box that disappeared while I was writing.');
  await expect(page.locator('#file-name')).toHaveClass(/dirty/);
  const saved = split(await saveViaDownload(page));
  expect(saved.comments).toHaveLength(1);
  expect(saved.comments[0]).toMatchObject({ status: 'pending', text: 'Restore the Contractors box that disappeared while I was writing.' });
  expect(saved.comments[0].targets[0].label).toContain('Contractors');
  await collapse(page);
  await page.getByRole('button', { name: 'Comments', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Pending comments', exact: true })).toContainText('Target unavailable');
});

test('missing generated targets stay pending and are editable/deletable from recovery entries', async ({ page }) => {
  await launch(page);
  await openFile(page, 'comments-live.html');
  await add(page, '#board .node:first-child', 'Keep this pending if its target disappears.');
  await collapse(page);
  await page.evaluate(() => (window as any).tweakerr.editor.win.commentsFixture.removeContractors());
  await expect(page.locator('.comment-marker')).toHaveCount(0);
  await page.getByRole('button', { name: 'Comments', exact: true }).click();
  const recovery = page.getByRole('region', { name: 'Pending comments', exact: true });
  await expect(recovery).toContainText('Target unavailable');
  await page.getByRole('button', { name: 'Edit pending comment C1', exact: true }).click();
  await expect(request(page)).toHaveValue('Keep this pending if its target disappears.');
  await request(page).fill('The prior target disappeared; restore the separate Contractors box.');
  const saved = split(await saveViaDownload(page));
  expect(saved.comments[0].status).toBe('pending');
  expect(saved.comments[0].text).toContain('restore the separate');
  await page.getByRole('button', { name: 'Delete comment C1', exact: true }).click();
  await expect(recovery).toHaveCount(0);
  expect(await saveViaDownload(page)).not.toContain('restore the separate');
});

test('leading comment metadata and change log are accepted in either order', async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
  await add(page, '#box-a', 'Keep this request when metadata blocks are reordered.');
  await collapse(page);
  await page.evaluate(() => {
    const { editor } = (window as any).tweakerr;
    editor.edit('Change title colour', () => editor.doc.querySelector('#title').setAttribute('style', 'color: red;'));
  });
  const first = split(await saveViaDownload(page));
  expect(first.changes).toHaveLength(1);
  const reversed = writeRevisionComments(writeChangeLog(first.source, first.changes), first.comments);
  await mount(page, reversed);
  await expect(page.locator('.comment-marker')).toHaveCount(1);
  const saved = split(await saveViaDownload(page));
  expect(saved.comments).toEqual(first.comments);
  expect(saved.changes).toEqual(first.changes);
  expect(await page.evaluate(() => (window as any).tweakerr.editor.doc.documentElement.outerHTML)).not.toContain('Tweakerr revision comments');
});

test('malformed/unrelated metadata survives adding and deleting a managed comment', async ({ page }) => {
  await launch(page);
  const malformed = '<!-- Tweakerr revision comments v1\n{"version":42,"comments":"keep-me"}\n-->\n';
  const own = '<!-- Original author note: preserve this -->\n';
  await mount(page, malformed + own + readFixture('board.html'));
  await add(page, '#box-a', 'A separate managed note.');
  const first = await saveViaDownload(page);
  expect(split(first).comments).toHaveLength(1);
  expect(first).toContain(malformed.trim());
  expect(first).toContain(own.trim());
  await page.getByRole('button', { name: 'Delete comment C1', exact: true }).click();
  const deleted = await saveViaDownload(page);
  expect(deleted).not.toContain('A separate managed note.');
  expect(deleted).toContain(malformed.trim());
  expect(deleted).toContain(own.trim());
});
