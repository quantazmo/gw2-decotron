/**
 * Tests for DecorationInfoDialog component
 * Covers: show with decoration data, close on button click,
 * accessibility attributes, displays all decoration fields
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { DecorationInfoDialog } from '../../../src/ui/components/DecorationInfoDialog.js';

function makeDecoration(overrides = {}) {
    return {
        id: '419',
        uid: '7',
        name: 'Oak Tree',
        position: { x: 1234.5, y: 6789.0, z: -42.0 },
        rotation: 1.570796,
        rotX: 0.174533,
        rotZ: 0.349066,
        scale: 1.5,
        ...overrides
    };
}

describe('DecorationInfoDialog', () => {
    let dialog;

    beforeEach(() => {
        document.body.innerHTML = '';
        dialog = new DecorationInfoDialog();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('constructor', () => {
        test('should create a dialog element in the DOM', () => {
            const el = document.querySelector('dialog');
            expect(el).not.toBeNull();
        });

        test('should have role="dialog"', () => {
            const el = document.querySelector('dialog');
            expect(el.getAttribute('role')).toBe('dialog');
        });

        test('should have aria-modal="true"', () => {
            const el = document.querySelector('dialog');
            expect(el.getAttribute('aria-modal')).toBe('true');
        });

        test('should have decoration-info-dialog class', () => {
            const el = document.querySelector('dialog');
            expect(el.classList.contains('decoration-info-dialog')).toBe(true);
        });
    });

    describe('show', () => {
        test('should display the decoration name as the title', () => {
            const promise = dialog.show({ decoration: makeDecoration() });
            const titleEl = document.querySelector('.decoration-info-dialog__title');
            expect(titleEl.textContent).toBe('Oak Tree');
            document.querySelector('.decoration-info-dialog__save').click();
            return promise;
        });

        test('should display the decoration icon when provided', () => {
            const promise = dialog.show({ decoration: makeDecoration(), iconUrl: 'https://example.test/icon.png' });
            const icon = document.querySelector('.decoration-info-dialog__icon');
            expect(icon.getAttribute('src')).toBe('https://example.test/icon.png');
            expect(icon.alt).toBe('Oak Tree');
            expect(icon.hidden).toBe(false);
            dialog._close();
            return promise;
        });

        test('should reveal a matching icon that loads after the dialog opens', () => {
            const promise = dialog.show({ decoration: makeDecoration() });
            dialog.updateIcon(419, 'https://example.test/icon.png');
            const icon = document.querySelector('.decoration-info-dialog__icon');
            expect(icon.getAttribute('src')).toBe('https://example.test/icon.png');
            expect(icon.hidden).toBe(false);
            dialog._close();
            return promise;
        });

        test('should ignore an icon for a different decoration', () => {
            const promise = dialog.show({ decoration: makeDecoration() });
            dialog.updateIcon(420, 'https://example.test/icon.png');
            const icon = document.querySelector('.decoration-info-dialog__icon');
            expect(icon.hasAttribute('src')).toBe(false);
            expect(icon.hidden).toBe(true);
            dialog._close();
            return promise;
        });

        test('should display the decoration ID', () => {
            const promise = dialog.show({ decoration: makeDecoration({ id: '419' }) });
            const rows = document.querySelectorAll('.decoration-info-dialog__row');
            const labels = Array.from(rows).map(row => row.querySelector('.decoration-info-dialog__label')?.textContent);
            const values = Array.from(rows).map(row => row.querySelector('.decoration-info-dialog__value')?.textContent);
            expect(labels).toContain('Decoration ID');
            expect(labels).not.toContain('Type ID');
            expect(labels).not.toContain('Instance UID');
            expect(values).toContain('419');
            document.querySelector('.decoration-info-dialog__save').click();
            return promise;
        });

        test('should render editable position x, y, z inputs', () => {
            const promise = dialog.show({ decoration: makeDecoration({ position: { x: 1234.5, y: 6789.0, z: -42.0 } }) });
            expect(document.querySelector('[name="positionX"]').value).toBe('1234.5');
            expect(document.querySelector('[name="positionY"]').value).toBe('6789');
            expect(document.querySelector('[name="positionZ"]').value).toBe('-42');
            document.querySelector('.decoration-info-dialog__save').click();
            return promise;
        });

        test('should render editable rotation input in radians', () => {
            const promise = dialog.show({ decoration: makeDecoration({ rotation: 1.2 }) });
            expect(document.querySelector('[name="rotation"]').value).toBe('1.2');
            document.querySelector('.decoration-info-dialog__save').click();
            return promise;
        });

        test('should render editable rotX and rotZ inputs', () => {
            const promise = dialog.show({ decoration: makeDecoration({ rotX: 0.25, rotZ: 0.5 }) });
            expect(document.querySelector('[name="rotX"]').value).toBe('0.25');
            expect(document.querySelector('[name="rotZ"]').value).toBe('0.5');
            document.querySelector('.decoration-info-dialog__save').click();
            return promise;
        });

        test('should render editable scale input', () => {
            const promise = dialog.show({ decoration: makeDecoration({ scale: 1.5 }) });
            expect(document.querySelector('[name="scale"]').value).toBe('1.5');
            document.querySelector('.decoration-info-dialog__save').click();
            return promise;
        });

        test('should apply sample-derived bounds to editable fields', () => {
            const promise = dialog.show({ decoration: makeDecoration() });
            for (const field of ['positionX', 'positionY', 'positionZ']) {
                expect(document.querySelector(`[name="${field}"]`).min).toBe('-32768');
                expect(document.querySelector(`[name="${field}"]`).max).toBe('32768');
            }
            expect(document.querySelector('[name="rotation"]').max).toBe('6.283185');
            expect(document.querySelector('[name="scale"]').min).toBe('0.214286');
            expect(document.querySelector('[name="scale"]').max).toBe('2.964286');
            document.querySelector('.decoration-info-dialog__cancel').click();
            return promise;
        });

        test('should save the selected layer', async () => {
            const promise = dialog.show({
                decoration: makeDecoration(),
                layers: [{ id: 'layer-1', name: 'Layer One' }, { id: 'layer-2', name: 'Layer Two' }],
                selectedLayerId: 'layer-1'
            });
            const layerSelect = document.querySelector('.decoration-info-dialog__layer-select');
            expect(layerSelect.value).toBe('layer-1');
            expect(Array.from(layerSelect.options).map(option => option.textContent)).toEqual(['Layer One', 'Layer Two', 'New Layer']);
            layerSelect.value = 'layer-2';
            document.querySelector('.decoration-info-dialog__save').click();
            await expect(promise).resolves.toMatchObject({
                layerSelection: { kind: 'existing', layerId: 'layer-2' },
                updates: {
                    position: { x: 1234.5, y: 6789, z: -42 },
                    rotation: 1.570796,
                    rotX: 0.174533,
                    rotZ: 0.349066,
                    scale: 1.5
                }
            });
        });

        test('should return the new layer selection', async () => {
            const promise = dialog.show({
                decoration: makeDecoration(),
                layers: [{ id: 'layer-1', name: 'Layer One' }],
                selectedLayerId: 'layer-1'
            });
            const layerSelect = document.querySelector('.decoration-info-dialog__layer-select');
            layerSelect.value = '__create_new_layer__';
            document.querySelector('.decoration-info-dialog__save').click();
            await expect(promise).resolves.toMatchObject({ layerSelection: { kind: 'new' } });
        });

        test('should return null when cancelled', async () => {
            const promise = dialog.show({ decoration: makeDecoration() });
            document.querySelector('.decoration-info-dialog__cancel').click();
            await expect(promise).resolves.toBeNull();
        });

        test('should close on Escape key (cancel event)', async () => {
            const promise = dialog.show({ decoration: makeDecoration() });
            const el = document.querySelector('dialog');
            el.dispatchEvent(new Event('cancel'));
            await promise;
        });

        test('should remain open when clicking the backdrop', async () => {
            const promise = dialog.show({ decoration: makeDecoration() });
            const el = document.querySelector('dialog');
            const clickEvent = new MouseEvent('click', { bubbles: false });
            Object.defineProperty(clickEvent, 'target', { value: el, writable: false });
            el.dispatchEvent(clickEvent);
            expect(el.hasAttribute('open')).toBe(true);
            document.querySelector('.decoration-info-dialog__cancel').click();
            await promise;
        });
    });

    describe('layer selection', () => {
        test('should show available layers in the combobox', () => {
            const promise = dialog.show({
                decoration: makeDecoration(),
                layers: [{ id: 'background', name: 'Background' }],
                selectedLayerId: 'background'
            });
            const layerSelect = document.querySelector('.decoration-info-dialog__layer-select');
            expect(layerSelect.value).toBe('background');
            expect(layerSelect.options[0].textContent).toBe('Background');
            document.querySelector('.decoration-info-dialog__cancel').click();
            return promise;
        });

        test('should include the current layer if it is missing from the available layers', () => {
            const promise = dialog.show({ decoration: makeDecoration(), selectedLayerId: 'missing' });
            const layerSelect = document.querySelector('.decoration-info-dialog__layer-select');
            expect(layerSelect.value).toBe('missing');
            expect(layerSelect.options[0].textContent).toBe('Layer missing');
            document.querySelector('.decoration-info-dialog__cancel').click();
            return promise;
        });
    });
});
