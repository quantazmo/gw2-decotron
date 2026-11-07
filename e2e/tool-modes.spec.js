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

async function getSparseDecorationCenters(page) {
    const centers = await page.locator('#map-container svg .decorations [data-decoration-id]').evaluateAll(elements =>
        elements.map(element => {
            const bounds = element.getBoundingClientRect();
            return {
                id: element.getAttribute('data-decoration-id'),
                x: (bounds.left + bounds.right) / 2,
                y: (bounds.top + bounds.bottom) / 2
            };
        })
    );

    return centers.filter(center => centers.every(other => {
        if (other.id === center.id) return true;
        return Math.hypot(other.x - center.x, other.y - center.y) > 16;
    }));
}

async function drawLassoAround(page, center, additive = false) {
    if (additive) await page.keyboard.down('Control');

    await page.mouse.move(center.x - 5, center.y - 5);
    await page.mouse.down();
    await page.mouse.move(center.x + 5, center.y - 5, { steps: 2 });
    await page.mouse.move(center.x + 5, center.y + 5, { steps: 2 });
    await page.mouse.move(center.x - 5, center.y + 5, { steps: 2 });
    await page.mouse.move(center.x - 5, center.y - 5, { steps: 2 });
    await page.mouse.up();

    if (additive) await page.keyboard.up('Control');
}

test.describe('Tool Modes', () => {

    test('toolbar loads with Pan active and switches modes', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('body[data-app-ready]', { state: 'attached', timeout: 15_000 });

        const panBtn = page.locator('[data-action="tool-pan"]');
        const selectBtn = page.locator('[data-action="tool-select"]');
        const rotateBtn = page.locator('[data-action="ribbon-rotate-selected"]');

        await expect(panBtn).toBeVisible();
        await expect(selectBtn).toBeVisible();
        await expect(rotateBtn).toBeHidden();
        await expect(panBtn).toHaveAttribute('aria-pressed', 'true');
        await expect(selectBtn).toHaveAttribute('aria-pressed', 'false');

        await selectBtn.click();
        await expect(selectBtn).toHaveAttribute('aria-pressed', 'true');
        await expect(panBtn).toHaveAttribute('aria-pressed', 'false');
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

        const sparseCenters = await getSparseDecorationCenters(page);
        if (sparseCenters.length < 2) {
            test.skip('Could not find two separated decorations for lasso assertions');
            return;
        }

        const target = sparseCenters[0];
        const outside = sparseCenters.reduce((farthest, center) =>
            Math.hypot(center.x - target.x, center.y - target.y) > Math.hypot(farthest.x - target.x, farthest.y - target.y)
                ? center
                : farthest
        );
        const decoration = id => page.locator(`#map-container svg .decorations [data-decoration-id="${id}"]`);

        await drawLassoAround(page, target);

        await expect(page.locator('svg .selection-lasso')).toHaveCount(0);
        await expect(decoration(target.id)).toHaveClass(/selected-decoration/, { timeout: 3_000 });
        await expect(decoration(outside.id)).not.toHaveClass(/selected-decoration/);

        const additiveTarget = sparseCenters.find(center =>
            center.id !== target.id && center.id !== outside.id &&
            Math.hypot(center.x - target.x, center.y - target.y) > 32
        ) ?? outside;
        await drawLassoAround(page, additiveTarget, true);

        await expect(decoration(target.id)).toHaveClass(/selected-decoration/);
        await expect(decoration(additiveTarget.id)).toHaveClass(/selected-decoration/);
        await expect(decoration(outside.id)).not.toHaveClass(/selected-decoration/);
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
