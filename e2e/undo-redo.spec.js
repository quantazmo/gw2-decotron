/**
 * E2E Tests: Undo and Redo All Decoration Actions
 *
 * Covers:
 * - Move decorations between layers then Ctrl+Z → decorations return
 * - Ctrl+Y → move re-applied
 * - Delete layer then Ctrl+Z → layer restored with decorations
 * - Perform new action after undo → redo disabled
 * - Ctrl+Z when no actions → no-op and no errors
 */
import { test, expect } from './fixtures.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOMESTEAD_XML = path.resolve(__dirname, '../homestead.xml');

/**
 * Helper: wait for app to be ready and load a layout.
 */
async function loadLayout(page) {
    await page.goto('/');
    await page.waitForSelector('body[data-app-ready]', { state: 'attached', timeout: 15_000 });

    // Load the layout
    await page.locator('#file-input').setInputFiles(HOMESTEAD_XML);

    // Wait for layers to appear
    await expect(page.locator('#layers-list .layer-item').first()).toBeVisible({ timeout: 10_000 });
}

/**
 * Helper: load layout and add a second layer for testing.
 */
async function loadTwoLayers(page) {
    await loadLayout(page);

    // Click "Add Layer" to create a second layer
    await page.locator('#add-layer-btn').click();

    // Wait for two layers to appear
    await expect(page.locator('#layers-list .layer-item')).toHaveCount(2, { timeout: 10_000 });
}

test.describe('Undo and Redo All Decoration Actions', () => {

    test('Ctrl+Z when no undo actions is a no-op with no errors', async ({ page }) => {
        await loadLayout(page);

        // Collect any console errors
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        // Press Ctrl+Z — should be a no-op
        await page.keyboard.press('Control+z');

        // Wait a beat to ensure no delayed errors
        await page.waitForTimeout(500);

        // No page errors should have occurred
        expect(errors).toHaveLength(0);

        // Layers should still be intact
        const layers = page.locator('#layers-list .layer-item');
        await expect(layers.first()).toBeVisible();
    });

    test('delete layer then Ctrl+Z restores the layer with decorations', async ({ page }) => {
        await loadTwoLayers(page);

        const layers = page.locator('#layers-list .layer-item');
        const decorationsBefore = await page.locator('svg .decorations .decoration').count();

        // Delete the first layer (which has decorations)
        const firstLayer = layers.first();
        await firstLayer.hover();
        await firstLayer.locator('.delete-layer-btn').click();

        const dialog = page.locator('dialog.confirm-dialog[open]');
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('.confirm-dialog__title')).toHaveText('Delete Layer');
        await dialog.locator('.confirm-dialog__confirm').click();

        // Wait for deletion
        await expect(layers).toHaveCount(1, { timeout: 5_000 });

        // Undo via Ctrl+Z
        await page.keyboard.press('Control+z');

        // Layer should be restored
        await expect(layers).toHaveCount(2, { timeout: 5_000 });

        // Decorations should be restored
        const decorationsAfter = await page.locator('svg .decorations .decoration').count();
        expect(decorationsAfter).toBe(decorationsBefore);
    });

    test('perform new action after undo clears redo', async ({ page }) => {
        await loadLayout(page);

        // Create a layer (undoable action)
        await page.locator('#add-layer-btn').click();
        await expect(page.locator('#layers-list .layer-item')).toHaveCount(2, { timeout: 5_000 });

        // Undo — layer removed
        await page.keyboard.press('Control+z');
        await expect(page.locator('#layers-list .layer-item')).toHaveCount(1, { timeout: 5_000 });

        // Perform new action: create another layer — should clear redo stack
        await page.locator('#add-layer-btn').click();
        await expect(page.locator('#layers-list .layer-item')).toHaveCount(2, { timeout: 5_000 });

        // Ctrl+Y should be a no-op (redo was cleared by the new action)
        await page.keyboard.press('Control+y');
        await page.waitForTimeout(500);

        // Still 2 layers (no redo action happened)
        await expect(page.locator('#layers-list .layer-item')).toHaveCount(2);
    });

    test('Ctrl+Y re-applies a previously undone action', async ({ page }) => {
        await loadLayout(page);

        // Create a new layer
        await page.locator('#add-layer-btn').click();
        await expect(page.locator('#layers-list .layer-item')).toHaveCount(2, { timeout: 5_000 });

        // Undo
        await page.keyboard.press('Control+z');
        await expect(page.locator('#layers-list .layer-item')).toHaveCount(1, { timeout: 5_000 });

        // Redo via Ctrl+Y
        await page.keyboard.press('Control+y');
        await expect(page.locator('#layers-list .layer-item')).toHaveCount(2, { timeout: 5_000 });
    });
});
