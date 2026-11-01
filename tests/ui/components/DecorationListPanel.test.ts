/**
 * Tests for DecorationListPanel component
 * Covers: render with visible layers, click-to-select, Ctrl+Click toggle,
 * Shift+Click range, hidden layer exclusion, layer group headers
 */
import { DecorationListPanel } from '../../../src/ui/components/DecorationListPanel.ts';
import { SelectionStore } from '../../../src/ui/stores/SelectionStore.ts';
import { EventBus } from '../../../src/ui/EventBus.ts';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Decoration } from '../../../src/domain/Decoration.ts';
import { MapType } from '../../../src/domain/MapType.ts';
import { AccountDecorationInventory } from '../../../src/domain/AccountDecorationInventory.js';
import { Layer } from '../../../src/domain/Layer.ts';
import { AppState, AppStore } from '../../../src/ui/stores/AppStore.js';
import ContextMenu from '../../../src/ui/components/ContextMenu.ts';
import AppService from '../../../src/application/AppService.ts';

function createMockAppStore(layers: Layer[] = [], mapType: MapType | null = null): AppStore {
    const listeners: Array<(state: AppState) => void> = [];
    return {
        getState: () => ({ layers, mapType } as AppState),
        listeners: listeners,
        subscribe: (fn: (state: AppState) => void) => {
            listeners.push(fn);
            return () => { listeners.splice(listeners.indexOf(fn), 1); };
        },
        _notify(state: AppState) { listeners.forEach(fn => fn(state)); }
    } as unknown as AppStore;
}

function createLayer(id: string, name: string, decorations: Decoration[] = [], isVisible: boolean = true): Layer {
    return {
        id,
        name,
        isVisible,
        decorations: new Map(decorations.map(d => [d.id, d])),
        getAllDecorations() { return Array.from(this.decorations.values()); },
        getDecorationCount() { return this.decorations.size; }
    } as Layer;
}

function createDecoration(id: string, name: string): Decoration {
    return { id, uid: id, name, position: { x: 0, y: 0 } } as Decoration;
}

describe('DecorationListPanel', () => {
    let container: HTMLElement;
    let appStore: AppStore;
    let selectionStore: SelectionStore;
    let eventBus: EventBus;

    beforeEach(() => {
        document.body.innerHTML = '';
        container = document.createElement('div');
        document.body.appendChild(container);
        eventBus = new EventBus();
        // eventBus.debugEnabled = false;
        selectionStore = new SelectionStore(eventBus);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('rendering with visible layers', () => {
        test('should display API icons before decoration names using one batched lookup', async () => {
            const iconUrl = 'https://render.guildwars2.com/icon.png';
            const apiAdapter = {
                getHomesteadDecorations: vi.fn().mockResolvedValue([{ id: 327, name: 'Kodan Dining Chair', icon: iconUrl }]),
                getGuildUpgrades: vi.fn()
            };
            const layers = [createLayer('l1', 'Layer 1', [createDecoration('327', 'Kodan Dining Chair')])];
            appStore = createMockAppStore(layers);

            new DecorationListPanel(container, appStore, selectionStore, eventBus, undefined, null, apiAdapter);

            await vi.waitFor(() => {
                expect(container.querySelector('.decoration-list__item-icon')?.getAttribute('src')).toBe(iconUrl);
            });

            const item = container.querySelector('.decoration-list__item')!;
            expect(item.querySelector('.decoration-list__item-icon-slot')?.nextElementSibling?.classList.contains('decoration-list__item-name')).toBe(true);
            expect(apiAdapter.getHomesteadDecorations).toHaveBeenCalledOnce();
            expect(apiAdapter.getHomesteadDecorations).toHaveBeenCalledWith([327], 'en');
        });

        test('should use guild upgrade icons for a loaded guild hall map', async () => {
            const iconUrl = 'https://render.guildwars2.com/guild-icon.png';
            const apiAdapter = {
                getHomesteadDecorations: vi.fn(),
                getGuildUpgrades: vi.fn().mockResolvedValue([{ id: 1174, icon: iconUrl }])
            };
            const layers = [createLayer('l1', 'Layer 1', [createDecoration('1174', 'Ice Sheet')])];
            appStore = createMockAppStore(layers, MapType.GuildHall);

            new DecorationListPanel(container, appStore, selectionStore, eventBus, undefined, null, apiAdapter);

            await vi.waitFor(() => {
                expect(container.querySelector('.decoration-list__item-icon')?.getAttribute('src')).toBe(iconUrl);
            });

            expect(apiAdapter.getGuildUpgrades).toHaveBeenCalledOnce();
            expect(apiAdapter.getGuildUpgrades).toHaveBeenCalledWith([1174]);
            expect(apiAdapter.getHomesteadDecorations).not.toHaveBeenCalled();
        });

        test('should render decorations from visible layers grouped by layer', () => {
            const layers = [
                createLayer('l1', 'Layer 1', [
                    createDecoration('d1', 'Oak Tree'),
                    createDecoration('d2', 'Bench')
                ]),
                createLayer('l2', 'Layer 2', [
                    createDecoration('d3', 'Lamp Post')
                ])
            ];
            appStore = createMockAppStore(layers);
            const panel = new DecorationListPanel(container, appStore, selectionStore, eventBus);

            const headers = container.querySelectorAll('.decoration-list__layer-header');
            expect(headers.length).toBe(2);
            expect(headers[0].textContent).toContain('Layer 1');
            expect(headers[0].textContent).toContain('2');
            expect(headers[1].textContent).toContain('Layer 2');
            expect(headers[1].textContent).toContain('1');

            const items = container.querySelectorAll('.decoration-list__item');
            expect(items.length).toBe(3);
        });

        test('should show empty state when no layers have decorations', () => {
            const layers = [createLayer('l1', 'Layer 1', [])];
            appStore = createMockAppStore(layers);
            const panel = new DecorationListPanel(container, appStore, selectionStore, eventBus);

            const items = container.querySelectorAll('.decoration-list__item');
            expect(items.length).toBe(0);
        });

        test('should re-render when AppStore state changes', () => {
            const layers = [createLayer('l1', 'Layer 1', [createDecoration('d1', 'Tree')])];
            appStore = createMockAppStore(layers);
            const panel = new DecorationListPanel(container, appStore, selectionStore, eventBus);

            expect(container.querySelectorAll('.decoration-list__item').length).toBe(1);

            // Simulate state update with more decorations
            const newLayers = [
                createLayer('l1', 'Layer 1', [
                    createDecoration('d1', 'Tree'),
                    createDecoration('d2', 'Bench')
                ])
            ];
            (appStore as AppStore & { _notify(state: AppState): void })._notify({ layers: newLayers } as AppState);

            expect(container.querySelectorAll('.decoration-list__item').length).toBe(2);
        });
    });

    describe('hidden layer exclusion', () => {
        test('should not render decorations from hidden layers', () => {
            const layers = [
                createLayer('l1', 'Layer 1', [createDecoration('d1', 'Tree')], true),
                createLayer('l2', 'Layer 2', [createDecoration('d2', 'Bush')], false)
            ];
            appStore = createMockAppStore(layers);
            const panel = new DecorationListPanel(container, appStore, selectionStore, eventBus);

            const headers = container.querySelectorAll('.decoration-list__layer-header');
            expect(headers.length).toBe(1);
            expect(headers[0].textContent).toContain('Layer 1');

            const items = container.querySelectorAll('.decoration-list__item');
            expect(items.length).toBe(1);
        });

        test('shows a check only when account inventory covers every visible instance of a decoration', () => {
            const layers = [
                createLayer('l1', 'Layer 1', [createDecoration('35', 'Oak Tree')]),
                createLayer('l2', 'Layer 2', [createDecoration('35', 'Oak Tree')])
            ];
            appStore = createMockAppStore(layers);
            const panel = new DecorationListPanel(container, appStore, selectionStore, eventBus);
            panel.setAccountInventory(new AccountDecorationInventory([{ id: 35, count: 2 }]));

            expect(container.querySelectorAll('.decoration-list__availability-check').length).toBe(2);

            panel.setAccountInventory(new AccountDecorationInventory([{ id: 35, count: 1 }]));
            expect(container.querySelectorAll('.decoration-list__availability-check').length).toBe(0);
        });

        test('does not show account inventory checks on guild hall maps', () => {
            const layers = [createLayer('l1', 'Layer 1', [createDecoration('35', 'Oak Tree')])];
            appStore = createMockAppStore(layers, MapType.GuildHall);
            const panel = new DecorationListPanel(container, appStore, selectionStore, eventBus);
            panel.setAccountInventory(new AccountDecorationInventory([{ id: 35, count: 1 }]));

            expect(container.querySelectorAll('.decoration-list__availability-check').length).toBe(0);
        });
    });

    describe('click-to-select', () => {
        test('should select a single decoration on click', () => {
            const layers = [
                createLayer('l1', 'Layer 1', [
                    createDecoration('d1', 'Tree'),
                    createDecoration('d2', 'Bench')
                ])
            ];
            appStore = createMockAppStore(layers);
            const panel = new DecorationListPanel(container, appStore, selectionStore, eventBus);

            const items = container.querySelectorAll('.decoration-list__item');
            (items[0] as HTMLElement).click();

            expect(selectionStore.isSelected('d1')).toBe(true);
            expect(selectionStore.isSelected('d2')).toBe(false);
        });

        test('should clear previous selection on plain click', () => {
            const layers = [
                createLayer('l1', 'Layer 1', [
                    createDecoration('d1', 'Tree'),
                    createDecoration('d2', 'Bench')
                ])
            ];
            appStore = createMockAppStore(layers);
            const panel = new DecorationListPanel(container, appStore, selectionStore, eventBus);

            // Select first
            const items = container.querySelectorAll('.decoration-list__item');
            (items[0] as HTMLElement).click();
            expect(selectionStore.isSelected('d1')).toBe(true);

            // Click second (should clear first)
            (items[1] as HTMLElement).click();
            expect(selectionStore.isSelected('d1')).toBe(false);
            expect(selectionStore.isSelected('d2')).toBe(true);
        });
    });

    describe('Ctrl+Click toggle', () => {
        test('should toggle decoration into selection with Ctrl+Click', () => {
            const layers = [
                createLayer('l1', 'Layer 1', [
                    createDecoration('d1', 'Tree'),
                    createDecoration('d2', 'Bench')
                ])
            ];
            appStore = createMockAppStore(layers);
            const panel = new DecorationListPanel(container, appStore, selectionStore, eventBus);

            const items = container.querySelectorAll('.decoration-list__item');

            // Select first normally
            (items[0] as HTMLElement).click();
            expect(selectionStore.getSelectionCount()).toBe(1);

            // Ctrl+Click second
            items[1].dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true }));
            expect(selectionStore.isSelected('d1')).toBe(true);
            expect(selectionStore.isSelected('d2')).toBe(true);
            expect(selectionStore.getSelectionCount()).toBe(2);
        });

        test('should toggle decoration out of selection with Ctrl+Click', () => {
            const layers = [
                createLayer('l1', 'Layer 1', [
                    createDecoration('d1', 'Tree'),
                    createDecoration('d2', 'Bench')
                ])
            ];
            appStore = createMockAppStore(layers);
            const panel = new DecorationListPanel(container, appStore, selectionStore, eventBus);

            const items = container.querySelectorAll('.decoration-list__item');

            // Select both
            (items[0] as HTMLElement).click();
            items[1].dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true }));
            expect(selectionStore.getSelectionCount()).toBe(2);

            // Ctrl+Click first to deselect
            items[0].dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true }));
            expect(selectionStore.isSelected('d1')).toBe(false);
            expect(selectionStore.isSelected('d2')).toBe(true);
        });
    });

    describe('Shift+Click range', () => {
        test('should select a range of decorations with Shift+Click', () => {
            const layers = [
                createLayer('l1', 'Layer 1', [
                    createDecoration('d1', 'Tree'),
                    createDecoration('d2', 'Bench'),
                    createDecoration('d3', 'Lamp'),
                    createDecoration('d4', 'Rock')
                ])
            ];
            appStore = createMockAppStore(layers);
            const panel = new DecorationListPanel(container, appStore, selectionStore, eventBus);

            const items = container.querySelectorAll('.decoration-list__item');

            // Click first (anchor)
            (items[0] as HTMLElement).click();
            expect(selectionStore.isSelected('d1')).toBe(true);

            // Shift+Click third
            items[2].dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));

            expect(selectionStore.isSelected('d1')).toBe(true);
            expect(selectionStore.isSelected('d2')).toBe(true);
            expect(selectionStore.isSelected('d3')).toBe(true);
            expect(selectionStore.isSelected('d4')).toBe(false);
        });

        test('should select range across layers', () => {
            const layers = [
                createLayer('l1', 'Layer 1', [
                    createDecoration('d1', 'Tree'),
                    createDecoration('d2', 'Bench')
                ]),
                createLayer('l2', 'Layer 2', [
                    createDecoration('d3', 'Lamp'),
                    createDecoration('d4', 'Rock')
                ])
            ];
            appStore = createMockAppStore(layers);
            const panel = new DecorationListPanel(container, appStore, selectionStore, eventBus);

            const items = container.querySelectorAll('.decoration-list__item');

            // Click first in layer 1
            (items[0] as HTMLElement).click();

            // Shift+Click first in layer 2
            items[2].dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));

            expect(selectionStore.isSelected('d1')).toBe(true);
            expect(selectionStore.isSelected('d2')).toBe(true);
            expect(selectionStore.isSelected('d3')).toBe(true);
            expect(selectionStore.isSelected('d4')).toBe(false);
        });
    });

    describe('layer group headers', () => {
        test('should show layer name and decoration count in headers', () => {
            const layers = [
                createLayer('l1', 'My Trees', [
                    createDecoration('d1', 'Oak'),
                    createDecoration('d2', 'Birch'),
                    createDecoration('d3', 'Pine')
                ])
            ];
            appStore = createMockAppStore(layers);
            const panel = new DecorationListPanel(container, appStore, selectionStore, eventBus);

            const header = container.querySelector('.decoration-list__layer-header');
            expect(header!.textContent).toContain('My Trees');
            expect(header!.textContent).toContain('3');
        });
    });

    describe('selection highlight', () => {
        test('should add selected class to selected items', () => {
            const layers = [
                createLayer('l1', 'Layer 1', [
                    createDecoration('d1', 'Tree'),
                    createDecoration('d2', 'Bench')
                ])
            ];
            appStore = createMockAppStore(layers);
            const panel = new DecorationListPanel(container, appStore, selectionStore, eventBus);

            const items = container.querySelectorAll('.decoration-list__item');
            (items[0] as HTMLElement).click();

            // Re-query after potential re-render
            const updatedItems = container.querySelectorAll('.decoration-list__item');
            expect(updatedItems[0].classList.contains('selected')).toBe(true);
            expect(updatedItems[1].classList.contains('selected')).toBe(false);
        });
    });

    describe('decoration item attributes', () => {
        test('should set data-decoration-id on each item', () => {
            const layers = [
                createLayer('l1', 'Layer 1', [createDecoration('d1', 'Tree')])
            ];
            appStore = createMockAppStore(layers);
            const panel = new DecorationListPanel(container, appStore, selectionStore, eventBus);

            const item = container.querySelector('.decoration-list__item');
            expect(item!.getAttribute('data-decoration-id')).toBe('d1');
        });

        test('should display decoration name', () => {
            const layers = [
                createLayer('l1', 'Layer 1', [createDecoration('d1', 'Oak Tree')])
            ];
            appStore = createMockAppStore(layers);
            const panel = new DecorationListPanel(container, appStore, selectionStore, eventBus);

            const item = container.querySelector('.decoration-list__item');
            expect(item!.textContent).toContain('Oak Tree');
        });
    });

    describe('layer header context menu', () => {
        let contextMenu: ContextMenu;
        let shownItems: Parameters<ContextMenu['show']>[2];
        let appService: AppService;

        beforeEach(() => {
            shownItems = [];
            contextMenu = { show: (x, y, items: Parameters<ContextMenu['show']>[2]) => { shownItems = items; } } as ContextMenu;
            appService = { execute: vi.fn() } as unknown as AppService;
            selectionStore.setActiveLayer = vi.fn();
            selectionStore.selectAll = vi.fn();
        });

        function setupPanel(layers: Layer[]): DecorationListPanel {
            appStore = createMockAppStore(layers);
            const panel = new DecorationListPanel(container, appStore, selectionStore, eventBus, appService);
            panel._contextMenu = contextMenu;
            return panel;
        }

        function triggerHeaderContextMenu(layers: Layer[]) {
            setupPanel(layers);
            const header = container.querySelector('.decoration-list__layer-header');
            header!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 }));
            return shownItems;
        }

        test('right-click on layer header shows context menu', () => {
            const layers = [
                createLayer('l1', 'Layer 1', [createDecoration('d1', 'Tree')])
            ];
            const items = triggerHeaderContextMenu(layers);
            expect(items).not.toBeNull();
        });

        test('context menu includes "Select All" item with decoration count', () => {
            const layers = [
                createLayer('l1', 'Layer 1', [createDecoration('d1', 'Tree'), createDecoration('d2', 'Bench')])
            ];
            const items = triggerHeaderContextMenu(layers);
            const selectAll = items.find(i => i.label.startsWith('Select All'))!;
            expect(selectAll).toBeDefined();
            expect(selectAll.label).toContain('2');
        });

        test('"Select All" is disabled when layer has no decorations', () => {
            // Layers with 0 decorations render no header (panel skips empty layers),
            // so use a layer with decorations but verify the disabled state logic directly
            const layers = [
                createLayer('l1', 'Layer 1', [createDecoration('d1', 'Tree')])
            ];
            appStore = createMockAppStore(layers);
            const panel = new DecorationListPanel(container, appStore, selectionStore, eventBus, appService);
            panel._contextMenu = contextMenu;

            // Invoke handler directly with an empty layer
            const emptyLayer = createLayer('l2', 'Empty Layer', []);
            const fakeEvent = { preventDefault: vi.fn(), clientX: 0, clientY: 0 } as unknown as MouseEvent;
            panel._handleLayerHeaderContextMenu(emptyLayer, fakeEvent);

            const selectAll = shownItems.find(i => i.label.startsWith('Select All'))!;
            expect(selectAll.disabled).toBe(true);
        });

        test('"Select All" action calls selectionStore.selectAll with layer decoration UIDs', () => {
            const layers = [
                createLayer('l1', 'Layer 1', [createDecoration('d1', 'Tree'), createDecoration('d2', 'Bench')])
            ];
            const items = triggerHeaderContextMenu(layers);
            const selectAll = items.find(i => i.label.startsWith('Select All'))!;
            selectAll.action!();
            expect(selectionStore.selectAll).toHaveBeenCalledWith(['d1', 'd2']);
        });

        test('context menu sets the right-clicked layer as active', () => {
            const layers = [
                createLayer('l1', 'Layer 1', [createDecoration('d1', 'Tree')])
            ];
            triggerHeaderContextMenu(layers);
            expect(selectionStore.setActiveLayer).toHaveBeenCalledWith('l1');
        });

        test('context menu includes "Merge to..." item', () => {
            const layers = [
                createLayer('l1', 'Layer 1', [createDecoration('d1', 'Tree')]),
                createLayer('l2', 'Layer 2', [createDecoration('d2', 'Bench')])
            ];
            const items = triggerHeaderContextMenu(layers);
            const mergeItem = items.find(i => i.label.startsWith('Merge to'))!;
            expect(mergeItem).toBeDefined();
        });

        test('"Merge to..." submenu lists other layers', () => {
            const layers = [
                createLayer('l1', 'Layer 1', [createDecoration('d1', 'Tree')]),
                createLayer('l2', 'Layer 2', [createDecoration('d2', 'Bench')]),
                createLayer('l3', 'Layer 3', [createDecoration('d3', 'Rock')])
            ];
            const items = triggerHeaderContextMenu(layers);
            const mergeItem = items.find(i => i.label.startsWith('Merge to'))!;
            expect(mergeItem.submenu).toHaveLength(2);
            expect(mergeItem.submenu![0].label).toBe('Layer 2');
            expect(mergeItem.submenu![1].label).toBe('Layer 3');
        });

        test('"Merge to..." is disabled when no other layers exist', () => {
            const layers = [
                createLayer('l1', 'Layer 1', [createDecoration('d1', 'Tree')])
            ];
            const items = triggerHeaderContextMenu(layers);
            const mergeItem = items.find(i => i.label.startsWith('Merge to'))!;
            expect(mergeItem.disabled).toBe(true);
        });

        test('"Merge to..." submenu action calls _confirmAndMergeLayer', () => {
            const layers = [
                createLayer('l1', 'Layer 1', [createDecoration('d1', 'Tree')]),
                createLayer('l2', 'Layer 2', [createDecoration('d2', 'Bench')])
            ];
            appStore = createMockAppStore(layers);
            const panel = new DecorationListPanel(container, appStore, selectionStore, eventBus, appService);
            panel._contextMenu = contextMenu;
            panel._confirmAndMergeLayer = vi.fn().mockResolvedValue(undefined);

            const header = container.querySelector('.decoration-list__layer-header');
            header!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

            const mergeItem = shownItems.find(i => i.label.startsWith('Merge to'))!;
            mergeItem.submenu![0].action!();
            expect(panel._confirmAndMergeLayer).toHaveBeenCalled();
        });
    });
});
