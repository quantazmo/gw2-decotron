/**
 * E2E Tests: Delete Selected Decorations
 *
 * Covers:
 * - Select 2 decorations on map → press Delete key → both removed from map and decoration list
 * - Ctrl+Z → decorations restored to original layers
 * - No selection + press Delete → nothing happens and no errors
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

test.describe('Delete Selected Decorations', () => {

    test('select decorations on map and press Delete → removed from map', async ({ page }) => {
        await loadLayout(page);

        const circles = page.locator('svg .decorations [data-decoration-id]');
        await expect(circles.first()).toBeVisible({ timeout: 5_000 });

        const countBefore = await circles.count();
        expect(countBefore).toBeGreaterThan(1);

        // Get the first decoration ID before clicking (click reorders DOM)
        const selectedId = await circles.first().getAttribute('data-decoration-id');
        expect(selectedId).toBeTruthy();

        // Click the first decoration to select it
        await circles.first().evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
        await expect(page.locator('svg .decorations .selected-decoration')).toHaveCount(1);

        // Press Delete key
        await page.keyboard.press('Delete');

        const dialog = page.locator('dialog.confirm-dialog[open]');
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('.confirm-dialog__title')).toHaveText('Delete 1 Decoration?');
        await dialog.locator('.confirm-dialog__confirm').click();

        // Wait for the decoration to be removed
        await expect(page.locator(`svg .decorations [data-decoration-id="${selectedId}"]`)).toHaveCount(0, { timeout: 5_000 });

        // Verify count decreased
        const countAfter = await circles.count();
        expect(countAfter).toBe(countBefore - 1);
    });

    test('Ctrl+Click to multi-select then Delete removes both', async ({ page }) => {
        await loadLayout(page);

        const circles = page.locator('svg .decorations [data-decoration-id]');
        await expect(circles.first()).toBeVisible({ timeout: 5_000 });

        const countBefore = await circles.count();
        expect(countBefore).toBeGreaterThan(1);

        // Get IDs before clicking (click reorders DOM)
        const id1 = await circles.first().getAttribute('data-decoration-id');
        const id2 = await circles.nth(1).getAttribute('data-decoration-id');

        // Click first decoration
        await circles.first().evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));

        // Ctrl+Click second decoration
        await page.locator(`svg .decorations [data-decoration-id="${id2}"]`).evaluate(el =>
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })));

        // Press Delete
        await page.keyboard.press('Delete');
        await page.locator('dialog.confirm-dialog[open] .confirm-dialog__confirm').click();

        // Both should be removed
        await expect(page.locator(`svg .decorations [data-decoration-id="${id1}"]`)).toHaveCount(0, { timeout: 5_000 });
        await expect(page.locator(`svg .decorations [data-decoration-id="${id2}"]`)).toHaveCount(0, { timeout: 5_000 });

        const countAfter = await circles.count();
        expect(countAfter).toBe(countBefore - 2);
    });

    test('Ctrl+Z after Delete restores decorations', async ({ page }) => {
        await loadLayout(page);

        const circles = page.locator('svg .decorations [data-decoration-id]');
        await expect(circles.first()).toBeVisible({ timeout: 5_000 });

        const countBefore = await circles.count();

        // Get ID before clicking (click reorders DOM)
        const selectedId = await circles.first().getAttribute('data-decoration-id');

        // Select and delete a decoration
        await circles.first().evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
        await page.keyboard.press('Delete');
        await page.locator('dialog.confirm-dialog[open] .confirm-dialog__confirm').click();

        // Verify deleted
        await expect(page.locator(`svg .decorations [data-decoration-id="${selectedId}"]`)).toHaveCount(0, { timeout: 5_000 });

        // Undo with Ctrl+Z
        await page.keyboard.press('Control+z');

        // Decoration should be restored
        await expect(page.locator(`svg .decorations [data-decoration-id="${selectedId}"]`)).toHaveCount(1, { timeout: 5_000 });

        const countAfterUndo = await circles.count();
        expect(countAfterUndo).toBe(countBefore);
    });

    test('no selection + press Delete → nothing happens and no errors', async ({ page }) => {
        await loadLayout(page);

        const circles = page.locator('svg .decorations [data-decoration-id]');
        await expect(circles.first()).toBeVisible({ timeout: 5_000 });

        const countBefore = await circles.count();

        // Collect any console errors
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));

        // Press Delete with no selection
        await page.keyboard.press('Delete');

        // Give time for any potential error
        await page.waitForTimeout(500);

        // Decoration count unchanged
        const countAfter = await circles.count();
        expect(countAfter).toBe(countBefore);

        // No errors
        expect(errors).toHaveLength(0);
    });

    test('Backspace key also deletes selected decorations', async ({ page }) => {
        await loadLayout(page);

        const circles = page.locator('svg .decorations [data-decoration-id]');
        await expect(circles.first()).toBeVisible({ timeout: 5_000 });

        const countBefore = await circles.count();

        // Get ID before clicking (click reorders DOM)
        const selectedId = await circles.first().getAttribute('data-decoration-id');

        // Select the first decoration
        await circles.first().evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));

        // Press Backspace
        await page.keyboard.press('Backspace');
        await page.locator('dialog.confirm-dialog[open] .confirm-dialog__confirm').click();

        // Decoration should be removed
        await expect(page.locator(`svg .decorations [data-decoration-id="${selectedId}"]`)).toHaveCount(0, { timeout: 5_000 });
        const countAfter = await circles.count();
        expect(countAfter).toBe(countBefore - 1);
    });
});
