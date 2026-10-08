import { expect, test } from '@playwright/test';
import { domDiff, launch, openFile, readFixture, saveViaDownload, select, selectedId, setField, trackErrors } from './helpers';

test('home button does nothing when already home', async ({ page }) => {
  await launch(page);
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Tweakerr home' }).click();
  await expect(page.locator('#empty')).toBeVisible();
  expect(dialogs).toEqual([]);
});

test('cancelling home keeps unsaved changes, selection and undo history', async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
  await select(page, '#box-b');
  await setField(page, 'Border', '4', 'Fill & border');

  const dialogPromise = page.waitForEvent('dialog');
  const click = page.getByRole('button', { name: 'Tweakerr home' }).click();
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe('confirm');
  expect(dialog.message()).toContain('unsaved changes');
  await dialog.dismiss();
  await click;

  await expect(page.locator('#empty')).toBeHidden();
  await expect(page).toHaveTitle('• board.html — Tweakerr');
  expect(await selectedId(page)).toBe('box-b');
  await page.locator('[data-cmd="undo"]').click();
  await expect(page).toHaveTitle('board.html — Tweakerr');
  expect(await domDiff(page, readFixture('board.html'), await saveViaDownload(page))).toEqual([]);
});

for (const dirty of [false, true]) {
  test(`confirming home clears the ${dirty ? 'unsaved' : 'unchanged'} page with one prompt`, async ({ page }) => {
    const errors = trackErrors(page);
    await launch(page);
    await openFile(page, 'board.html');
    if (dirty) {
      await select(page, '#box-b');
      await setField(page, 'Border', '4', 'Fill & border');
    }
    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.type());
      await dialog.accept();
    });
    await page.getByRole('button', { name: 'Tweakerr home' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#empty')).toBeVisible();
    await expect(page).toHaveTitle('Tweakerr');
    await expect(page.locator('#file-name')).toBeEmpty();
    await expect(page.locator('.toolbar [data-cmd="save"]')).toBeDisabled();
    await expect(page.locator('[data-cmd="undo"]')).toBeDisabled();
    expect(dialogs).toEqual(['confirm']);

    await openFile(page, 'board.html');
    expect(await domDiff(page, readFixture('board.html'), await saveViaDownload(page))).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('refresh still warns about unsaved changes after cancelling home', async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
  await select(page, '#box-b');
  await setField(page, 'Border', '4', 'Fill & border');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Tweakerr home' }).click();

  const dialogPromise = page.waitForEvent('dialog');
  await page.evaluate(() => { setTimeout(() => window.location.reload(), 0); });
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
  await expect(page).toHaveTitle('• board.html — Tweakerr');
  await expect(page.locator('#empty')).toBeHidden();
});
