/**
 * Tests for RibbonToolbar
 * Covers: _build(), button click handlers, _updateState(), subscriptions, unmount
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { RibbonToolbar } from '../../../src/ui/components/RibbonToolbar.js';
import { MapType } from '../../../src/domain/MapType.js';

// Mock LoadFromUrlDialog so tests don't depend on DOM dialog behaviour
vi.mock('../../../src/ui/components/LoadFromUrlDialog.js', () => {
    const mockShow = vi.fn();
    return {
        LoadFromUrlDialog: vi.fn(function () {
            return { show: mockShow };
        }),
        _mockShow: mockShow,
    };
});

import * as LoadFromUrlDialogModule from '../../../src/ui/components/LoadFromUrlDialog.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeEventBus() {
    const subs = {};
    return {
        publish: vi.fn((event, data) => { (subs[event] || []).forEach(fn => fn(data)); }),
        subscribe: vi.fn((event, fn) => {
            if (!subs[event]) subs[event] = [];
            subs[event].push(fn);
            return vi.fn(() => { subs[event] = subs[event].filter(f => f !== fn); });
        }),
    };
}

function makeAppStore(layout = null, mapType = null) {
    return { getState: vi.fn(() => ({ layout, mapType })) };
}

function makeUndoRedoManager({ canUndo = false, canRedo = false, undoLabel = null, redoLabel = null } = {}) {
    return {
        canUndo: vi.fn(() => canUndo),
        canRedo: vi.fn(() => canRedo),
        peekUndo: vi.fn(() => undoLabel ? { label: undoLabel } : null),
        peekRedo: vi.fn(() => redoLabel ? { label: redoLabel } : null),
        subscribe: vi.fn(() => vi.fn()),
    };
}

function makeToolModeStore(mode = 'pan') {
    return {
        getMode: vi.fn(() => mode),
        setMode: vi.fn(),
        subscribe: vi.fn(() => vi.fn()),
    };
}

function makeSelectionStore(selectedIds = []) {
    const listeners = [];
    return {
        getSelectedIds: vi.fn(() => selectedIds),
        subscribe: vi.fn(listener => {
            listeners.push(listener);
            return vi.fn(() => listeners.splice(listeners.indexOf(listener), 1));
        }),
        setSelectedIds(ids) {
            selectedIds = ids;
            listeners.forEach(listener => listener({ selectedIds }));
        }
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('RibbonToolbar', () => {
    let appService;
    let appStore;
    let zoomStore;
    let eventBus;

    beforeEach(() => {
        appService = { execute: vi.fn() };
        appStore = makeAppStore();
        zoomStore = {};
        eventBus = makeEventBus();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // getElement / _build
    // ─────────────────────────────────────────────────────────────────────────

    test('getElement builds toolbar and returns the same element', () => {
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore);
        const el1 = toolbar.getElement();
        const el2 = toolbar.getElement();
        expect(el1).toBe(el2);
        expect(el1.classList.contains('ribbon-toolbar')).toBe(true);
    });

    test('built toolbar contains all button groups', () => {
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore);
        const el = toolbar.getElement();
        const groups = el.querySelectorAll('.ribbon-group');
        expect(groups.length).toBe(6); // File, View, Edit, Tools, Report, Links
        const githubLink = el.querySelector('[data-action="ribbon-github"]');
        expect(githubLink.getAttribute('href')).toBe('https://github.com/quantazmo/gw2-deco');
        expect(githubLink.getAttribute('aria-label')).toBe('View on GitHub');
        expect(githubLink.parentElement.parentElement).toBe(groups[groups.length - 1]);
    });

    test('Delete Selected is in Edit, disabled without a selection, and requests confirmation when selected', () => {
        const selectionStore = makeSelectionStore();
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore, eventBus, null, null, selectionStore);
        const button = toolbar.getElement().querySelector('[data-action="ribbon-delete-selected"]');

        expect(button.closest('[data-group="edit"]')).not.toBeNull();
        expect(button.disabled).toBe(true);

        selectionStore.setSelectedIds(['dec-1', 'dec-2']);
        expect(button.disabled).toBe(false);
        button.click();
        expect(eventBus.publish).toHaveBeenCalledWith('confirm:deleteDecorations', {
            decorationIds: ['dec-1', 'dec-2']
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Subscriptions in _build (lines 107-116)
    // ─────────────────────────────────────────────────────────────────────────

    test('subscribes to eventBus appstate:changed when eventBus provided', () => {
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore, eventBus);
        toolbar.getElement();
        expect(eventBus.subscribe).toHaveBeenCalledWith('appstate:changed', expect.any(Function));
    });

    test('subscribes to undoRedoManager when provided (line 108)', () => {
        const undoRedoManager = makeUndoRedoManager();
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore, null, undoRedoManager);
        toolbar.getElement();
        expect(undoRedoManager.subscribe).toHaveBeenCalledTimes(1);
    });

    test('subscribes to toolModeStore when provided (line 114)', () => {
        const toolModeStore = makeToolModeStore();
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore, null, null, toolModeStore);
        toolbar.getElement();
        expect(toolModeStore.subscribe).toHaveBeenCalledTimes(1);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // unmount
    // ─────────────────────────────────────────────────────────────────────────

    test('unmount calls all unsubscribe functions', () => {
        const unsubFn = vi.fn();
        eventBus.subscribe.mockReturnValueOnce(unsubFn);
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore, eventBus);
        toolbar.getElement();
        toolbar.unmount();
        expect(unsubFn).toHaveBeenCalledTimes(1);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // _updateState — line 191 (peekUndo label) and line 201 (peekRedo label)
    // ─────────────────────────────────────────────────────────────────────────

    test('_updateState sets undo button title from peekUndo label (line 191)', () => {
        const undoRedoManager = makeUndoRedoManager({
            canUndo: true,
            undoLabel: 'Move decoration',
        });
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore, null, undoRedoManager);
        toolbar.getElement();
        expect(toolbar._undoBtn.title).toBe('Undo Move decoration');
    });

    test('_updateState sets redo button title from peekRedo label (line 201)', () => {
        const undoRedoManager = makeUndoRedoManager({
            canRedo: true,
            redoLabel: 'Create layer',
        });
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore, null, undoRedoManager);
        toolbar.getElement();
        expect(toolbar._redoBtn.title).toBe('Redo Create layer');
    });

    test('_updateState sets generic Undo title when peekUndo is null', () => {
        const undoRedoManager = makeUndoRedoManager({ canUndo: false, undoLabel: null });
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore, null, undoRedoManager);
        toolbar.getElement();
        expect(toolbar._undoBtn.title).toBe('Undo');
    });

    test('_updateState disables export button when no layout', () => {
        const toolbar = new RibbonToolbar(appService, makeAppStore(null), zoomStore);
        toolbar.getElement();
        expect(toolbar._exportBtn.disabled).toBe(true);
    });

    test('_updateState enables export button when layout exists', () => {
        const toolbar = new RibbonToolbar(appService, makeAppStore({ id: 't1' }), zoomStore);
        toolbar.getElement();
        expect(toolbar._exportBtn.disabled).toBe(false);
    });

    test('_updateState reflects tool mode in aria-pressed on pan and select buttons', () => {
        const toolModeStore = makeToolModeStore('select');
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore, null, null, toolModeStore);
        toolbar.getElement();
        expect(toolbar._panBtn.getAttribute('aria-pressed')).toBe('false');
        expect(toolbar._selectBtn.getAttribute('aria-pressed')).toBe('true');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Button click handlers (lines 220-265)
    // ─────────────────────────────────────────────────────────────────────────

    test('Load button click triggers #file-input click (line 222)', () => {
        const fileInput = document.createElement('input');
        fileInput.id = 'file-input';
        document.body.appendChild(fileInput);
        const clickSpy = vi.spyOn(fileInput, 'click');

        const toolbar = new RibbonToolbar(appService, appStore, zoomStore);
        const loadBtn = toolbar.getElement().querySelector('[data-action="ribbon-load"]');
        loadBtn.click();

        expect(clickSpy).toHaveBeenCalledTimes(1);
        document.body.removeChild(fileInput);
    });

    test('Load button calls window.openFileDialog when no #file-input (line 224)', () => {
        window.openFileDialog = vi.fn();
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore);
        const loadBtn = toolbar.getElement().querySelector('[data-action="ribbon-load"]');
        loadBtn.click();
        expect(window.openFileDialog).toHaveBeenCalledTimes(1);
        delete window.openFileDialog;
    });

    test('Export button publishes ribbon:export-requested when layout exists (line 235)', () => {
        const layout = { id: 't1' };
        const store = makeAppStore(layout);
        const toolbar = new RibbonToolbar(appService, store, zoomStore, eventBus);
        const exportBtn = toolbar.getElement().querySelector('[data-action="ribbon-export"]');
        exportBtn.click();
        expect(eventBus.publish).toHaveBeenCalledWith('ribbon:export-requested', { layout });
    });

    test('Export button does nothing when no layout (line 231)', () => {
        const toolbar = new RibbonToolbar(appService, makeAppStore(null), zoomStore, eventBus);
        const exportBtn = toolbar.getElement().querySelector('[data-action="ribbon-export"]');
        exportBtn.click();
        expect(eventBus.publish).not.toHaveBeenCalledWith('ribbon:export-requested', expect.anything());
    });

    test('Export button does nothing when no appStore', () => {
        const toolbar = new RibbonToolbar(appService, null, zoomStore, eventBus);
        const exportBtn = toolbar.getElement().querySelector('[data-action="ribbon-export"]');
        expect(() => exportBtn.click()).not.toThrow();
    });

    test('Zoom In button publishes zoom:in-requested (line 239)', () => {
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore, eventBus);
        toolbar.getElement().querySelector('[data-action="ribbon-zoom-in"]').click();
        expect(eventBus.publish).toHaveBeenCalledWith('zoom:in-requested');
    });

    test('Zoom Out button publishes zoom:out-requested (line 240)', () => {
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore, eventBus);
        toolbar.getElement().querySelector('[data-action="ribbon-zoom-out"]').click();
        expect(eventBus.publish).toHaveBeenCalledWith('zoom:out-requested');
    });

    test('Fit Entire Map button publishes zoom:fit-requested', () => {
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore, eventBus);
        toolbar.getElement().querySelector('[data-action="ribbon-fit"]').click();
        expect(eventBus.publish).toHaveBeenCalledWith('zoom:fit-requested');
    });

    test('Fit Selected is disabled without a selection and publishes its request when selected', () => {
        const selectionStore = makeSelectionStore();
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore, eventBus, null, null, selectionStore);
        const button = toolbar.getElement().querySelector('[data-action="ribbon-fit-selected"]');

        expect(button.getAttribute('aria-label')).toBe('Fit Selected');
        expect(button.disabled).toBe(true);
        selectionStore.setSelectedIds(['dec-1']);
        expect(button.disabled).toBe(false);
        button.click();
        expect(eventBus.publish).toHaveBeenCalledWith('zoom:fit-selected-requested');
    });

    test('Undo button publishes undo:requested when canUndo is true (lines 243-246)', () => {
        const undoRedoManager = makeUndoRedoManager({ canUndo: true });
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore, eventBus, undoRedoManager);
        toolbar.getElement().querySelector('[data-action="ribbon-undo"]').click();
        expect(eventBus.publish).toHaveBeenCalledWith('undo:requested');
    });

    test('Undo button does not publish when canUndo is false', () => {
        const undoRedoManager = makeUndoRedoManager({ canUndo: false });
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore, eventBus, undoRedoManager);
        toolbar.getElement().querySelector('[data-action="ribbon-undo"]').click();
        expect(eventBus.publish).not.toHaveBeenCalledWith('undo:requested', expect.anything());
    });

    test('Redo button publishes redo:requested when canRedo is true (lines 250-254)', () => {
        const undoRedoManager = makeUndoRedoManager({ canRedo: true });
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore, eventBus, undoRedoManager);
        toolbar.getElement().querySelector('[data-action="ribbon-redo"]').click();
        expect(eventBus.publish).toHaveBeenCalledWith('redo:requested');
    });

    test('Tool Pan button calls toolModeStore.setMode("pan") (lines 261-264)', () => {
        const toolModeStore = makeToolModeStore('select');
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore, null, null, toolModeStore);
        toolbar.getElement().querySelector('[data-action="tool-pan"]').click();
        expect(toolModeStore.setMode).toHaveBeenCalledWith('pan');
    });

    test('Tool Select button calls toolModeStore.setMode("select")', () => {
        const toolModeStore = makeToolModeStore('pan');
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore, null, null, toolModeStore);
        toolbar.getElement().querySelector('[data-action="tool-select"]').click();
        expect(toolModeStore.setMode).toHaveBeenCalledWith('select');
    });

    test('Lasso Select button calls toolModeStore.setMode("lasso")', () => {
        const toolModeStore = makeToolModeStore('pan');
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore, null, null, toolModeStore);
        toolbar.getElement().querySelector('[data-action="tool-lasso"]').click();
        expect(toolModeStore.setMode).toHaveBeenCalledWith('lasso');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Settings button
    // ─────────────────────────────────────────────────────────────────────────

    test('Settings button is present in the File group', () => {
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore);
        const el = toolbar.getElement();
        const settingsBtn = el.querySelector('[data-action="ribbon-settings"]');
        expect(settingsBtn).not.toBeNull();
        expect(settingsBtn.getAttribute('aria-label')).toBe('Settings');
    });

    test('Settings button publishes ribbon:settings-requested on click', () => {
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore, eventBus);
        toolbar.getElement().querySelector('[data-action="ribbon-settings"]').click();
        expect(eventBus.publish).toHaveBeenCalledWith('ribbon:settings-requested');
    });

    test('Settings button does nothing when no eventBus provided', () => {
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore);
        const settingsBtn = toolbar.getElement().querySelector('[data-action="ribbon-settings"]');
        expect(() => settingsBtn.click()).not.toThrow();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Load from URL button
    // ─────────────────────────────────────────────────────────────────────────

    test('Load from URL button is present in the File group', () => {
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore);
        const btn = toolbar.getElement().querySelector('[data-action="ribbon-load-url"]');
        expect(btn).not.toBeNull();
        expect(btn.getAttribute('aria-label')).toBe('Load from URL');
    });

    test('Load from URL: does nothing when dialog resolves null (cancelled)', async () => {
        LoadFromUrlDialogModule._mockShow.mockResolvedValue(null);
        window.alert = vi.fn();
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore);
        toolbar.getElement().querySelector('[data-action="ribbon-load-url"]').click();
        await new Promise(r => setTimeout(r, 0));
        expect(window.alert).not.toHaveBeenCalled();
        expect(appService.execute).not.toHaveBeenCalled();
        delete window.alert;
    });

    test('Load from URL: shows alert for non-http non-relative URL', async () => {
        LoadFromUrlDialogModule._mockShow.mockResolvedValue('ftp://example.com/layout.xml');
        window.alert = vi.fn();
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore);
        toolbar.getElement().querySelector('[data-action="ribbon-load-url"]').click();
        await new Promise(r => setTimeout(r, 0));
        expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Invalid URL'));
        delete window.alert;
    });

    test('Load from URL: calls completeLayoutLoadingWorkflow on success', async () => {
        const xmlContent = '<layout/>';
        LoadFromUrlDialogModule._mockShow.mockResolvedValue('https://example.com/my-layout.xml');
        window.alert = vi.fn();
        window.completeLayoutLoadingWorkflow = vi.fn().mockResolvedValue(undefined);
        global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => xmlContent });

        const toolbar = new RibbonToolbar(appService, appStore, zoomStore);
        toolbar.getElement().querySelector('[data-action="ribbon-load-url"]').click();
        await new Promise(r => setTimeout(r, 0));

        expect(window.completeLayoutLoadingWorkflow).toHaveBeenCalledWith(xmlContent, 'my-layout.xml');
        delete window.alert;
        delete window.completeLayoutLoadingWorkflow;
        delete global.fetch;
    });

    test('Load from URL: accepts relative /samples path from dropdown', async () => {
        const xmlContent = '<layout/>';
        LoadFromUrlDialogModule._mockShow.mockResolvedValue('/samples/homestead.xml');
        window.alert = vi.fn();
        window.completeLayoutLoadingWorkflow = vi.fn().mockResolvedValue(undefined);
        global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => xmlContent });

        const toolbar = new RibbonToolbar(appService, appStore, zoomStore);
        toolbar.getElement().querySelector('[data-action="ribbon-load-url"]').click();
        await new Promise(r => setTimeout(r, 0));

        expect(window.completeLayoutLoadingWorkflow).toHaveBeenCalledWith(xmlContent, 'homestead.xml');
        delete window.alert;
        delete window.completeLayoutLoadingWorkflow;
        delete global.fetch;
    });

    test('Load from URL: falls back to LoadLayoutCommand when workflow unavailable', async () => {
        const xmlContent = '<layout/>';
        LoadFromUrlDialogModule._mockShow.mockResolvedValue('https://example.com/layout.xml');
        window.alert = vi.fn();
        delete window.completeLayoutLoadingWorkflow;
        global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => xmlContent });

        const toolbar = new RibbonToolbar(appService, appStore, zoomStore);
        toolbar.getElement().querySelector('[data-action="ribbon-load-url"]').click();
        await new Promise(r => setTimeout(r, 0));

        expect(appService.execute).toHaveBeenCalledWith(expect.objectContaining({
            type: 'LoadLayoutCommand',
            payload: expect.objectContaining({ xmlContent }),
        }));
        delete window.alert;
        delete global.fetch;
    });

    test('Load from URL: shows alert on fetch failure', async () => {
        LoadFromUrlDialogModule._mockShow.mockResolvedValue('https://example.com/bad.xml');
        window.alert = vi.fn();
        global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

        const toolbar = new RibbonToolbar(appService, appStore, zoomStore);
        toolbar.getElement().querySelector('[data-action="ribbon-load-url"]').click();
        await new Promise(r => setTimeout(r, 0));

        expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Failed to load layout from URL'));
        delete window.alert;
        delete global.fetch;
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Crafting group
    // ─────────────────────────────────────────────────────────────────────────

    test('built toolbar contains 7 groups including GitHub', () => {
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore);
        const el = toolbar.getElement();
        const groups = el.querySelectorAll('.ribbon-group');
        expect(groups.length).toBe(6); // File, View, Edit, Tools, Report, GitHub
    });

    test('ribbon toolbar contains a Crafting group', () => {
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore);
        const el = toolbar.getElement();
        const craftingGroup = el.querySelector('.ribbon-group[data-group="crafting"]');
        expect(craftingGroup).not.toBeNull();
        const label = craftingGroup.querySelector('.ribbon-group-label');
        expect(label.textContent).toBe('Crafting');
    });

    test('Crafting group contains a Craft Missing Decorations button', () => {
        const toolbar = new RibbonToolbar(appService, appStore, zoomStore);
        const btn = toolbar.getElement().querySelector('[data-action="ribbon-decoration-report"]');
        expect(btn).not.toBeNull();
        expect(btn.getAttribute('aria-label')).toBe('Craft Missing Decorations');
    });

    test('Craft Missing Decorations button is disabled when no layout loaded', () => {
        const toolbar = new RibbonToolbar(appService, makeAppStore(null), zoomStore);
        toolbar.getElement();
        expect(toolbar._reportBtn.disabled).toBe(true);
    });

    test('Craft Missing Decorations button is enabled when layout exists', () => {
        const layout = { id: 't1' };
        const toolbar = new RibbonToolbar(appService, makeAppStore(layout), zoomStore);
        toolbar.getElement();
        expect(toolbar._reportBtn.disabled).toBe(false);
    });

    test('Craft Missing Decorations button is disabled for a loaded guild hall map', () => {
        const layout = { id: 't1' };
        const toolbar = new RibbonToolbar(appService, makeAppStore(layout, MapType.GuildHall), zoomStore);
        toolbar.getElement();
        expect(toolbar._reportBtn.disabled).toBe(true);
    });

    test('Craft Missing Decorations button updates when the loaded map changes', () => {
        const layout = { id: 't1' };
        const store = makeAppStore(layout);
        const toolbar = new RibbonToolbar(appService, store, zoomStore, eventBus);
        toolbar.getElement();

        store.getState.mockReturnValue({ layout, mapType: MapType.GuildHall });
        eventBus.publish('appstate:changed');
        expect(toolbar._reportBtn.disabled).toBe(true);

        store.getState.mockReturnValue({ layout, mapType: MapType.Homestead });
        eventBus.publish('appstate:changed');
        expect(toolbar._reportBtn.disabled).toBe(false);
    });

    test('Craft Missing Decorations button click publishes ribbon:report-requested', () => {
        const layout = {
            id: 't1',
            map: { name: 'Gilded Hollow' },
            layers: new Map([['l1', { id: 'l1', name: 'Layer 1', isVisible: true, getAllDecorations: () => [] }]]),
        };
        const store = makeAppStore(layout);
        const toolbar = new RibbonToolbar(appService, store, zoomStore, eventBus);
        toolbar.getElement().querySelector('[data-action="ribbon-decoration-report"]').click();
        expect(eventBus.publish).toHaveBeenCalledWith('ribbon:report-requested', expect.objectContaining({ layout }));
    });

    test('Craft Missing Decorations button does nothing when no layout', () => {
        const toolbar = new RibbonToolbar(appService, makeAppStore(null), zoomStore, eventBus);
        toolbar.getElement().querySelector('[data-action="ribbon-decoration-report"]').click();
        expect(eventBus.publish).not.toHaveBeenCalledWith('ribbon:report-requested', expect.anything());
    });
});
