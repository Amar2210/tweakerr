import { expect, test } from '@playwright/test';
import { clickIn, domDiff, launch, openFile, readFixture, saveViaDownload, selectedId, trackErrors } from './helpers';

test('empty state, demo, and the credit line', async ({ page }) => {
  const errors = trackErrors(page);
  await launch(page);
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('.made-with')).toHaveText('Made with Claude');
  await expect(page.locator('.toolbar [data-cmd="save"]')).toBeDisabled();

  await page.locator('.empty [data-cmd="demo"]').click();
  await expect(page.locator('#empty')).toBeHidden();
  await expect(page.locator('#file-name')).toHaveText('tweakerr-demo.html');
  await expect(page.locator('#layers .layer-row').first()).toHaveText(/Page/);
  expect(errors).toEqual([]);
});

test('page scripts never run and are saved back untouched', async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
  const state = await page.evaluate(() => {
    const doc = (window as any).tweakerr.editor.doc as Document;
    return { ran: doc.body.getAttribute('data-ran'), title: doc.getElementById('title')!.textContent };
  });
  expect(state).toEqual({ ran: null, title: 'Order to cash' });

  const saved = await saveViaDownload(page);
  expect(saved).toContain("document.body.setAttribute('data-ran', 'yes');");
  expect(await domDiff(page, readFixture('board.html'), saved)).toEqual([]);
  // The file keeps its final newline.
  expect(saved.endsWith('\n')).toBe(true);
});

test('clicking selects; breadcrumb, layers and panel follow', async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');

  // Near the top edge of the box = on its padding, not on the heading inside.
  await clickIn(page, '#box-b', 0.5, 0.06);
  expect(await selectedId(page)).toBe('box-b');
  await expect(page.locator('.sel-tag')).toHaveText('div#box-b');
  await expect(page.locator('#crumbs .crumb.current')).toHaveText('div#box-b');
  await expect(page.locator('#layers .layer-row.selected')).toContainText('div#box-b');
  await expect(page.locator('#overlay .ov-select')).toBeVisible();
  await expect(page.locator('#overlay .ov-handle')).toHaveCount(8);

  // Clicking the heading selects the heading; Shift+Enter walks back up.
  await clickIn(page, '#box-b h2', 0.2, 0.5);
  await expect(page.locator('.sel-tag')).toHaveText('h2');
  await page.keyboard.press('Shift+Enter');
  expect(await selectedId(page)).toBe('box-b');

  // Clicking a layer row selects that element.
  await page.locator('#layers .layer-row', { hasText: 'div#box-c' }).click();
  expect(await selectedId(page)).toBe('box-c');

  // Esc clears the selection; the panel falls back to page settings.
  await page.keyboard.press('Escape');
  expect(await selectedId(page)).toBeNull();
  await expect(page.locator('.sel-tag')).toHaveText('Page');
});

test('device widths and zoom', async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
  const frameWidth = () => page.evaluate(() => (document.getElementById('frame') as HTMLIFrameElement).style.width);
  expect(await frameWidth()).toBe('1280px');
  await page.locator('[data-device="phone"]').click();
  expect(await frameWidth()).toBe('390px');
  await expect(page.locator('#zoom-label')).toHaveText('100%');
  await page.locator('[data-device="desktop"]').click();
  await page.locator('[data-cmd="zoom-reset"]').click();
  await expect(page.locator('#zoom-label')).toHaveText('100%');
  await page.locator('[data-cmd="zoom-out"]').click();
  await expect(page.locator('#zoom-label')).toHaveText('80%');
  await page.locator('[data-cmd="fit"]').click();
  await expect(page.locator('#zoom-label')).not.toHaveText('80%');
});

test('the layers panel collapses to give the canvas more room, and stays collapsed', async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
  const canvasWidth = () => page.locator('#canvas').evaluate((el) => el.clientWidth);
  const zoom = () => page.evaluate(() => (window as any).tweakerr.editor.zoom as number);
  const [w0, z0] = [await canvasWidth(), await zoom()];

  await page.locator('#layers-toggle').click();
  await expect(page.locator('#layers')).toBeHidden();
  await expect(page.locator('#layers-toggle')).toHaveAttribute('aria-label', 'Show layers');
  expect(await canvasWidth()).toBeGreaterThan(w0 + 150);
  await expect.poll(zoom).toBeGreaterThan(z0); // fit-to-width uses the new room

  await page.reload();
  await expect(page.locator('#layers')).toBeHidden();
  await page.locator('#layers-toggle').click();
  await expect(page.locator('#layers')).toBeVisible();
  expect(await canvasWidth()).toBe(w0);
});

test('the properties panel collapses too; each strip shows its icon, which opens it again', async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
  const canvasWidth = () => page.locator('#canvas').evaluate((el) => el.clientWidth);
  const w0 = await canvasWidth();

  await expect(page.locator('#props-strip')).toBeHidden();
  await page.locator('#props-toggle').click();
  await expect(page.locator('#props')).toBeHidden();
  await expect(page.locator('#props-toggle')).toHaveAttribute('aria-label', 'Show properties');
  await expect(page.locator('#props-strip svg')).toBeVisible();
  expect(await canvasWidth()).toBeGreaterThan(w0 + 200);

  await page.locator('#layers-toggle').click();
  await expect(page.locator('#layers-strip svg')).toBeVisible();

  await page.reload();
  await expect(page.locator('#props')).toBeHidden();
  await page.locator('#props-strip').click();
  await page.locator('#layers-strip').click();
  await expect(page.locator('#props')).toBeVisible();
  await expect(page.locator('#layers')).toBeVisible();
  await expect(page.locator('#props-strip')).toBeHidden();
  expect(await canvasWidth()).toBe(w0);
});
