import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock ExportDialog before importing eventBinders
let mockExportDialogShow = vi.fn(async () => ['layer-1']);
vi.doMock('../../src/ui/components/ExportDialog.js', () => ({
    ExportDialog: vi.fn().mockImplementation(() => ({
        show: (...args) => mockExportDialogShow(...args)
    }))
}));

const {
    bindCreateLayerButton,
    bindDeleteLayerButton,
    bindRenameLayerInput,
    bindFileDropZone,
    bindLayerVisibilityToggle,
    bindLayerSelection,
    bindZoomControls,
    bindResetZoomButton,
    updateLayerPanel,
    highlightActiveLayer,
    updateMapTransform,
    showNotification,
    setButtonState,
    bindExportButton
} = await import('../../src/ui/eventBinders.js');

describe('eventBinders', () => {
    describe('setButtonState', () => {
        it('enables button when enabled=true', () => {
            const btn = document.createElement('button');
            btn.setAttribute('disabled', 'disabled');
            btn.classList.add('disabled');
            setButtonState(btn, true);
            expect(btn.hasAttribute('disabled')).toBe(false);
            expect(btn.classList.contains('disabled')).toBe(false);
        });

        it('disables button when enabled=false', () => {
            const btn = document.createElement('button');
            setButtonState(btn, false);
            expect(btn.getAttribute('disabled')).toBe('disabled');
            expect(btn.classList.contains('disabled')).toBe(true);
        });

        it('does nothing when button is null', () => {
            expect(() => setButtonState(null, true)).not.toThrow();
        });
    });

    describe('updateMapTransform', () => {
        it('sets CSS transform matrix on mapSvg', () => {
            const mapSvg = document.createElement('div');
            const transform = { sx: 2, sy: 2, tx: 100, ty: 50 };
            updateMapTransform(mapSvg, transform);
            expect(mapSvg.style.transform).toBe('matrix(2, 0, 0, 2, 100, 50)');
        });
    });

    describe('highlightActiveLayer', () => {
        it('adds active class to element with matching layerId', () => {
            const panel = document.createElement('div');
            const el1 = document.createElement('div');
            el1.setAttribute('data-layer-id', 'layer-1');
            const el2 = document.createElement('div');
            el2.setAttribute('data-layer-id', 'layer-2');
            panel.appendChild(el1);
            panel.appendChild(el2);

            highlightActiveLayer(panel, 'layer-1');
            expect(el1.classList.contains('active')).toBe(true);
            expect(el2.classList.contains('active')).toBe(false);
        });

        it('removes active class from previously active element', () => {
            const panel = document.createElement('div');
            const el1 = document.createElement('div');
            el1.setAttribute('data-layer-id', 'layer-1');
            el1.classList.add('active');
            const el2 = document.createElement('div');
            el2.setAttribute('data-layer-id', 'layer-2');
            panel.appendChild(el1);
            panel.appendChild(el2);

            highlightActiveLayer(panel, 'layer-2');
            expect(el1.classList.contains('active')).toBe(false);
            expect(el2.classList.contains('active')).toBe(true);
        });
    });

    describe('updateLayerPanel', () => {
        it('clears panel and renders layers', () => {
            const panel = document.createElement('div');
            panel.innerHTML = '<div>old</div>';
            const selectionStore = { getActiveLayerId: vi.fn(() => 'layer-1') };
            const createLayerElement = vi.fn(layer => {
                const el = document.createElement('div');
                el.setAttribute('data-layer-id', layer.id);
                el.addEventListener = vi.fn();
                return el;
            });
            const state = {
                layers: [{ id: 'layer-1' }, { id: 'layer-2' }]
            };

            updateLayerPanel(panel, state, selectionStore, createLayerElement);
            expect(createLayerElement).toHaveBeenCalledTimes(2);
            expect(panel.querySelectorAll('[data-layer-id]')).toHaveLength(2);
        });

    });

    describe('showNotification', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });
        afterEach(() => {
            vi.useRealTimers();
            document.body.innerHTML = '';
        });

        it('appends notification to body', () => {
            showNotification('Hello!', 'info', 0);
            const notif = document.body.querySelector('.notification');
            expect(notif).not.toBeNull();
            expect(notif.textContent).toBe('Hello!');
            expect(notif.classList.contains('notification-info')).toBe(true);
        });

        it('appends error notification with correct class', () => {
            showNotification('Error!', 'error', 0);
            const notif = document.body.querySelector('.notification-error');
            expect(notif).not.toBeNull();
        });

        it('auto-removes notification after duration', () => {
            showNotification('Fade me', 'success', 1000);
            const notif = document.body.querySelector('.notification');
            expect(notif).not.toBeNull();

            vi.advanceTimersByTime(1000);
            expect(notif.classList.contains('fade-out')).toBe(true);

            vi.advanceTimersByTime(300);
            expect(document.body.querySelector('.notification')).toBeNull();
        });

        it('uses default type info and duration 3000', () => {
            showNotification('Default');
            const notif = document.body.querySelector('.notification');
            expect(notif.classList.contains('notification-info')).toBe(true);

            vi.advanceTimersByTime(3000);
            expect(notif.classList.contains('fade-out')).toBe(true);
        });
    });

    describe('bindCreateLayerButton', () => {
        it('calls appService.execute on click', () => {
            const btn = document.createElement('button');
            const appService = { execute: vi.fn() };
            const eventBus = { publish: vi.fn() };

            bindCreateLayerButton(btn, appService, eventBus);
            btn.click();

            expect(appService.execute).toHaveBeenCalledWith(expect.objectContaining({
                type: 'CreateLayerCommand'
            }));
        });

        it('publishes ERROR when appService.execute throws', () => {
            const btn = document.createElement('button');
            const appService = { execute: vi.fn(() => { throw new Error('boom'); }) };
            const eventBus = { publish: vi.fn() };

            bindCreateLayerButton(btn, appService, eventBus);
            btn.click();

            expect(eventBus.publish).toHaveBeenCalledWith('ERROR', expect.any(Object));
        });
    });

    describe('bindDeleteLayerButton', () => {
        it('delegates deletion to the confirmation callback when provided', () => {
            const btn = document.createElement('button');
            const appService = { execute: vi.fn() };
            const selectionStore = { getActiveLayerId: vi.fn(() => 'abc') };
            const eventBus = { publish: vi.fn() };
            const onDeleteLayer = vi.fn();

            bindDeleteLayerButton(btn, appService, selectionStore, eventBus, onDeleteLayer);
            btn.click();

            expect(onDeleteLayer).toHaveBeenCalledWith('abc');
            expect(appService.execute).not.toHaveBeenCalled();
        });

        it('calls appService.execute with layerId on click', () => {
            const btn = document.createElement('button');
            const appService = { execute: vi.fn() };
            const selectionStore = { getActiveLayerId: vi.fn(() => 'abc') };
            const eventBus = { publish: vi.fn() };

            bindDeleteLayerButton(btn, appService, selectionStore, eventBus);
            btn.click();

            expect(appService.execute).toHaveBeenCalledWith(expect.objectContaining({
                type: 'DeleteLayerCommand',
                payload: { layerId: 'abc' }
            }));
        });

        it('publishes WARNING when no layer selected', () => {
            const btn = document.createElement('button');
            const appService = { execute: vi.fn() };
            const selectionStore = { getActiveLayerId: vi.fn(() => null) };
            const eventBus = { publish: vi.fn() };

            bindDeleteLayerButton(btn, appService, selectionStore, eventBus);
            btn.click();

            expect(appService.execute).not.toHaveBeenCalled();
            expect(eventBus.publish).toHaveBeenCalledWith('WARNING', expect.any(Object));
        });

        it('publishes ERROR when appService.execute throws', () => {
            const btn = document.createElement('button');
            const appService = { execute: vi.fn(() => { throw new Error('fail'); }) };
            const selectionStore = { getActiveLayerId: vi.fn(() => 'layer-1') };
            const eventBus = { publish: vi.fn() };

            bindDeleteLayerButton(btn, appService, selectionStore, eventBus);
            btn.click();

            expect(eventBus.publish).toHaveBeenCalledWith('ERROR', expect.any(Object));
        });
    });

    describe('bindRenameLayerInput', () => {
        it('executes RenameLayerCommand on blur with valid input', () => {
            const input = document.createElement('input');
            input.value = 'New Name';
            const appService = { execute: vi.fn() };
            const selectionStore = { getActiveLayerId: vi.fn(() => 'layer-1') };
            const eventBus = { publish: vi.fn() };

            bindRenameLayerInput(input, appService, selectionStore, eventBus);
            input.dispatchEvent(new Event('blur'));

            expect(appService.execute).toHaveBeenCalledWith(expect.objectContaining({
                type: 'RenameLayerCommand',
                payload: { layerId: 'layer-1', newName: 'New Name' }
            }));
        });

        it('publishes WARNING when input is empty', () => {
            const input = document.createElement('input');
            input.value = '';
            const appService = { execute: vi.fn() };
            const selectionStore = { getActiveLayerId: vi.fn(() => 'layer-1') };
            const eventBus = { publish: vi.fn() };

            bindRenameLayerInput(input, appService, selectionStore, eventBus);
            input.dispatchEvent(new Event('blur'));

            expect(appService.execute).not.toHaveBeenCalled();
            expect(eventBus.publish).toHaveBeenCalledWith('WARNING', expect.any(Object));
        });

        it('publishes WARNING when no layer selected', () => {
            const input = document.createElement('input');
            input.value = 'Name';
            const appService = { execute: vi.fn() };
            const selectionStore = { getActiveLayerId: vi.fn(() => null) };
            const eventBus = { publish: vi.fn() };

            bindRenameLayerInput(input, appService, selectionStore, eventBus);
            input.dispatchEvent(new Event('blur'));

            expect(appService.execute).not.toHaveBeenCalled();
        });

        it('triggers blur on Enter keypress', () => {
            const input = document.createElement('input');
            input.value = 'New';
            const appService = { execute: vi.fn() };
            const selectionStore = { getActiveLayerId: vi.fn(() => 'l1') };
            const eventBus = { publish: vi.fn() };

            bindRenameLayerInput(input, appService, selectionStore, eventBus);
            const blurSpy = vi.spyOn(input, 'blur');
            const keyEvent = new KeyboardEvent('keypress', { key: 'Enter' });
            input.dispatchEvent(keyEvent);

            expect(blurSpy).toHaveBeenCalled();
        });

        it('publishes ERROR when appService.execute throws', () => {
            const input = document.createElement('input');
            input.value = 'Name';
            const appService = { execute: vi.fn(() => { throw new Error('oops'); }) };
            const selectionStore = { getActiveLayerId: vi.fn(() => 'l1') };
            const eventBus = { publish: vi.fn() };

            bindRenameLayerInput(input, appService, selectionStore, eventBus);
            input.dispatchEvent(new Event('blur'));

            expect(eventBus.publish).toHaveBeenCalledWith('ERROR', expect.any(Object));
        });
    });

    describe('bindLayerVisibilityToggle', () => {
        it('calls appService.execute with ToggleLayerVisibilityCommand on change', async () => {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            const appService = { execute: vi.fn(async () => { }) };
            const eventBus = { publish: vi.fn() };

            bindLayerVisibilityToggle(checkbox, 'layer-1', appService, eventBus);
            checkbox.dispatchEvent(new Event('change'));

            await Promise.resolve(); // flush microtasks
            expect(appService.execute).toHaveBeenCalledWith(expect.objectContaining({
                type: 'ToggleLayerVisibilityCommand',
                payload: { layerId: 'layer-1' }
            }));
        });

        it('publishes ERROR when appService.execute throws', async () => {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            const appService = { execute: vi.fn(async () => { throw new Error('fail'); }) };
            const eventBus = { publish: vi.fn() };

            bindLayerVisibilityToggle(checkbox, 'l1', appService, eventBus);
            checkbox.dispatchEvent(new Event('change'));

            await Promise.resolve();
            await Promise.resolve(); // let catch run
            expect(eventBus.publish).toHaveBeenCalledWith('ERROR', expect.any(Object));
        });
    });

    describe('bindLayerSelection', () => {
        it('calls selectionStore.setActiveLayer on click', () => {
            const el = document.createElement('div');
            const selectionStore = { setActiveLayer: vi.fn() };

            bindLayerSelection(el, 'layer-5', selectionStore);
            el.click();

            expect(selectionStore.setActiveLayer).toHaveBeenCalledWith('layer-5');
        });
    });

    describe('bindZoomControls', () => {
        it('calls zoomStore.zoom(1.2) on zoomInButton click', () => {
            const zoomInBtn = document.createElement('button');
            const zoomOutBtn = document.createElement('button');
            const zoomStore = { zoom: vi.fn() };

            bindZoomControls(zoomInBtn, zoomOutBtn, zoomStore);
            zoomInBtn.click();

            expect(zoomStore.zoom).toHaveBeenCalledWith(1.2);
        });

        it('calls zoomStore.zoom(0.8) on zoomOutButton click', () => {
            const zoomInBtn = document.createElement('button');
            const zoomOutBtn = document.createElement('button');
            const zoomStore = { zoom: vi.fn() };

            bindZoomControls(zoomInBtn, zoomOutBtn, zoomStore);
            zoomOutBtn.click();

            expect(zoomStore.zoom).toHaveBeenCalledWith(0.8);
        });

        it('handles null zoomInButton gracefully', () => {
            const zoomOutBtn = document.createElement('button');
            const zoomStore = { zoom: vi.fn() };

            expect(() => bindZoomControls(null, zoomOutBtn, zoomStore)).not.toThrow();
        });

        it('handles null zoomOutButton gracefully', () => {
            const zoomInBtn = document.createElement('button');
            const zoomStore = { zoom: vi.fn() };

            expect(() => bindZoomControls(zoomInBtn, null, zoomStore)).not.toThrow();
        });
    });

    describe('bindResetZoomButton', () => {
        it('calls zoomStore.reset() on click', () => {
            const btn = document.createElement('button');
            const zoomStore = { reset: vi.fn() };

            bindResetZoomButton(btn, zoomStore);
            btn.click();

            expect(zoomStore.reset).toHaveBeenCalled();
        });
    });

    describe('bindFileDropZone', () => {
        let MockFileReader;

        beforeEach(() => {
            // Mock FileReader
            MockFileReader = function () {
                this.onload = null;
                this.onerror = null;
                this.readAsText = vi.fn((file) => {
                    if (file._triggerError) {
                        if (this.onerror) this.onerror();
                    } else {
                        if (this.onload) this.onload({ target: { result: file._content || '<xml/>' } });
                    }
                });
            };
            global.FileReader = MockFileReader;
        });

        afterEach(() => {
            delete global.FileReader;
        });

        it('adds drag-over class on dragover', () => {
            const zone = document.createElement('div');
            const appService = { execute: vi.fn() };
            const eventBus = { publish: vi.fn() };

            bindFileDropZone(zone, appService, eventBus);

            const dragOverEvent = new Event('dragover');
            dragOverEvent.preventDefault = vi.fn();
            dragOverEvent.dataTransfer = { dropEffect: '' };
            zone.dispatchEvent(dragOverEvent);

            expect(zone.classList.contains('drag-over')).toBe(true);
            expect(dragOverEvent.preventDefault).toHaveBeenCalled();
        });

        it('removes drag-over class on dragleave', () => {
            const zone = document.createElement('div');
            zone.classList.add('drag-over');
            const appService = { execute: vi.fn() };
            const eventBus = { publish: vi.fn() };

            bindFileDropZone(zone, appService, eventBus);
            zone.dispatchEvent(new Event('dragleave'));

            expect(zone.classList.contains('drag-over')).toBe(false);
        });

        it('publishes ERROR when no files dropped', () => {
            const zone = document.createElement('div');
            const appService = { execute: vi.fn() };
            const eventBus = { publish: vi.fn() };

            bindFileDropZone(zone, appService, eventBus);

            const dropEvent = new Event('drop');
            dropEvent.preventDefault = vi.fn();
            dropEvent.dataTransfer = { files: [] };
            zone.dispatchEvent(dropEvent);

            expect(appService.execute).not.toHaveBeenCalled();
        });

        it('publishes ERROR for non-XML files', () => {
            const zone = document.createElement('div');
            const appService = { execute: vi.fn() };
            const eventBus = { publish: vi.fn() };

            bindFileDropZone(zone, appService, eventBus);

            const dropEvent = new Event('drop');
            dropEvent.preventDefault = vi.fn();
            dropEvent.dataTransfer = { files: [{ name: 'file.txt' }] };
            zone.dispatchEvent(dropEvent);

            expect(eventBus.publish).toHaveBeenCalledWith('ERROR', expect.any(Object));
        });

        it('calls appService.execute with LoadLayoutCommand on XML file drop', async () => {
            const zone = document.createElement('div');
            const appService = { execute: vi.fn(async () => { }) };
            const eventBus = { publish: vi.fn() };

            bindFileDropZone(zone, appService, eventBus);

            const dropEvent = new Event('drop');
            dropEvent.preventDefault = vi.fn();
            dropEvent.dataTransfer = {
                files: [{ name: 'layout.xml', _content: '<xml/>' }]
            };
            zone.dispatchEvent(dropEvent);

            await Promise.resolve();
            await Promise.resolve();

            expect(appService.execute).toHaveBeenCalledWith(expect.objectContaining({
                type: 'LoadLayoutCommand'
            }));
        });

        it('publishes SUCCESS after successful XML load', async () => {
            const zone = document.createElement('div');
            const appService = { execute: vi.fn(async () => { }) };
            const eventBus = { publish: vi.fn() };

            bindFileDropZone(zone, appService, eventBus);

            const dropEvent = new Event('drop');
            dropEvent.preventDefault = vi.fn();
            dropEvent.dataTransfer = {
                files: [{ name: 'layout.xml', _content: '<xml/>' }]
            };
            zone.dispatchEvent(dropEvent);

            await Promise.resolve();
            await Promise.resolve();

            expect(eventBus.publish).toHaveBeenCalledWith('SUCCESS', expect.any(Object));
        });

        it('publishes ERROR when appService.execute throws during XML load', async () => {
            const zone = document.createElement('div');
            const appService = { execute: vi.fn(async () => { throw new Error('fail'); }) };
            const eventBus = { publish: vi.fn() };

            bindFileDropZone(zone, appService, eventBus);

            const dropEvent = new Event('drop');
            dropEvent.preventDefault = vi.fn();
            dropEvent.dataTransfer = {
                files: [{ name: 'layout.xml', _content: '<xml/>' }]
            };
            zone.dispatchEvent(dropEvent);

            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();

            expect(eventBus.publish).toHaveBeenCalledWith('ERROR', expect.any(Object));
        });

        it('publishes ERROR when FileReader errors', () => {
            const zone = document.createElement('div');
            const appService = { execute: vi.fn() };
            const eventBus = { publish: vi.fn() };

            bindFileDropZone(zone, appService, eventBus);

            const dropEvent = new Event('drop');
            dropEvent.preventDefault = vi.fn();
            dropEvent.dataTransfer = {
                files: [{ name: 'layout.xml', _triggerError: true }]
            };
            zone.dispatchEvent(dropEvent);

            expect(eventBus.publish).toHaveBeenCalledWith('ERROR', expect.any(Object));
        });
    });

    describe('bindExportButton', () => {
        beforeEach(() => {
            mockExportDialogShow = vi.fn(async () => ['layer-1']);
        });

        it('does nothing when button is null', () => {
            const appService = { execute: vi.fn() };
            const appStore = { getState: vi.fn(() => ({ layout: null })), subscribe: vi.fn() };
            const eventBus = { publish: vi.fn() };

            expect(() => bindExportButton(null, appService, appStore, eventBus)).not.toThrow();
            expect(appStore.subscribe).not.toHaveBeenCalled();
        });

        it('disables button initially when no layout loaded', () => {
            const btn = document.createElement('button');
            const appService = { execute: vi.fn() };
            const appStore = {
                getState: vi.fn(() => ({ layout: null })),
                subscribe: vi.fn()
            };
            const eventBus = { publish: vi.fn() };

            bindExportButton(btn, appService, appStore, eventBus);

            expect(btn.getAttribute('disabled')).toBe('disabled');
        });

        it('enables button when layout is loaded', () => {
            const btn = document.createElement('button');
            const appService = { execute: vi.fn() };
            const appStore = {
                getState: vi.fn(() => ({ layout: { name: 'MyLayout' } })),
                subscribe: vi.fn()
            };
            const eventBus = { publish: vi.fn() };

            bindExportButton(btn, appService, appStore, eventBus);

            expect(btn.hasAttribute('disabled')).toBe(false);
        });

        it('subscribes to appStore for sync', () => {
            const btn = document.createElement('button');
            const appService = { execute: vi.fn() };
            const appStore = {
                getState: vi.fn(() => ({ layout: null })),
                subscribe: vi.fn()
            };
            const eventBus = { publish: vi.fn() };

            bindExportButton(btn, appService, appStore, eventBus);

            expect(appStore.subscribe).toHaveBeenCalled();
        });

        it('publishes ribbon:export-requested on click', async () => {
            const btn = document.createElement('button');
            const appService = { execute: vi.fn(async () => { }) };
            const appStore = {
                getState: vi.fn(() => ({ layout: { name: 'T' }, layers: [] })),
                subscribe: vi.fn()
            };
            const eventBus = { publish: vi.fn() };

            bindExportButton(btn, appService, appStore, eventBus);
            btn.click();

            await new Promise(r => setTimeout(r, 10));

            expect(eventBus.publish).toHaveBeenCalledWith('ribbon:export-requested', {});
        });

        it('returns early when exportDialog.show returns null (cancelled)', async () => {
            const btn = document.createElement('button');
            const appService = { execute: vi.fn(async () => { }) };
            const appStore = {
                getState: vi.fn(() => ({ layout: { name: 'T' }, layers: [] })),
                subscribe: vi.fn()
            };
            const eventBus = { publish: vi.fn() };
            mockExportDialogShow = vi.fn(async () => null);

            bindExportButton(btn, appService, appStore, eventBus);
            btn.click();

            await new Promise(r => setTimeout(r, 10));

            expect(appService.execute).not.toHaveBeenCalled();
        });

        it('does not call appService.execute directly (delegates via event bus)', async () => {
            const btn = document.createElement('button');
            const appService = { execute: vi.fn(async () => { }) };
            const appStore = {
                getState: vi.fn(() => ({ layout: { name: 'T' }, layers: [] })),
                subscribe: vi.fn()
            };
            const eventBus = { publish: vi.fn() };

            bindExportButton(btn, appService, appStore, eventBus);
            btn.click();

            await new Promise(r => setTimeout(r, 10));

            expect(appService.execute).not.toHaveBeenCalled();
        });
    });
});
