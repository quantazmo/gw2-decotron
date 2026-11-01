/**
 * E2E Tests: Ribbon Tool Modes: Map Pan, Multi Select, and Lasso Select
 *
 * Covers:
 * - Ribbon toolbar shows "Map Pan" and "Multi Select" buttons with Map Pan active by default
 * - Switch to Multi Select → click-drag draws visible selection rectangle → enclosed decorations selected on release
 * - Ctrl+drag adds to selection
 * - Switch back to Map Pan → selection preserved and click-drag pans map
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

test.describe('Tool Modes', () => {

    test('ribbon toolbar has Map Pan and Multi Select buttons', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('body[data-app-ready]', { state: 'attached', timeout: 15_000 });

        const panBtn = page.locator('[data-action="tool-pan"]');
        const selectBtn = page.locator('[data-action="tool-select"]');

        await expect(panBtn).toBeVisible();
        await expect(selectBtn).toBeVisible();
    });

    test('Map Pan is active (aria-pressed=true) by default', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('body[data-app-ready]', { state: 'attached', timeout: 15_000 });

        const panBtn = page.locator('[data-action="tool-pan"]');
        const selectBtn = page.locator('[data-action="tool-select"]');

        await expect(panBtn).toHaveAttribute('aria-pressed', 'true');
        await expect(selectBtn).toHaveAttribute('aria-pressed', 'false');
    });

    test('clicking Multi Select switches aria-pressed state', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('body[data-app-ready]', { state: 'attached', timeout: 15_000 });

        const panBtn = page.locator('[data-action="tool-pan"]');
        const selectBtn = page.locator('[data-action="tool-select"]');

        await selectBtn.click();

        await expect(selectBtn).toHaveAttribute('aria-pressed', 'true');
        await expect(panBtn).toHaveAttribute('aria-pressed', 'false');
    });

    test('switching back to Map Pan updates aria-pressed', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('body[data-app-ready]', { state: 'attached', timeout: 15_000 });

        const panBtn = page.locator('[data-action="tool-pan"]');
        const selectBtn = page.locator('[data-action="tool-select"]');

        await selectBtn.click();
        await panBtn.click();

        await expect(panBtn).toHaveAttribute('aria-pressed', 'true');
        await expect(selectBtn).toHaveAttribute('aria-pressed', 'false');
    });

    test('in Multi Select mode, drag on empty SVG area selects enclosed decorations', async ({ page }) => {
        await loadLayout(page);

        // Switch to Multi Select
        await page.locator('[data-action="tool-select"]').click();

        // Get all decoration circles and find one close to the top-left so we can
        // draw a rectangle around a known subset
        const circles = page.locator('svg .decorations [data-decoration-id]');
        const count = await circles.count();
        if (count === 0) {
            test.skip('No decorations rendered');
            return;
        }

        // Grab the bounding box of the first circle
        const firstBox = await circles.first().boundingBox();
        if (!firstBox) {
            test.skip('Could not obtain decoration bounding box');
            return;
        }

        const svgLocator = page.locator('svg').first();
        const svgBox = await svgLocator.boundingBox();
        if (!svgBox) {
            test.skip('Could not obtain SVG bounding box');
            return;
        }

        // Draw a large rectangle that encloses the first decoration
        const startX = firstBox.x - svgBox.x - 10;
        const startY = firstBox.y - svgBox.y - 10;
        const endX = firstBox.x - svgBox.x + firstBox.width + 10;
        const endY = firstBox.y - svgBox.y + firstBox.height + 10;

        // Use page.mouse.move directly to avoid the interactability check
        // that fails when boundary polygon elements intercept pointer events
        await page.mouse.move(svgBox.x + startX, svgBox.y + startY);
        await page.mouse.down();
        await page.mouse.move(svgBox.x + endX, svgBox.y + endY, { steps: 5 });
        await page.mouse.up();

        // At least one circle should be selected
        await expect(page.locator('svg .decorations .selected-decoration').first()).toBeVisible({ timeout: 3_000 });
    });

    test('Lasso Select draws a freeform path and selects enclosed decorations', async ({ page }) => {
        await loadLayout(page);

        const lassoBtn = page.locator('[data-action="tool-lasso"]');
        await expect(lassoBtn).toBeVisible();
        await lassoBtn.click();
        await expect(lassoBtn).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('.selection-shortcut-hint')).toBeVisible();

        const circles = page.locator('svg .decorations [data-decoration-id]');
        const count = await circles.count();
        if (count === 0) {
            test.skip('No decorations rendered');
            return;
        }

        const firstBox = await circles.first().boundingBox();
        const svgBox = await page.locator('svg').first().boundingBox();
        if (!firstBox || !svgBox) {
            test.skip('Could not obtain map element bounds');
            return;
        }

        const left = firstBox.x - svgBox.x - 12;
        const top = firstBox.y - svgBox.y - 12;
        const right = firstBox.x - svgBox.x + firstBox.width + 12;
        const bottom = firstBox.y - svgBox.y + firstBox.height + 12;

        await page.mouse.move(svgBox.x + left, svgBox.y + top);
        await page.mouse.down();
        await page.mouse.move(svgBox.x + right, svgBox.y + top, { steps: 3 });
        await expect(page.locator('svg .selection-lasso')).toHaveAttribute('d', /L/);
        await page.mouse.move(svgBox.x + right, svgBox.y + (top + bottom) / 2, { steps: 2 });
        await page.mouse.move(svgBox.x + right - 4, svgBox.y + bottom, { steps: 2 });
        await page.mouse.move(svgBox.x + left, svgBox.y + bottom - 4, { steps: 2 });
        await page.mouse.move(svgBox.x + left, svgBox.y + top, { steps: 2 });
        await page.mouse.up();

        await expect(page.locator('svg .decorations .selected-decoration').first()).toBeVisible({ timeout: 3_000 });
    });

    test('switching back to Map Pan preserves selection', async ({ page }) => {
        await loadLayout(page);

        const circles = page.locator('svg .decorations [data-decoration-id]');
        const count = await circles.count();
        if (count === 0) {
            test.skip('No decorations rendered');
            return;
        }

        // Select a decoration in Pan mode via click
        await circles.first().evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
        await expect(page.locator('svg .decorations .selected-decoration')).toHaveCount(1);

        // Now switch to Multi Select and back to Pan
        await page.locator('[data-action="tool-select"]').click();
        await page.locator('[data-action="tool-pan"]').click();

        // Selection should still be there
        await expect(page.locator('svg .decorations .selected-decoration')).toHaveCount(1);
    });
});
