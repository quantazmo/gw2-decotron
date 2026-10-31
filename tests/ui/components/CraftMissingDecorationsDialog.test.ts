/**
 * Tests for CraftMissingDecorationsDialog component
 * Covers: dialog structure, visible-only layer filtering, decoration counts, Cancel button closes.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { CraftMissingDecorationsDialog } from '../../../src/ui/components/CraftMissingDecorationsDialog.js';

function makeLayer(id, name, isVisible, decorations) {
    // decorations can be a count (number) or an array of { id, name } objects
    let decorationList;
    if (typeof decorations === 'number') {
        decorationList = [];
        for (let i = 0; i < decorations; i++) {
            decorationList.push({ id: `${id}-d${i}`, name: `Decoration ${i}` });
        }
    } else {
        decorationList = decorations;
    }
    return {
        id,
        name,
        isVisible,
        getAllDecorations: () => decorationList,
    };
}

function makeInventory(entries) {
    // entries: Array<{ id: number, count: number }>
    return {
        getCount: (id) => {
            const entry = entries.find(e => e.id === Number(id));
            return entry ? entry.count : 0;
        }
    };
}

describe('CraftMissingDecorationsDialog', () => {
    let dialog;

    beforeEach(() => {
        document.body.innerHTML = '';
        dialog = new CraftMissingDecorationsDialog();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    // ── constructor ──────────────────────────────────────────────────────────

    describe('constructor', () => {
        test('appends a <dialog> element to the DOM', () => {
            expect(document.querySelector('dialog.craft-missing-decorations-dialog')).not.toBeNull();
        });

        test('dialog has role="dialog"', () => {
            const el = document.querySelector('dialog.craft-missing-decorations-dialog');
            expect(el.getAttribute('role')).toBe('dialog');
        });

        test('dialog has aria-modal="true"', () => {
            const el = document.querySelector('dialog.craft-missing-decorations-dialog');
            expect(el.getAttribute('aria-modal')).toBe('true');
        });
    });

    // ── show() ───────────────────────────────────────────────────────────────

    describe('show()', () => {
        test('returns a Promise', () => {
            const layers = [makeLayer('l1', 'Layer 1', true, 3)];
            const result = dialog.show('Gilded Hollow', layers);
            expect(result).toBeInstanceOf(Promise);
            // cleanup
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            return result;
        });

        test('displays the map name in the dialog', async () => {
            const layers = [makeLayer('l1', 'Layer 1', true, 2)];
            const p = dialog.show('Gilded Hollow', layers);
            const mapEl = document.querySelector('.craft-missing-decorations-dialog__map-name');
            expect(mapEl).not.toBeNull();
            expect(mapEl.textContent).toContain('Gilded Hollow');
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });

        test('lists only visible layers', async () => {
            const layers = [
                makeLayer('l1', 'Visible Layer', true, 5),
                makeLayer('l2', 'Hidden Layer', false, 3),
                makeLayer('l3', 'Also Visible', true, 1),
            ];
            const p = dialog.show('Windswept Haven', layers);
            const rows = document.querySelectorAll('.craft-missing-decorations-dialog__layer-row');
            expect(rows.length).toBe(2);
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });

        test('shows correct decoration count for each visible layer', async () => {
            const layers = [
                makeLayer('l1', 'Alpha', true, 7),
                makeLayer('l2', 'Beta', true, 0),
            ];
            const p = dialog.show('Gilded Hollow', layers);
            const rows = document.querySelectorAll('.craft-missing-decorations-dialog__layer-row');
            expect(rows[0].textContent).toContain('Alpha');
            expect(rows[0].textContent).toContain('7');
            expect(rows[1].textContent).toContain('Beta');
            expect(rows[1].textContent).toContain('0');
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });

        test('uses singular "decoration" for count of 1', async () => {
            const layers = [makeLayer('l1', 'Solo', true, 1)];
            const p = dialog.show('Gilded Hollow', layers);
            const row = document.querySelector('.craft-missing-decorations-dialog__layer-row');
            expect(row.textContent).toContain('1 decoration');
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });

        test('uses plural "decorations" for count of 0', async () => {
            const layers = [makeLayer('l1', 'Empty', true, 0)];
            const p = dialog.show('Gilded Hollow', layers);
            const row = document.querySelector('.craft-missing-decorations-dialog__layer-row');
            expect(row.textContent).toContain('0 decorations');
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });

        test('uses plural "decorations" for count > 1', async () => {
            const layers = [makeLayer('l1', 'Many', true, 5)];
            const p = dialog.show('Gilded Hollow', layers);
            const row = document.querySelector('.craft-missing-decorations-dialog__layer-row');
            expect(row.textContent).toContain('5 decorations');
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });

        test('shows message when no visible layers', async () => {
            const layers = [makeLayer('l1', 'Hidden', false, 3)];
            const p = dialog.show('Gilded Hollow', layers);
            const emptyMsg = document.querySelector('.craft-missing-decorations-dialog__empty-msg');
            expect(emptyMsg).not.toBeNull();
            expect(emptyMsg.hidden).toBe(false);
            const rows = document.querySelectorAll('.craft-missing-decorations-dialog__layer-row');
            expect(rows.length).toBe(0);
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });

        test('hides empty message when there are visible layers', async () => {
            const layers = [makeLayer('l1', 'Visible', true, 2)];
            const p = dialog.show('Gilded Hollow', layers);
            const emptyMsg = document.querySelector('.craft-missing-decorations-dialog__empty-msg');
            expect(emptyMsg.hidden).toBe(true);
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });
    });

    // ── Craft button ─────────────────────────────────────────────────────────

    describe('Craft button', () => {
        test('appears to the left of Cancel in the dialog actions', async () => {
            const p = dialog.show('Gilded Hollow', []);
            const actions = document.querySelector('.craft-missing-decorations-dialog__actions');
            const buttons = actions.querySelectorAll('button');

            expect(buttons[0].textContent).toBe('Craft');
            expect(buttons[1].textContent).toBe('Cancel');
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });

        test('closes the dialog when clicked', async () => {
            const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
            const layers = [makeLayer('l1', 'Layer 1', true, [{ id: '955', name: 'Decoration' }])];
            const p = dialog.show('Gilded Hollow', layers, makeInventory([]));
            const craftBtn = document.querySelector('.craft-missing-decorations-dialog__craft');

            craftBtn.click();
            await p;

            expect(document.querySelector('dialog.craft-missing-decorations-dialog').hasAttribute('open')).toBe(false);
            openSpy.mockRestore();
        });

        test('opens GW2Efficiency with the selected decoration quantities', async () => {
            const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
            const layers = [makeLayer('l1', 'Layer 1', true, [
                { id: '955', name: 'A Decoration' },
                { id: '139', name: 'B Decoration' },
                { id: '139', name: 'B Decoration' },
            ])];
            const p = dialog.show('Gilded Hollow', layers, makeInventory([]));

            document.querySelector('.craft-missing-decorations-dialog__craft').click();

            expect(openSpy).toHaveBeenCalledWith(
                'https://gw2efficiency.com/crafting/calculator/a~0!b~1!c~0!d~1-2001000000955;2-2001000000139!e~0!f~1',
                '_blank',
                'noopener,noreferrer'
            );
            await p;
            openSpy.mockRestore();
        });

        test('omits unchecked decorations from the crafting calculator URL', async () => {
            const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
            const layers = [makeLayer('l1', 'Layer 1', true, [
                { id: '955', name: 'A Decoration' },
                { id: '139', name: 'B Decoration' },
            ])];
            const p = dialog.show('Gilded Hollow', layers, makeInventory([]));
            document.querySelectorAll('.craft-missing-decorations-dialog__missing-checkbox')[1].click();

            document.querySelector('.craft-missing-decorations-dialog__craft').click();

            expect(openSpy).toHaveBeenCalledWith(
                'https://gw2efficiency.com/crafting/calculator/a~0!b~1!c~0!d~1-2001000000955!e~0!f~1',
                '_blank',
                'noopener,noreferrer'
            );
            await p;
            openSpy.mockRestore();
        });

        test('disables Craft when no missing decorations are selected', async () => {
            const layers = [makeLayer('l1', 'Layer 1', true, [
                { id: '955', name: 'A Decoration' },
            ])];
            const p = dialog.show('Gilded Hollow', layers, makeInventory([]));
            const selectAll = document.querySelector('.craft-missing-decorations-dialog__select-all input');
            const craftBtn = document.querySelector('.craft-missing-decorations-dialog__craft');

            selectAll.click();
            expect(craftBtn.disabled).toBe(true);
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });
    });

    // ── Cancel button ────────────────────────────────────────────────────────────

    describe('Cancel button', () => {
        test('Cancel button is present in the dialog', async () => {
            const p = dialog.show('Gilded Hollow', []);
            const cancelBtn = document.querySelector('.craft-missing-decorations-dialog__cancel');
            expect(cancelBtn).not.toBeNull();
            cancelBtn.click();
            await p;
        });

        test('Cancel button resolves the Promise', async () => {
            const p = dialog.show('Gilded Hollow', []);
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await expect(p).resolves.toBeUndefined();
        });

        test('Cancel button closes the dialog', async () => {
            const p = dialog.show('Gilded Hollow', []);
            const el = document.querySelector('dialog.craft-missing-decorations-dialog');
            // jsdom may not implement dialog.close(); polyfill for the test
            if (!el.close) el.close = vi.fn();
            else vi.spyOn(el, 'close');
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
            // Either close() was called or the open attribute was removed
            const wasClosed = typeof el.close === 'function'
                ? (el.close.mock?.calls.length > 0 || !el.hasAttribute('open'))
                : !el.hasAttribute('open');
            expect(wasClosed).toBe(true);
        });
    });

    // ── title ────────────────────────────────────────────────────────────────

    describe('title', () => {
        test('dialog has a title element with "Craft Missing Decorations" text', async () => {
            const p = dialog.show('Gilded Hollow', []);
            const title = document.querySelector('.craft-missing-decorations-dialog__title');
            expect(title).not.toBeNull();
            expect(title.textContent).toBe('Craft Missing Decorations');
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });
    });

    // ── missing decorations ──────────────────────────────────────────────────

    describe('missing decorations (account inventory)', () => {
        test('does not report missing decorations when inventory status is unknown', async () => {
            const layers = [makeLayer('l1', 'Layer 1', true, [{ id: '35', name: 'Pot' }])];
            const p = dialog.show('Gilded Hollow', layers);
            const section = document.querySelector('.craft-missing-decorations-dialog__missing-section');
            expect(section).toBeNull();
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });

        test('treats all visible decorations as missing when inventory is empty', async () => {
            const layers = [makeLayer('l1', 'Layer 1', true, [{ id: '35', name: 'Pot' }])];
            const p = dialog.show('Gilded Hollow', layers, makeInventory([]));
            const section = document.querySelector('.craft-missing-decorations-dialog__missing-section');
            const items = document.querySelectorAll('.craft-missing-decorations-dialog__missing-item');

            expect(section).not.toBeNull();
            expect(items.length).toBe(1);
            expect(items[0].textContent).toContain('Pot');
            expect(document.querySelector('.craft-missing-decorations-dialog__craft').disabled).toBe(false);
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });

        test('renders no missing section when all visible decorations are owned', async () => {
            const layers = [makeLayer('l1', 'Layer 1', true, [{ id: '35', name: 'Pot' }])];
            const inventory = makeInventory([{ id: 35, count: 5 }]);
            const p = dialog.show('Gilded Hollow', layers, inventory);
            const section = document.querySelector('.craft-missing-decorations-dialog__missing-section');
            expect(section).toBeNull();
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });

        test('renders a missing section when some visible decorations have count 0', async () => {
            const layers = [
                makeLayer('l1', 'Layer 1', true, [
                    { id: '35', name: 'Pot' },
                    { id: '70', name: 'Bench' },
                ]),
            ];
            const inventory = makeInventory([{ id: 35, count: 5 }]); // 70 is missing
            const p = dialog.show('Gilded Hollow', layers, inventory);
            const section = document.querySelector('.craft-missing-decorations-dialog__missing-section');
            expect(section).not.toBeNull();
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });

        test('lists each missing decoration by name', async () => {
            const layers = [
                makeLayer('l1', 'Layer 1', true, [
                    { id: '35', name: 'Pot' },
                    { id: '70', name: 'Bench' },
                ]),
            ];
            const inventory = makeInventory([{ id: 35, count: 5 }]); // 70 missing
            const p = dialog.show('Gilded Hollow', layers, inventory);
            const items = document.querySelectorAll('.craft-missing-decorations-dialog__missing-item');
            expect(items.length).toBe(1);
            expect(items[0].textContent).toContain('Bench');
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });

        test('deduplicates missing decorations by id across layers', async () => {
            const layers = [
                makeLayer('l1', 'Layer 1', true, [{ id: '70', name: 'Bench' }]),
                makeLayer('l2', 'Layer 2', true, [{ id: '70', name: 'Bench' }]),
            ];
            const inventory = makeInventory([]); // nothing owned
            const p = dialog.show('Gilded Hollow', layers, inventory);
            const items = document.querySelectorAll('.craft-missing-decorations-dialog__missing-item');
            expect(items.length).toBe(1);
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });

        test('ignores decorations from hidden layers when computing missing', async () => {
            const layers = [
                makeLayer('l1', 'Visible', true, [{ id: '35', name: 'Pot' }]),
                makeLayer('l2', 'Hidden', false, [{ id: '70', name: 'Bench' }]),
            ];
            const inventory = makeInventory([]); // nothing owned
            const p = dialog.show('Gilded Hollow', layers, inventory);
            const items = document.querySelectorAll('.craft-missing-decorations-dialog__missing-item');
            // Only decoration 35 (from visible layer) should be listed
            expect(items.length).toBe(1);
            expect(items[0].textContent).toContain('Pot');
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });

        test('shows quantity needed for each missing decoration type', async () => {
            const layers = [
                makeLayer('l1', 'Layer 1', true, [{ id: '70', name: 'Bench' }]),
                makeLayer('l2', 'Layer 2', true, [{ id: '70', name: 'Bench' }]),
                makeLayer('l3', 'Layer 3', true, [{ id: '70', name: 'Bench' }]),
            ];
            const inventory = makeInventory([]);
            const p = dialog.show('Gilded Hollow', layers, inventory);
            const items = document.querySelectorAll('.craft-missing-decorations-dialog__missing-item');
            expect(items.length).toBe(1);
            expect(items[0].textContent).toContain('3');
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });

        test('sorts missing decorations alphabetically by name', async () => {
            const layers = [
                makeLayer('l1', 'Layer 1', true, [
                    { id: '70', name: 'Zzz Chair' },
                    { id: '35', name: 'Aaa Bench' },
                    { id: '125', name: 'Mmm Table' },
                ]),
            ];
            const inventory = makeInventory([]);
            const p = dialog.show('Gilded Hollow', layers, inventory);
            const items = document.querySelectorAll('.craft-missing-decorations-dialog__missing-item');
            expect(items.length).toBe(3);
            expect(items[0].textContent).toContain('Aaa Bench');
            expect(items[1].textContent).toContain('Mmm Table');
            expect(items[2].textContent).toContain('Zzz Chair');
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });

        test('wraps items in a scrollable list container', async () => {
            const layers = [
                makeLayer('l1', 'Layer 1', true, [{ id: '70', name: 'Bench' }]),
            ];
            const inventory = makeInventory([]);
            const p = dialog.show('Gilded Hollow', layers, inventory);
            const list = document.querySelector('.craft-missing-decorations-dialog__missing-list');
            expect(list).not.toBeNull();
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });

        test('selects all missing decorations by default', async () => {
            const layers = [
                makeLayer('l1', 'Layer 1', true, [
                    { id: '70', name: 'Bench' },
                    { id: '35', name: 'Pot' },
                ]),
            ];
            const p = dialog.show('Gilded Hollow', layers, makeInventory([]));
            const selectAll = document.querySelector('.craft-missing-decorations-dialog__select-all input');
            const items = document.querySelectorAll('.craft-missing-decorations-dialog__missing-checkbox');

            expect(selectAll.checked).toBe(true);
            expect(items.length).toBe(2);
            expect(Array.from(items).every(item => item.checked)).toBe(true);
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });

        test('select-all checkbox selects and deselects every missing decoration', async () => {
            const layers = [
                makeLayer('l1', 'Layer 1', true, [
                    { id: '70', name: 'Bench' },
                    { id: '35', name: 'Pot' },
                ]),
            ];
            const p = dialog.show('Gilded Hollow', layers, makeInventory([]));
            const selectAll = document.querySelector('.craft-missing-decorations-dialog__select-all input');
            const items = document.querySelectorAll('.craft-missing-decorations-dialog__missing-checkbox');

            selectAll.click();
            expect(Array.from(items).every(item => !item.checked)).toBe(true);
            selectAll.click();
            expect(Array.from(items).every(item => item.checked)).toBe(true);
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });

        test('select-all checkbox becomes indeterminate when only some decorations are selected', async () => {
            const layers = [
                makeLayer('l1', 'Layer 1', true, [
                    { id: '70', name: 'Bench' },
                    { id: '35', name: 'Pot' },
                ]),
            ];
            const p = dialog.show('Gilded Hollow', layers, makeInventory([]));
            const selectAll = document.querySelector('.craft-missing-decorations-dialog__select-all input');
            const items = document.querySelectorAll('.craft-missing-decorations-dialog__missing-checkbox');

            items[0].click();
            expect(selectAll.checked).toBe(false);
            expect(selectAll.indeterminate).toBe(true);
            document.querySelector('.craft-missing-decorations-dialog__cancel').click();
            await p;
        });
    });
});
