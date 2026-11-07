/**
 * E2E Tests: Extend Decoration Pattern
 */
import { test, expect } from './fixtures.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HOMESTEAD_XML = path.resolve(__dirname, '../homestead.xml');

test('extends one selected decoration using the configured position step', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('body[data-app-ready]', { state: 'attached', timeout: 15_000 });
    await page.locator('#file-input').setInputFiles(HOMESTEAD_XML);
    await expect(page.locator('.decoration-list__item').first()).toBeVisible({ timeout: 10_000 });

    const decorations = page.locator('#map-container svg .decorations [data-decoration-id]');
    const countBefore = await decorations.count();
    await page.locator('.decoration-list__item').first().click();

    const extendButton = page.locator('[data-action="ribbon-extend-decorations"]');
    await expect(extendButton).toBeEnabled();
    await extendButton.click();

    await page.locator('[data-role="step"][data-group="position"][data-axis="x"]').fill('100');
    await page.locator('.extend-pattern-count-input').fill('1');
    const guideLine = page.locator('.extend-pattern-guide-line');
    await expect(guideLine).toHaveCount(1);
    await expect(guideLine).toHaveCSS('stroke', 'rgb(255, 209, 102)');
    await expect(guideLine.evaluate(line => line.parentElement.firstElementChild === line)).resolves.toBe(true);
    await page.locator('.extend-pattern-panel-content .create-panel-save').click();

    await expect(decorations).toHaveCount(countBefore + 1, { timeout: 10_000 });
    await page.locator('[data-action="ribbon-undo"]').click();
    await expect(decorations).toHaveCount(countBefore);
    await page.locator('[data-action="ribbon-redo"]').click();
    await expect(decorations).toHaveCount(countBefore + 1);
});

test('extends two selected decorations of the same type', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('body[data-app-ready]', { state: 'attached', timeout: 15_000 });
    await page.locator('#file-input').setInputFiles(HOMESTEAD_XML);
    await expect(page.locator('.decoration-list__item').first()).toBeVisible({ timeout: 10_000 });

    const items = page.locator('.decoration-list__item');
    const names = await page.locator('.decoration-list__item-name').allTextContents();
    const secondIndex = names.findIndex((name, index) => names.indexOf(name) < index);
    if (secondIndex < 0) {
        test.skip('The loaded layout has no repeated decoration names');
        return;
    }
    const firstIndex = names.indexOf(names[secondIndex]);
    const firstId = await items.nth(firstIndex).getAttribute('data-decoration-id');
    const secondId = await items.nth(secondIndex).getAttribute('data-decoration-id');

    const decorations = page.locator('#map-container svg .decorations [data-decoration-id]');
    const countBefore = await decorations.count();
    await items.nth(firstIndex).click();
    await items.nth(secondIndex).click({ modifiers: ['Control'] });

    const extendButton = page.locator('[data-action="ribbon-extend-decorations"]');
    await expect(extendButton).toBeEnabled();
    await extendButton.click();
    const swapButton = page.locator('.extend-pattern-swap-start-button');
    await expect(swapButton).toBeVisible();

    const firstCircle = page.locator(`#map-container svg .decorations [data-decoration-id="${firstId}"]`);
    const secondCircle = page.locator(`#map-container svg .decorations [data-decoration-id="${secondId}"]`);
    const offsetX = page.locator('[data-role="step"][data-group="position"][data-axis="x"]');
    const movedPreview = page.locator('[data-preview-source-id]');
    await expect(movedPreview).toHaveAttribute('data-preview-source-id', secondId);
    await expect(secondCircle).toHaveClass(/extend-pattern-source-hidden/);
    const initialSeparation = Math.abs(
        Number(await movedPreview.getAttribute('cx')) - Number(await firstCircle.getAttribute('cx'))
    );

    await offsetX.fill('777');
    await expect.poll(async () => Math.abs(
        Number(await movedPreview.getAttribute('cx')) - Number(await firstCircle.getAttribute('cx'))
    )).not.toBe(initialSeparation);
    await swapButton.click();
    await expect(movedPreview).toHaveAttribute('data-preview-source-id', firstId);
    await expect(firstCircle).toHaveClass(/extend-pattern-source-hidden/);
    await expect(secondCircle).not.toHaveClass(/extend-pattern-source-hidden/);

    await page.locator('.extend-pattern-panel-content .create-panel-cancel').click();
    await expect(firstCircle).not.toHaveClass(/extend-pattern-source-hidden/);
    await expect(secondCircle).not.toHaveClass(/extend-pattern-source-hidden/);
    await expect(movedPreview).toHaveCount(0);
    await expect(decorations).toHaveCount(countBefore);

    await extendButton.click();
    await offsetX.fill('777');
    const savedSeedX = await movedPreview.getAttribute('cx');
    await page.locator('.extend-pattern-panel-content .create-panel-save').click();

    await expect(decorations).toHaveCount(countBefore + 1, { timeout: 10_000 });
    await expect(secondCircle).not.toHaveClass(/extend-pattern-source-hidden/);
    await expect(secondCircle).toHaveAttribute('cx', savedSeedX);
});

test('fills evenly spaced decorations between two selected decorations', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('body[data-app-ready]', { state: 'attached', timeout: 15_000 });
    await page.locator('#file-input').setInputFiles(HOMESTEAD_XML);
    await expect(page.locator('.decoration-list__item').first()).toBeVisible({ timeout: 10_000 });

    const items = page.locator('.decoration-list__item');
    const names = await page.locator('.decoration-list__item-name').allTextContents();
    const secondIndex = names.findIndex((name, index) => names.indexOf(name) < index);
    if (secondIndex < 0) {
        test.skip('The loaded layout has no repeated decoration names');
        return;
    }
    const firstIndex = names.indexOf(names[secondIndex]);
    const firstId = await items.nth(firstIndex).getAttribute('data-decoration-id');
    const secondId = await items.nth(secondIndex).getAttribute('data-decoration-id');
    const firstCircle = page.locator(`#map-container svg .decorations [data-decoration-id="${firstId}"]`);
    const secondCircle = page.locator(`#map-container svg .decorations [data-decoration-id="${secondId}"]`);
    const decorations = page.locator('#map-container svg .decorations [data-decoration-id]');
    const countBefore = await decorations.count();
    await items.nth(firstIndex).click();
    await items.nth(secondIndex).click({ modifiers: ['Control'] });

    const fillButton = page.locator('[data-action="ribbon-fill-decorations"]');
    await expect(fillButton).toBeEnabled();
    const initialSeparation = Math.abs(
        Number(await firstCircle.getAttribute('cx')) - Number(await secondCircle.getAttribute('cx'))
    );
    await fillButton.click();
    await page.locator('.fill-pattern-count-input').fill('3');

    const firstX = Number(await firstCircle.getAttribute('cx'));
    const secondX = Number(await secondCircle.getAttribute('cx'));
    expect(Math.abs(firstX - secondX)).not.toBeCloseTo(initialSeparation, 3);
    const previews = page.locator('.extend-pattern-previews .extend-pattern-preview');
    await expect(previews).toHaveCount(3);
    const guideLine = page.locator('.extend-pattern-guide-line');
    await expect(guideLine).toHaveCount(1);
    await expect(guideLine).toHaveCSS('stroke', 'rgb(255, 209, 102)');
    await expect(guideLine.evaluate(line => line.parentElement.firstElementChild === line)).resolves.toBe(true);
    const previewXs = await previews.evaluateAll(elements => elements.map(element => Number(element.getAttribute('cx'))));
    for (let index = 0; index < previewXs.length; index += 1) {
        expect(previewXs[index]).toBeCloseTo(firstX + (secondX - firstX) * ((index + 1) / 4), 4);
    }

    await page.locator('.extend-pattern-panel-content .create-panel-save').click();
    await expect(decorations).toHaveCount(countBefore + 3, { timeout: 10_000 });
    await expect(firstCircle).toHaveAttribute('cx', String(firstX));
    await expect(secondCircle).toHaveAttribute('cx', String(secondX));
    await page.locator('[data-action="ribbon-undo"]').click();
    await expect(decorations).toHaveCount(countBefore);
    await page.locator('[data-action="ribbon-redo"]').click();
    await expect(decorations).toHaveCount(countBefore + 3);
});