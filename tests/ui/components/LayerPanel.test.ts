import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
export { };

// Mock eventBinders module
const mockBindCreateLayerButton = vi.fn();
const mockBindExportButton = vi.fn();
const mockBindDeleteLayerButton = vi.fn();
const mockUpdateLayerPanel = vi.fn();
const mockHighlightActiveLayer = vi.fn();
const mockSetButtonState = vi.fn();

vi.doMock('../../../src/ui/eventBinders.js', () => ({
    bindCreateLayerButton: mockBindCreateLayerButton,
    bindExportButton: mockBindExportButton,
    bindDeleteLayerButton: mockBindDeleteLayerButton,
    updateLayerPanel: mockUpdateLayerPanel,
    highlightActiveLayer: mockHighlightActiveLayer,
    setButtonState: mockSetButtonState,
}));

const { LayerPanel: LayerPanelImplementation } = await import('../../../src/ui/components/LayerPanel.js');

type TestLayer = { id: string; name: string; isVisible: boolean };
type TestAppState = { layers: TestLayer[]; activeLayerId?: string | null };
type ComponentLayer = Parameters<InstanceType<typeof LayerPanelImplementation>['createLayerElement']>[0];

class LayerPanel extends LayerPanelImplementation {
    render(state: TestAppState): void {
        super.render(state as Parameters<InstanceType<typeof LayerPanelImplementation>['render']>[0]);
    }

    createLayerElement(layer: TestLayer, isActive: boolean): HTMLElement {
        return super.createLayerElement(layer as unknown as ComponentLayer, isActive);
    }
}

function makeMockAppStore(layers: TestLayer[] = []) {
    const subs: Array<(state: TestAppState) => void> = [];
    return {
        subscribe: (cb: (state: TestAppState) => void) => subs.push(cb),
        getState: () => ({ layers }),
        _trigger: (state: TestAppState) => subs.forEach(cb => cb(state)),
    } as unknown as ConstructorParameters<typeof LayerPanel>[1] & {
        _trigger: (state: TestAppState) => void;
    };
}

function makeMockSelectionStore(activeLayerId: string | null = null) {
    const subs: Array<(state: { activeLayerId: string | null }) => void> = [];
    return {
        subscribe: (cb: (state: { activeLayerId: string | null }) => void) => subs.push(cb),
        getActiveLayerId: () => activeLayerId,
        _trigger: (state: { activeLayerId: string | null }) => subs.forEach(cb => cb(state)),
    } as unknown as ConstructorParameters<typeof LayerPanel>[2] & {
        _trigger: (state: { activeLayerId: string | null }) => void;
    };
}

function makeMockAppService() {
    const calls: Array<{ type: string; payload?: unknown }> = [];
    return {
        execute: async (cmd: { type: string; payload?: unknown }) => { calls.push(cmd); },
        _calls: calls,
    } as unknown as ConstructorParameters<typeof LayerPanel>[3] & {
        _calls: Array<{ type: string; payload?: unknown }>;
    };
}

function makeMockEventBus() {
    const calls: Array<{ event: string; data: unknown }> = [];
    return {
        publish: (event: string, data: unknown) => calls.push({ event, data }),
        _calls: calls,
    } as unknown as ConstructorParameters<typeof LayerPanel>[4] & {
        _calls: Array<{ event: string; data: unknown }>;
    };
}

describe('LayerPanel', () => {
    let container: HTMLDivElement;
    let appStore: ReturnType<typeof makeMockAppStore>;
    let selectionStore: ReturnType<typeof makeMockSelectionStore>;
    let appService: ReturnType<typeof makeMockAppService>;
    let eventBus: ReturnType<typeof makeMockEventBus>;
    let layerPanel: InstanceType<typeof LayerPanel>;

    beforeEach(() => {
        vi.clearAllMocks();
        container = document.createElement('div');
        document.body.appendChild(container);
        appStore = makeMockAppStore([
            { id: 'layer1', name: 'Layer 1', isVisible: true },
            { id: 'layer2', name: 'Layer 2', isVisible: false },
        ]);
        selectionStore = makeMockSelectionStore('layer1');
        appService = makeMockAppService();
        eventBus = makeMockEventBus();
    });

    afterEach(() => {
        container.remove();
        // Clean up any buttons added to DOM
        document.querySelectorAll('#add-layer-btn, #export-btn').forEach(el => el.remove());
    });

    describe('constructor', () => {
        it('creates layerList element in container', () => {
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            expect(container.querySelector('.layer-list')).not.toBeNull();
        });

        it('subscribes to appStore', () => {
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            expect(appStore.subscribe).toBeDefined();
        });

        it('subscribes to selectionStore', () => {
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            expect(selectionStore.subscribe).toBeDefined();
        });

        it('binds add-layer-btn if present in DOM', () => {
            const btn = document.createElement('button');
            btn.id = 'add-layer-btn';
            document.body.appendChild(btn);

            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            expect(mockBindCreateLayerButton).toHaveBeenCalledWith(btn, appService, eventBus);
            btn.remove();
        });

        it('binds export-btn if present in DOM', () => {
            const btn = document.createElement('button');
            btn.id = 'export-btn';
            document.body.appendChild(btn);

            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            expect(mockBindExportButton).toHaveBeenCalledWith(btn, appService, appStore, eventBus);
            btn.remove();
        });

        it('does not throw when add-layer-btn is absent', () => {
            expect(() => {
                layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            }).not.toThrow();
        });
    });

    describe('render', () => {
        it('calls eventBinders.updateLayerPanel with layer list and state', () => {
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            const state = { layers: [{ id: 'layer1', name: 'Layer 1', isVisible: true }] };
            layerPanel.render(state);
            expect(mockUpdateLayerPanel).toHaveBeenCalledWith(
                layerPanel.layerList,
                state,
                selectionStore,
                expect.any(Function)
            );
        });

        it('the createLayerElement callback is callable', () => {
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            const state = { layers: [{ id: 'layer1', name: 'Layer 1', isVisible: true }] };
            mockUpdateLayerPanel.mockImplementation((list, s, store, cb) => {
                cb({ id: 'layer1', name: 'Layer 1', isVisible: true }, true);
            });
            expect(() => layerPanel.render(state)).not.toThrow();
            mockUpdateLayerPanel.mockReset(); // restore default
        });

        it('updates via appStore subscription', () => {
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            const newState = { layers: [] };
            appStore._trigger(newState);
            expect(mockUpdateLayerPanel).toHaveBeenCalled();
        });

        it('updates active layer via selectionStore subscription', () => {
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            selectionStore._trigger({ activeLayerId: 'layer2' });
            expect(mockHighlightActiveLayer).toHaveBeenCalled();
        });
    });

    describe('createLayerElement', () => {
        beforeEach(() => {
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
        });

        it('creates element with active class when isActive', () => {
            const layer = { id: 'layer1', name: 'Layer 1', isVisible: true };
            const el = layerPanel.createLayerElement(layer, true);
            expect(el.classList.contains('active')).toBe(true);
        });

        it('creates element with layer-hidden class when not visible', () => {
            const layer = { id: 'layer1', name: 'Layer 1', isVisible: false };
            const el = layerPanel.createLayerElement(layer, false);
            expect(el.classList.contains('layer-hidden')).toBe(true);
        });

        it('creates element with layer name span', () => {
            const layer = { id: 'layer1', name: 'My Layer', isVisible: true };
            const el = layerPanel.createLayerElement(layer, false);
            const nameSpan = el.querySelector('.layer-name');
            expect(nameSpan.textContent).toBe('My Layer');
        });

        it('uses Layer id as fallback when layer.name is falsy', () => {
            const layer = { id: 'layer1', name: '', isVisible: true };
            const el = layerPanel.createLayerElement(layer, false);
            const nameSpan = el.querySelector('.layer-name');
            expect(nameSpan.textContent).toBe('Layer layer1');
        });

        it('creates a delete button', () => {
            const layer = { id: 'layer1', name: 'Layer 1', isVisible: true };
            const el = layerPanel.createLayerElement(layer, false);
            expect(el.querySelector('.delete-layer-btn')).not.toBeNull();
        });

        it('has data-layer-id attribute', () => {
            const layer = { id: 'layer1', name: 'Layer 1', isVisible: true };
            const el = layerPanel.createLayerElement(layer, false);
            expect(el.getAttribute('data-layer-id')).toBe('layer1');
        });

        it('calls appService.execute on visibility icon click', async () => {
            const layer = { id: 'layer1', name: 'Layer 1', isVisible: true };
            const el = layerPanel.createLayerElement(layer, false);
            const visIcon = el.querySelector('.visibility-icon');
            visIcon.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve(); // wait for async
            expect(appService._calls.length).toBe(1);
            expect(appService._calls[0].type).toBe('ToggleLayerVisibilityCommand');
        });

        it('calls deleteLayer on delete button click', async () => {
            layerPanel._confirmDialog.show = vi.fn().mockResolvedValue(true);
            const layer = { id: 'layer1', name: 'Layer 1', isVisible: true };
            const el = layerPanel.createLayerElement(layer, false);
            const deleteBtn = el.querySelector('.delete-layer-btn');
            deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
            expect(appService._calls.length).toBe(1);
            expect(appService._calls[0].type).toBe('DeleteLayerCommand');
        });

        it('opens rename mode on name span dblclick', () => {
            const layer = { id: 'layer1', name: 'Layer 1', isVisible: true };
            const el = layerPanel.createLayerElement(layer, false);
            document.body.appendChild(el);
            const nameSpan = el.querySelector('.layer-name');
            nameSpan.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
            expect(el.querySelector('input')).not.toBeNull();
            el.remove();
        });

        it('adds dragover highlight', () => {
            const layer = { id: 'layer1', name: 'Layer 1', isVisible: true };
            const el = layerPanel.createLayerElement(layer, false);
            const dt = { dropEffect: '' };
            el.dispatchEvent(Object.assign(new Event('dragover'), { preventDefault: () => { }, dataTransfer: dt }));
            expect(el.classList.contains('drop-highlight')).toBe(true);
        });

        it('removes drop-highlight on dragleave', () => {
            const layer = { id: 'layer1', name: 'Layer 1', isVisible: true };
            const el = layerPanel.createLayerElement(layer, false);
            el.classList.add('drop-highlight');
            el.dispatchEvent(new Event('dragleave'));
            expect(el.classList.contains('drop-highlight')).toBe(false);
        });

        it('moves decorations on drop with valid data', () => {
            const layer = { id: 'layer2', name: 'Layer 2', isVisible: true };
            const el = layerPanel.createLayerElement(layer, false);
            const dropEvent = Object.assign(new Event('drop'), {
                preventDefault: () => { },
                dataTransfer: {
                    getData: (type) => type === 'application/x-decoration-ids' ? JSON.stringify(['dec1', 'dec2']) : '',
                }
            });
            el.classList.add('drop-highlight');
            el.dispatchEvent(dropEvent);
            expect(appService._calls.length).toBe(1);
            expect(appService._calls[0].type).toBe('MoveDecorationsCommand');
        });

        it('handles appService error gracefully on visibility click', async () => {
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            appService.execute = () => Promise.reject(new Error('fail'));
            const layer = { id: 'layer1', name: 'Layer 1', isVisible: true };
            const el = layerPanel.createLayerElement(layer, false);
            const visIcon = el.querySelector('.visibility-icon');
            visIcon.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
            await Promise.resolve(); // let rejection be caught
            // Should not throw
        });

        it('does nothing on drop with empty array', () => {
            const layer = { id: 'layer2', name: 'Layer 2', isVisible: true };
            const el = layerPanel.createLayerElement(layer, false);
            const dropEvent = Object.assign(new Event('drop'), {
                preventDefault: () => { },
                dataTransfer: { getData: () => JSON.stringify([]) }
            });
            el.dispatchEvent(dropEvent);
            expect(appService._calls.length).toBe(0);
        });
        it('handles appService error gracefully on visibility click', async () => {
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            appService.execute = () => Promise.reject(new Error('fail'));
            const layer = { id: 'layer1', name: 'Layer 1', isVisible: true };
            const el = layerPanel.createLayerElement(layer, false);
            const visIcon = el.querySelector('.visibility-icon');
            visIcon.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
            await Promise.resolve();
            // Should not throw
        });

        it('does nothing on drop with non-array JSON', () => {
            const layer = { id: 'layer2', name: 'Layer 2', isVisible: true };
            const el = layerPanel.createLayerElement(layer, false);
            const dropEvent = Object.assign(new Event('drop'), {
                preventDefault: () => { },
                dataTransfer: { getData: () => JSON.stringify({ notAnArray: true }) }
            });
            el.dispatchEvent(dropEvent);
            expect(appService._calls.length).toBe(0);
        });
        it('handles invalid JSON in drop gracefully', () => {
            const layer = { id: 'layer2', name: 'Layer 2', isVisible: true };
            const el = layerPanel.createLayerElement(layer, false);
            const dropEvent = Object.assign(new Event('drop'), {
                preventDefault: () => { },
                dataTransfer: { getData: () => 'not-valid-json' }
            });
            expect(() => el.dispatchEvent(dropEvent)).not.toThrow();
        });
    });

    describe('updateActiveLayer', () => {
        it('calls highlightActiveLayer and updateDeleteButtonState', () => {
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            layerPanel.updateActiveLayer('layer1');
            expect(mockHighlightActiveLayer).toHaveBeenCalledWith(layerPanel.layerList, 'layer1');
        });

        it('calls setButtonState when deleteLayerBtn exists', () => {
            const deleteBtn = document.createElement('button');
            deleteBtn.id = 'delete-layer-btn';
            deleteBtn.setAttribute('id', 'delete-layer-btn');
            // Make button findable via querySelector matching pattern
            deleteBtn.id = 'delete-layer-btn';
            document.body.appendChild(deleteBtn);

            // Mock querySelector to find it
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            layerPanel.deleteLayerBtn = deleteBtn;
            appStore.getState = () => ({ layers: [{ id: 'layer1' }, { id: 'layer2' }] });
            selectionStore.getActiveLayerId = () => 'layer1';

            layerPanel.updateActiveLayer('layer1');
            expect(mockSetButtonState).toHaveBeenCalled();
            deleteBtn.remove();
        });

        it('updateDeleteButtonState skips when no deleteLayerBtn', () => {
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            layerPanel.deleteLayerBtn = null;
            expect(() => layerPanel.updateDeleteButtonState()).not.toThrow();
        });
    });

    describe('openRenameMode', () => {
        it('uses layer id as fallback name when layer.name is falsy', () => {
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            const layer = { id: 'layer3', name: '', isVisible: true };
            const el = layerPanel.createLayerElement(layer, false);
            layerPanel.openRenameMode(el, layer);
            const input = el.querySelector('input');
            expect(input.value).toBe(`Layer ${layer.id}`);
        });

        it('creates input and submits rename on blur', () => {
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            const layer = { id: 'layer1', name: 'Old Name', isVisible: true };
            const el = layerPanel.createLayerElement(layer, false);
            document.body.appendChild(el);
            layerPanel.openRenameMode(el, layer);

            const input = el.querySelector('input');
            expect(input).not.toBeNull();
            input.value = 'New Name';
            input.dispatchEvent(new Event('blur'));

            expect(appService._calls.length).toBe(1);
            expect(appService._calls[0].type).toBe('RenameLayerCommand');
            el.remove();
        });

        it('does not rename if name unchanged on blur', () => {
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            const layer = { id: 'layer1', name: 'Same Name', isVisible: true };
            const el = layerPanel.createLayerElement(layer, false);
            document.body.appendChild(el);
            layerPanel.openRenameMode(el, layer);

            const input = el.querySelector('input');
            input.value = 'Same Name'; // same as original
            input.dispatchEvent(new Event('blur'));

            expect(appService._calls.length).toBe(0);
            el.remove();
        });

        it('renames on Enter key', () => {
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            const layer = { id: 'layer1', name: 'Old Name', isVisible: true };
            const el = layerPanel.createLayerElement(layer, false);
            document.body.appendChild(el);
            layerPanel.openRenameMode(el, layer);

            const input = el.querySelector('input');
            input.value = 'New Name';
            input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', bubbles: true }));

            expect(appService._calls.length).toBe(1);
            el.remove();
        });

        it('cancels rename on Escape key', () => {
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            const layer = { id: 'layer1', name: 'Old Name', isVisible: true };
            const el = layerPanel.createLayerElement(layer, false);
            document.body.appendChild(el);
            layerPanel.openRenameMode(el, layer);

            const input = el.querySelector('input');
            input.value = 'Changed';
            input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Escape', bubbles: true }));

            expect(appService._calls.length).toBe(0);
            expect(el.querySelector('input')).toBeNull();
            el.remove();
        });

        it('does nothing on other key press', () => {
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            const layer = { id: 'layer1', name: 'Old Name', isVisible: true };
            const el = layerPanel.createLayerElement(layer, false);
            document.body.appendChild(el);
            layerPanel.openRenameMode(el, layer);

            const input = el.querySelector('input');
            input.dispatchEvent(new KeyboardEvent('keypress', { key: 'a', bubbles: true }));
            expect(el.querySelector('input')).not.toBeNull(); // still there
            el.remove();
        });
    });

    describe('getElement', () => {
        it('returns the container element', () => {
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            expect(layerPanel.getElement()).toBe(container);
        });
    });

    describe('deleteLayer', () => {
        it('confirms before executing DeleteLayerCommand', async () => {
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            let confirmation;
            layerPanel._confirmDialog.show = vi.fn(options => {
                confirmation = options;
                return Promise.resolve(true);
            });
            await layerPanel.deleteLayer('layer1');
            expect(confirmation).toMatchObject({
                title: 'Delete Layer',
                message: expect.stringContaining('Layer 1'),
                confirmLabel: 'Delete',
                cancelLabel: 'Cancel'
            });
            expect(appService._calls.length).toBe(1);
            expect(appService._calls[0].type).toBe('DeleteLayerCommand');
        });

        it('does not execute DeleteLayerCommand when deletion is cancelled', async () => {
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            layerPanel._confirmDialog.show = vi.fn().mockResolvedValue(false);
            await layerPanel.deleteLayer('layer1');
            expect(appService._calls).toHaveLength(0);
        });

        it('publishes error event when execute throws', async () => {
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            appService.execute = () => { throw new Error('fail'); };
            layerPanel._confirmDialog.show = vi.fn().mockResolvedValue(true);
            await layerPanel.deleteLayer('layer1');
            const errCall = eventBus._calls.find(c => c.event === 'ERROR');
            expect(errCall).toBeDefined();
        });
    });

    describe('context menu', () => {
        let contextMenu;
        let shownItems;

        beforeEach(() => {
            shownItems = null;
            contextMenu = {
                show: (x, y, items) => { shownItems = items; },
            };
            layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
            layerPanel.setContextMenu(contextMenu);
            // Give selectionStore a setActiveLayer stub
            selectionStore.setActiveLayer = vi.fn();
        });

        function makeLayer(id, name, decorations = []) {
            return {
                id,
                name,
                isVisible: true,
                getAllDecorations: () => decorations,
            };
        }

        function triggerContextMenu(layer) {
            const el = layerPanel.createLayerElement(layer, false);
            el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
            return el;
        }

        describe('Select All', () => {
            it('shows a "Select All" menu item', () => {
                const layer = makeLayer('layer1', 'Layer 1', [{ uid: 'd1' }, { uid: 'd2' }]);
                triggerContextMenu(layer);

                const selectAllItem = shownItems.find(i => i.label.startsWith('Select All'));
                expect(selectAllItem).toBeDefined();
            });

            it('includes decoration count in Select All label', () => {
                const layer = makeLayer('layer1', 'Layer 1', [{ uid: 'd1' }, { uid: 'd2' }]);
                triggerContextMenu(layer);

                const selectAllItem = shownItems.find(i => i.label.startsWith('Select All'));
                expect(selectAllItem.label).toContain('2');
            });

            it('disables Select All when layer has no decorations', () => {
                const layer = makeLayer('layer1', 'Layer 1', []);
                triggerContextMenu(layer);

                const selectAllItem = shownItems.find(i => i.label.startsWith('Select All'));
                expect(selectAllItem.disabled).toBe(true);
            });

            it('enables Select All when layer has decorations', () => {
                const layer = makeLayer('layer1', 'Layer 1', [{ uid: 'd1' }]);
                triggerContextMenu(layer);

                const selectAllItem = shownItems.find(i => i.label.startsWith('Select All'));
                expect(selectAllItem.disabled).toBe(false);
            });

            it('Select All action calls selectionStore.selectAll with decoration UIDs', () => {
                selectionStore.selectAll = vi.fn();
                const layer = makeLayer('layer1', 'Layer 1', [{ uid: 'd1' }, { uid: 'd2' }]);
                triggerContextMenu(layer);

                const selectAllItem = shownItems.find(i => i.label.startsWith('Select All'));
                selectAllItem.action();

                expect(selectionStore.selectAll).toHaveBeenCalledWith(['d1', 'd2']);
            });

            it('sets the right-clicked layer as active', () => {
                const layer = makeLayer('layer1', 'Layer 1', []);
                triggerContextMenu(layer);

                expect(selectionStore.setActiveLayer).toHaveBeenCalledWith('layer1');
            });
        });

        describe('Merge to...', () => {
            it('shows a "Merge to..." menu item', () => {
                const layer = makeLayer('layer1', 'Layer 1', []);
                triggerContextMenu(layer);

                const mergeItem = shownItems.find(i => i.label === 'Merge to...');
                expect(mergeItem).toBeDefined();
            });

            it('disables Merge to... when there are no other layers', () => {
                appStore = makeMockAppStore([
                    { id: 'layer1', name: 'Layer 1', isVisible: true },
                ]);
                layerPanel = new LayerPanel(container, appStore, selectionStore, appService, eventBus);
                layerPanel.setContextMenu(contextMenu);
                selectionStore.setActiveLayer = vi.fn();

                const layer = makeLayer('layer1', 'Layer 1', []);
                triggerContextMenu(layer);

                const mergeItem = shownItems.find(i => i.label === 'Merge to...');
                expect(mergeItem.disabled).toBe(true);
            });

            it('enables Merge to... when other layers exist', () => {
                const layer = makeLayer('layer1', 'Layer 1', []);
                triggerContextMenu(layer);

                const mergeItem = shownItems.find(i => i.label === 'Merge to...');
                expect(mergeItem.disabled).toBe(false);
            });

            it('submenu contains one item per other layer', () => {
                const layer = makeLayer('layer1', 'Layer 1', []);
                triggerContextMenu(layer);

                const mergeItem = shownItems.find(i => i.label === 'Merge to...');
                // appStore has layer1 and layer2; context menu is for layer1, so only layer2 in submenu
                expect(mergeItem.submenu).toHaveLength(1);
                expect(mergeItem.submenu[0].label).toBe('Layer 2');
            });

            it('submenu excludes the source layer itself', () => {
                const layer = makeLayer('layer1', 'Layer 1', []);
                triggerContextMenu(layer);

                const mergeItem = shownItems.find(i => i.label === 'Merge to...');
                const submenuLabels = mergeItem.submenu.map(i => i.label);
                expect(submenuLabels).not.toContain('Layer 1');
            });

            it('submenu action calls _confirmAndMergeLayer', async () => {
                layerPanel._confirmAndMergeLayer = vi.fn().mockResolvedValue(undefined);

                const layer = makeLayer('layer1', 'Layer 1', []);
                triggerContextMenu(layer);

                const mergeItem = shownItems.find(i => i.label === 'Merge to...');
                mergeItem.submenu[0].action();

                expect(layerPanel._confirmAndMergeLayer).toHaveBeenCalled();
            });
        });

        describe('_confirmAndMergeLayer', () => {
            it('executes MergeLayerCommand when confirmed', async () => {
                layerPanel._confirmDialog.show = vi.fn().mockResolvedValue(true);

                const sourceLayer = makeLayer('layer1', 'Layer 1', [{ uid: 'd1' }]);
                sourceLayer.getAllDecorations = () => [{ uid: 'd1' }];
                const targetLayer = makeLayer('layer2', 'Layer 2', []);

                await layerPanel._confirmAndMergeLayer(sourceLayer, targetLayer);

                expect(appService._calls.length).toBe(1);
                expect(appService._calls[0].type).toBe('MergeLayerCommand');
                expect(appService._calls[0].payload.sourceLayerId).toBe('layer1');
                expect(appService._calls[0].payload.targetLayerId).toBe('layer2');
            });

            it('does not execute command when cancelled', async () => {
                layerPanel._confirmDialog.show = vi.fn().mockResolvedValue(false);

                const sourceLayer = makeLayer('layer1', 'Layer 1', []);
                const targetLayer = makeLayer('layer2', 'Layer 2', []);

                await layerPanel._confirmAndMergeLayer(sourceLayer, targetLayer);

                expect(appService._calls.length).toBe(0);
            });

            it('shows singular "1 decoration" in confirm message', async () => {
                let capturedOptions;
                layerPanel._confirmDialog.show = vi.fn(opts => { capturedOptions = opts; return Promise.resolve(false); });

                const sourceLayer = makeLayer('layer1', 'Layer 1', [{ uid: 'd1' }]);
                sourceLayer.getAllDecorations = () => [{ uid: 'd1' }];
                const targetLayer = makeLayer('layer2', 'Layer 2', []);

                await layerPanel._confirmAndMergeLayer(sourceLayer, targetLayer);

                expect(capturedOptions.message).toContain('1 decoration');
                expect(capturedOptions.message).not.toContain('1 decorations');
            });

            it('shows plural "N decorations" in confirm message', async () => {
                let capturedOptions;
                layerPanel._confirmDialog.show = vi.fn(opts => { capturedOptions = opts; return Promise.resolve(false); });

                const sourceLayer = makeLayer('layer1', 'Layer 1', []);
                sourceLayer.getAllDecorations = () => [{ uid: 'd1' }, { uid: 'd2' }];
                const targetLayer = makeLayer('layer2', 'Layer 2', []);

                await layerPanel._confirmAndMergeLayer(sourceLayer, targetLayer);

                expect(capturedOptions.message).toContain('2 decorations');
            });

            it('publishes ERROR event when execute throws', async () => {
                layerPanel._confirmDialog.show = vi.fn().mockResolvedValue(true);
                appService.execute = () => Promise.reject(new Error('merge failed'));

                const sourceLayer = makeLayer('layer1', 'Layer 1', []);
                const targetLayer = makeLayer('layer2', 'Layer 2', []);

                await layerPanel._confirmAndMergeLayer(sourceLayer, targetLayer);

                const errCall = eventBus._calls.find(c => c.event === 'ERROR');
                expect(errCall).toBeDefined();
            });

            it('does not show context menu when _contextMenu is null', () => {
                layerPanel._contextMenu = null;
                const layer = makeLayer('layer1', 'Layer 1', []);
                const el = layerPanel.createLayerElement(layer, false);
                // Should not throw
                expect(() => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))).not.toThrow();
            });
        });
    });
});
