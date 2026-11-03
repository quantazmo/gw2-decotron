/**
 * E2E Tests: Export Decorations to XML
 *
 * Covers:
 * - Export button opens dialog pre-checked by layer visibility; confirm downloads XML
 * - Export dialog shows decoration counts; layers can be individually toggled
 * - Cancel or Escape closes the dialog without downloading
 */
import { test, expect } from './fixtures.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOMESTEAD_XML = path.resolve(__dirname, '../homestead.xml');

async function loadLayout(page) {
    await page.goto('/');
    await page.waitForSelector('body[data-app-ready]', { state: 'attached', timeout: 15_000 });
    await page.locator('#file-input').setInputFiles(HOMESTEAD_XML);
    await expect(page.locator('#layers-list .layer-item').first()).toBeVisible({ timeout: 10_000 });
}

test.describe('Export Decorations to XML', () => {

    test('export dialog reflects layout state and cancels without downloading', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('body[data-app-ready]', { state: 'attached', timeout: 15_000 });

        await expect(page.locator('#export-btn')).toBeDisabled();

        await page.locator('#file-input').setInputFiles(HOMESTEAD_XML);
        await expect(page.locator('#layers-list .layer-item').first()).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('#export-btn')).toBeEnabled({ timeout: 5_000 });

        let downloadFired = false;
        page.on('download', () => { downloadFired = true; });
        await page.locator('#export-btn').click();
        const dialog = page.locator('dialog.export-dialog');
        await expect(dialog).toBeVisible({ timeout: 5_000 });
        const layerItems = page.locator('#layers-list .layer-item');
        const checkboxes = dialog.locator('.export-dialog__checkbox');
        const countBadges = dialog.locator('.export-dialog__layer-count');

        const layerCount = await layerItems.count();
        await expect(checkboxes).toHaveCount(layerCount);
        await expect(countBadges).toHaveCount(layerCount);
        for (let index = 0; index < layerCount; index++) {
            const isVisible = await layerItems.nth(index).locator('.visibility-icon').getAttribute('data-visible');
            await expect(checkboxes.nth(index)).toBeChecked({ checked: isVisible === 'true' });
            await expect(countBadges.nth(index)).toContainText(/\d+ decoration/i);
        }

        for (const checkbox of await checkboxes.all()) {
            if (await checkbox.isChecked()) {
                await checkbox.uncheck();
            }
        }

        await expect(dialog.locator('.export-dialog__confirm')).toBeDisabled();
        await dialog.locator('.export-dialog__cancel').click();
        await expect(dialog).not.toBeVisible({ timeout: 3_000 });
        expect(downloadFired).toBe(false);

    });

    test('confirming export triggers a file download', async ({ page }) => {
        // Disable showSaveFilePicker so the handler falls back to the anchor-click
        // download path, which triggers Playwright's 'download' event.
        await page.addInitScript(() => { delete window.showSaveFilePicker; });
        await loadLayout(page);

        // Listen for the download
        const downloadPromise = page.waitForEvent('download', { timeout: 10_000 });

        await page.locator('#export-btn').click();
        await expect(page.locator('dialog.export-dialog')).toBeVisible({ timeout: 5_000 });
        await page.locator('dialog.export-dialog .export-dialog__confirm').click();

        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.xml$/);
    });

});
