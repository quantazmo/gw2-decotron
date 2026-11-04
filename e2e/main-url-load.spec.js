/**
 * E2E Tests: Load-from-URL switch-map logic
 *
 * Covers:
 * - Ribbon "Load from URL": when a different-map layout is loaded from URL while a map is
 *   already open, the switch-map confirmation dialog must appear (same as file-drop).
 * - Ribbon "Load from URL": when the same map is loaded again it adds a layer without
 *   a confirmation dialog.
 * - ?layout=<relative-path> on page load → layout is fetched and layers appear
 * - ?layout= empty / absent → app loads normally (empty state, no error)
 */
import { test, expect } from './fixtures.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOMESTEAD_XML = path.resolve(__dirname, '../homestead.xml');
const DIFFERENT_MAP_URL = '/e2e/data/different-map.xml';

async function loadFirstLayout(page) {
    await page.goto('/');
    await page.waitForSelector('body[data-app-ready]', { state: 'attached', timeout: 15_000 });
    await page.locator('#file-input').setInputFiles(HOMESTEAD_XML);
    await expect(page.locator('#layers-list .layer-item').first()).toBeVisible({ timeout: 10_000 });
}

test.describe('Load-from-URL: switch-map confirmation (ribbon)', () => {

    test('shows confirmation dialog when URL layout is for a different map', async ({ page }) => {
        await loadFirstLayout(page);
        const layerCountBefore = await page.locator('#layers-list .layer-item').count();

        // Open the Load-from-URL dialog and submit a URL pointing to a different map
        await page.locator('[data-action="ribbon-load-url"]').click();
        await page.locator('.load-url-dialog__input').fill(DIFFERENT_MAP_URL);
        await page.locator('.load-url-dialog__load').click();

        // The switch-map confirmation dialog must appear
        const dialog = page.locator('dialog.confirm-dialog[data-dialog-type="mapSwitch"]');
        await expect(dialog).toBeVisible({ timeout: 5_000 });

        // Dialog mentions the map names
        const message = await dialog.locator('.confirm-dialog__message').textContent();
        expect(message).toContain('Finding Balance');
    });

    test('cancelling the confirmation keeps existing layers intact', async ({ page }) => {
        await loadFirstLayout(page);
        const layerCountBefore = await page.locator('#layers-list .layer-item').count();

        await page.locator('[data-action="ribbon-load-url"]').click();
        await page.locator('.load-url-dialog__input').fill(DIFFERENT_MAP_URL);
        await page.locator('.load-url-dialog__load').click();

        const dialog = page.locator('dialog.confirm-dialog[data-dialog-type="mapSwitch"]');
        await expect(dialog).toBeVisible({ timeout: 5_000 });

        // Cancel
        await dialog.locator('.confirm-dialog__cancel').click();
        await expect(dialog).not.toBeVisible();

        // Layer count unchanged
        await expect(page.locator('#layers-list .layer-item')).toHaveCount(layerCountBefore);
    });

    test('confirming the dialog switches the map and clears existing layers', async ({ page }) => {
        await loadFirstLayout(page);

        await page.locator('[data-action="ribbon-load-url"]').click();
        await page.locator('.load-url-dialog__input').fill(DIFFERENT_MAP_URL);
        await page.locator('.load-url-dialog__load').click();

        const dialog = page.locator('dialog.confirm-dialog[data-dialog-type="mapSwitch"]');
        await expect(dialog).toBeVisible({ timeout: 5_000 });

        // Confirm the switch
        await dialog.locator('.confirm-dialog__confirm').click();
        await expect(dialog).not.toBeVisible();

        // One new layer for the new map, named after the file
        await expect(page.locator('#layers-list .layer-item')).toHaveCount(1, { timeout: 10_000 });
        await expect(page.locator('#layers-list .layer-item .layer-name').first()).toContainText('different-map', { timeout: 10_000 });
    });

    test('adds a layer without confirmation when URL layout is for the same map', async ({ page }) => {
        await loadFirstLayout(page);
        const layerCountBefore = await page.locator('#layers-list .layer-item').count();

        await page.locator('[data-action="ribbon-load-url"]').click();
        // Load the same map (homestead) — no confirmation needed
        await page.locator('.load-url-dialog__input').fill('/homestead.xml');
        await page.locator('.load-url-dialog__load').click();

        // No confirmation dialog
        await expect(page.locator('dialog.confirm-dialog[data-dialog-type="mapSwitch"]')).not.toBeVisible();

        // An additional layer should have been added
        await expect(page.locator('#layers-list .layer-item')).toHaveCount(layerCountBefore + 1, { timeout: 10_000 });
    });
});

test.describe('URL parameter: ?layout=<url>', () => {

    test('loads a layout automatically when ?layout= points to a valid XML', async ({ page }) => {
        // Navigate with ?layout= pointing to a sample served by the dev server
        await page.goto('/?layout=/homestead.xml');
        await page.waitForSelector('body[data-app-ready]', { state: 'attached', timeout: 15_000 });

        // A layer should appear without any user interaction
        await expect(page.locator('#layers-list .layer-item').first()).toBeVisible({ timeout: 15_000 });

        // Map zoom setup must not overwrite the duplicator icon's own transform.
        await expect(page.locator('[data-action="ribbon-extend-decorations"] svg > g'))
            .toHaveAttribute('transform', 'rotate(180 12 12)');
    });

    test('does not error when ?layout= param is absent', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('body[data-app-ready]', { state: 'attached', timeout: 15_000 });

        // No layers — app is in empty state
        await expect(page.locator('#layers-list .layer-item')).toHaveCount(0);
    });

    test('does not error when ?layout= param value is empty', async ({ page }) => {
        await page.goto('/?layout=');
        await page.waitForSelector('body[data-app-ready]', { state: 'attached', timeout: 15_000 });

        // No layers — app is in empty state
        await expect(page.locator('#layers-list .layer-item')).toHaveCount(0);
    });
});
