/**
 * E2E Tests: Toggle Layer Visibility
 *
 * Covers:
 * - Load two layers → toggle Layer 1 visibility off → Layer 1 decorations hidden on map while Layer 2 remains visible
 * - Toggle back on → both visible
 * - Hidden layer shows dimmed visual indicator in Layer Panel
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

    // Wait for layers to appear in the panel
    await expect(page.locator('#layers-list .layer-item').first()).toBeVisible({ timeout: 10_000 });
}

test.describe('Toggle Layer Visibility', () => {

    test('hiding and restoring a layer updates the panel and map', async ({ page }) => {
        await loadLayout(page);

        const decorationCircles = page.locator('svg .decorations .decoration');
        const countBefore = await decorationCircles.count();
        expect(countBefore).toBeGreaterThan(0);

        const firstLayer = page.locator('#layers-list .layer-item').first();
        const visibilityIcon = firstLayer.locator('.visibility-icon');
        await visibilityIcon.click();

        await expect(visibilityIcon).toHaveAttribute('data-visible', 'false');
        await expect(firstLayer).toHaveClass(/layer-hidden/);
        const countAfter = await decorationCircles.count();
        expect(countAfter).toBeLessThan(countBefore);

        await visibilityIcon.click();
        await expect(visibilityIcon).toHaveAttribute('data-visible', 'true');
        await expect(firstLayer).not.toHaveClass(/layer-hidden/);
        await expect(decorationCircles).toHaveCount(countBefore);
    });
});
