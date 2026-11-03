/**
 * E2E Tests: Delete Layer
 *
 * Covers:
 * - Load two layers → delete Layer 1 → removed from Layer Panel and decorations removed from map
 * - Ctrl+Z undo → layer and decorations restored
 * - Delete last remaining layer → map shows no decorations
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
 * Helper: load two layers — load layout then add an empty second layer.
 */
async function loadTwoLayers(page) {
    await loadLayout(page);

    // Click "Add Layer" to create a second layer
    await page.locator('#add-layer-btn').click();

    // Wait for two layers to appear
    await expect(page.locator('#layers-list .layer-item')).toHaveCount(2, { timeout: 10_000 });
}

test.describe('Delete Layer', () => {

    test('deleting a layer removes it from Layer Panel and map', async ({ page }) => {
        await loadTwoLayers(page);

        const layers = page.locator('#layers-list .layer-item');
        const countBefore = await layers.count();
        expect(countBefore).toBe(2);

        // Count decorations before deletion (first layer has decorations, second is empty)
        const decorationsBefore = await page.locator('svg .decorations .decoration').count();
        expect(decorationsBefore).toBeGreaterThan(0);

        // Hover the first layer (which has decorations) to reveal the delete button, then click it
        const firstLayer = layers.first();
        await firstLayer.hover();
        const deleteBtn = firstLayer.locator('.delete-layer-btn');
        await deleteBtn.click();

        const dialog = page.locator('dialog.confirm-dialog[open]');
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('.confirm-dialog__title')).toHaveText('Delete Layer');
        await dialog.locator('.confirm-dialog__confirm').click();

        // Layer should be removed from panel
        await expect(layers).toHaveCount(1, { timeout: 5_000 });

        // All decorations from the deleted layer should be removed from map
        const decorationsAfter = await page.locator('svg .decorations .decoration').count();
        expect(decorationsAfter).toBe(0);
    });

    // Ctrl+Z keyboard shortcut is wired in Phase 8 (T056).
    test('Ctrl+Z after delete restores the layer and decorations', async ({ page }) => {
        await loadTwoLayers(page);

        const layers = page.locator('#layers-list .layer-item');
        const decorationsBefore = await page.locator('svg .decorations .decoration').count();

        // Delete the first layer
        const firstLayer = layers.first();
        const firstLayerName = await firstLayer.locator('.layer-name').textContent();
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

    test('deleting last remaining layer leaves map with no decorations', async ({ page }) => {
        await loadLayout(page);

        const layers = page.locator('#layers-list .layer-item');
        await expect(layers).toHaveCount(1);

        // Delete the only layer
        await layers.first().hover();
        const deleteBtn = layers.first().locator('.delete-layer-btn');
        await deleteBtn.click();

        const dialog = page.locator('dialog.confirm-dialog[open]');
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('.confirm-dialog__title')).toHaveText('Delete Layer');
        await dialog.locator('.confirm-dialog__confirm').click();

        // Layer panel should be empty
        await expect(layers).toHaveCount(0, { timeout: 5_000 });

        // Map should have no decoration circles
        const decorations = page.locator('svg .decorations .decoration');
        await expect(decorations).toHaveCount(0, { timeout: 5_000 });
    });
});
