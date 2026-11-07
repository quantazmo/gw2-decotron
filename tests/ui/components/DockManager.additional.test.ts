/**
 * Additional tests for DockManager to cover remaining uncovered lines:
 * Lines 80-85  (RibbonToolbar init when appService+appStore+zoomStore provided)
 * Lines 118-119 (ribbon.unmount called on unmount)
 * Lines 126-127 (clearTimeout for pending resizeTimer on unmount)
 * Lines 166-168 (fallback for unknown node type)
 * Line 200     (dividerOptions.maxRatio when map is in second child)
 * Lines 204-205 (onRatioChange callbacks — invoked via divider drag)
 * Lines 239-272 (_enforceMinimumSizes — window resize + direct call)
 * Lines 308-315 (_onDividerMoved — called directly)
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { DockManager } from '../../../src/ui/components/DockManager.js';
import { DockPanelLayoutStore } from '../../../src/ui/stores/DockPanelLayoutStore.js';
import {
    DockLayoutConfiguration,
    createPanelNode,
    createSplitNode,
    createTabGroupNode,
} from '../../../src/domain/DockLayoutConfiguration.js';
import { PANEL_IDS } from '../../../src/config/constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createMockPanelContentMap() {
    const map = {};
    Object.values(PANEL_IDS).forEach(id => {
        const el = document.createElement('div');
        el.className = 'dock-region-content';
        el.id = `content-${id}`;
        map[id] = el;
    });
    return map;
}

function createMockEventBus() {
    const subs = {};
    return {
        publish(event, data) { (subs[event] || []).forEach(fn => fn(data)); },
        subscribe(event, fn) {
            if (!subs[event]) subs[event] = [];
            subs[event].push(fn);
            return () => { subs[event] = subs[event].filter(f => f !== fn); };
        }
    };
}

function makeFakeAppStore() {
    return {
        getState: () => ({ layout: null }),
        subscribe: vi.fn(() => vi.fn()),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('DockManager — additional coverage', () => {
    let rootElement;
    let layoutStore;
    let panelContentMap;
    let eventBus;

    beforeEach(() => {
        rootElement = document.createElement('div');
        document.body.appendChild(rootElement);
        eventBus = createMockEventBus();
        layoutStore = new DockPanelLayoutStore(eventBus);
        panelContentMap = createMockPanelContentMap();
    });

    afterEach(() => {
        document.body.removeChild(rootElement);
        vi.useRealTimers();
    });

    test('sets the move-mode title and restores the layout on cancel and save', () => {
        const moveHint = document.createElement('div');
        moveHint.className = 'move-selected-hint';
        moveHint.hidden = true;
        panelContentMap.map.appendChild(moveHint);
        const appStore = {
            getState: () => ({
                layout: null,
                activeLayerId: 'layer-2',
                layers: [{ id: 'layer-1', name: 'Garden' }, { id: 'layer-2', name: 'Workshop' }]
            }),
            subscribe: vi.fn(() => vi.fn()),
        };
        const dm = new DockManager(rootElement, layoutStore, panelContentMap, null, eventBus, appStore);
        dm.mount();

        eventBus.publish('move:selected-start-requested');
        expect(moveHint.hidden).toBe(false);
        expect(rootElement.querySelector('[data-panel-id="create"] .dock-region-title-text').textContent).toBe('Copy/Move Decorations');
        expect(rootElement.querySelector('[data-panel-id="layers"]')).toBeNull();
        rootElement.querySelector('.create-panel-cancel').click();
        expect(moveHint.hidden).toBe(true);
        expect(rootElement.querySelector('[data-panel-id="create"]')).toBeNull();
        expect(rootElement.querySelector('[data-panel-id="layers"]')).not.toBeNull();

        eventBus.publish('move:selected-start-requested');
        rootElement.querySelector('.create-panel-save').click();
        expect(moveHint.hidden).toBe(true);
        expect(rootElement.querySelector('[data-panel-id="create"]')).toBeNull();
        expect(rootElement.querySelector('[data-panel-id="layers"]')).not.toBeNull();
        dm.unmount();
    });

    // Lines 80-85: RibbonToolbar initialization
    // ─────────────────────────────────────────────────────────────────────────

    test('mounts ribbon toolbar when appService, appStore and zoomStore are provided', () => {
        const fakeAppService = { execute: vi.fn() };
        const dm = new DockManager(
            rootElement, layoutStore, panelContentMap,
            fakeAppService, eventBus, makeFakeAppStore(), {}
        );
        dm.mount();

        expect(rootElement.classList.contains('has-ribbon')).toBe(true);
        expect(rootElement.querySelector('.ribbon-toolbar')).not.toBeNull();
        expect(dm._ribbon).not.toBeNull();

        dm.unmount();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Panel dragging is disabled; divider resizing remains available.
    // ─────────────────────────────────────────────────────────────────────────

    test('does not initialize panel drag-and-drop when appService and eventBus are provided', () => {
        const fakeAppService = { execute: vi.fn() };
        const dm = new DockManager(rootElement, layoutStore, panelContentMap, fakeAppService, eventBus);
        dm.mount();

        expect(rootElement.querySelector('[data-drag-handle]')).toBeNull();
        expect(rootElement.querySelector('.drop-zone-overlay')).toBeNull();
        expect(rootElement.querySelector('.divider-resizer')).not.toBeNull();

        dm.unmount();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Lines 118-119: ribbon.unmount called during unmount
    // ─────────────────────────────────────────────────────────────────────────

    test('unmount calls ribbon.unmount when ribbon is present', () => {
        const fakeAppService = { execute: vi.fn() };
        const dm = new DockManager(
            rootElement, layoutStore, panelContentMap,
            fakeAppService, eventBus, makeFakeAppStore(), {}
        );
        dm.mount();

        const ribbonUnmountSpy = vi.spyOn(dm._ribbon, 'unmount');
        dm.unmount();

        expect(ribbonUnmountSpy).toHaveBeenCalledTimes(1);
        expect(dm._ribbon).toBeNull();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Lines 126-127: clearTimeout for pending resizeTimer on unmount
    // ─────────────────────────────────────────────────────────────────────────

    test('unmount cancels a pending resize debounce timer', () => {
        vi.useFakeTimers();
        const dm = new DockManager(rootElement, layoutStore, panelContentMap);
        dm.mount();

        window.dispatchEvent(new Event('resize'));
        expect(dm._resizeTimer).not.toBeNull();

        dm.unmount();
        expect(dm._resizeTimer).toBeNull();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Lines 166-168: fallback div for unknown node type
    // ─────────────────────────────────────────────────────────────────────────

    test('_renderNode returns a fallback panel-wrapper for unknown node types', () => {
        const dm = new DockManager(rootElement, layoutStore, panelContentMap);
        dm.mount();

        const fallback = dm._renderNode({ type: 'unknown' }, []);
        expect(fallback.tagName).toBe('DIV');
        expect(fallback.className).toBe('panel-wrapper');

        dm.unmount();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Line 200: dividerOptions.maxRatio when map panel is in second child
    // ─────────────────────────────────────────────────────────────────────────

    test('sets maxRatio constraint when map panel is in second child of split', () => {
        // Build layout where map is in second child
        const tree = createSplitNode('vertical', 0.5,
            createSplitNode('horizontal', 0.5,
                createPanelNode(PANEL_IDS.LAYERS),
                createPanelNode(PANEL_IDS.DECORATION_LIST)
            ),
            createPanelNode(PANEL_IDS.MAP)
        );
        layoutStore.setState(new DockLayoutConfiguration(tree));

        const dm = new DockManager(rootElement, layoutStore, panelContentMap);
        dm.mount();

        // Verify layout rendered without errors (maxRatio constraint set internally)
        expect(rootElement.querySelectorAll('.divider-resizer').length).toBeGreaterThan(0);

        dm.unmount();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Line 204: onRatioChange with appService fires ResizeDockCommand
    // ─────────────────────────────────────────────────────────────────────────

    test('divider drag fires ResizeDockCommand via appService (line 204)', () => {
        const fakeAppService = { execute: vi.fn() };
        const dm = new DockManager(rootElement, layoutStore, panelContentMap, fakeAppService, eventBus);
        dm.mount();

        // Find divider and mock its parent container to have non-zero dimensions
        const divider = rootElement.querySelector('.divider-resizer');
        const stackedContainer = divider.parentElement;
        stackedContainer.getBoundingClientRect = () => ({
            left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300
        });

        divider.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100 }));
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 200 }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 200 }));

        expect(fakeAppService.execute).toHaveBeenCalled();

        dm.unmount();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Line 205: onRatioChange without appService calls _onDividerMoved
    // ─────────────────────────────────────────────────────────────────────────

    test('divider drag updates layout store when no appService (line 205)', () => {
        const dm = new DockManager(rootElement, layoutStore, panelContentMap);
        dm.mount();

        const initialRatio = layoutStore.getState().tree.ratio;

        // Find root-level divider (vertical, inside the outermost split)
        const divider = rootElement.querySelector('.divider-resizer');
        const stackedContainer = divider.parentElement;
        stackedContainer.getBoundingClientRect = () => ({
            left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300
        });

        divider.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100 }));
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 250 }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 250 }));

        // The callback updates the layout store with new ratio
        const newRatio = layoutStore.getState().tree.ratio;
        expect(newRatio).not.toBe(initialRatio);

        dm.unmount();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Lines 308-315: _onDividerMoved updates layout store directly
    // ─────────────────────────────────────────────────────────────────────────

    test('_onDividerMoved updates ratio on the matching split node', () => {
        const dm = new DockManager(rootElement, layoutStore, panelContentMap);
        dm.mount();

        const splitNode = layoutStore.getState().tree; // root is a SplitNode
        dm._onDividerMoved(splitNode, 0.65);

        expect(layoutStore.getState().tree.ratio).toBeCloseTo(0.65);

        dm.unmount();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Lines 253-275: _enforceMinimumSizes — panel collapse when too small
    // ─────────────────────────────────────────────────────────────────────────

    test('_enforceMinimumSizes collapses panels narrower than MIN_PANEL_WIDTH', () => {
        const dm = new DockManager(rootElement, layoutStore, panelContentMap);
        dm.mount();

        // Override getBoundingClientRect to return small non-zero values
        rootElement.querySelectorAll('.panel-wrapper').forEach(panel => {
            panel.getBoundingClientRect = () => ({
                width: 50, height: 50, left: 0, top: 0, right: 50, bottom: 50
            });
        });

        dm._enforceMinimumSizes();

        const collapsed = rootElement.querySelectorAll('.panel-collapsed');
        expect(collapsed.length).toBeGreaterThan(0);

        dm.unmount();
    });

    test('_enforceMinimumSizes restores panels when dimensions are adequate (zero rect)', () => {
        const dm = new DockManager(rootElement, layoutStore, panelContentMap);
        dm.mount();

        // jsdom returns 0x0 → not tooNarrow/tooShort → executes else branch (lines 271-272)
        dm._enforceMinimumSizes();

        expect(rootElement.querySelectorAll('.panel-collapsed').length).toBe(0);

        dm.unmount();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Lines 239-243: window resize triggers debounced _enforceMinimumSizes
    // ─────────────────────────────────────────────────────────────────────────

    test('window resize event triggers _enforceMinimumSizes after debounce', () => {
        vi.useFakeTimers();
        const dm = new DockManager(rootElement, layoutStore, panelContentMap);
        dm.mount();

        const spy = vi.spyOn(dm, '_enforceMinimumSizes');
        window.dispatchEvent(new Event('resize'));
        expect(spy).not.toHaveBeenCalled(); // debounced

        vi.runAllTimers();
        expect(spy).toHaveBeenCalledTimes(1);

        dm.unmount();
    });

    test('rapid window resize clears previous debounce timer (line 239)', () => {
        vi.useFakeTimers();
        const dm = new DockManager(rootElement, layoutStore, panelContentMap);
        dm.mount();

        const spy = vi.spyOn(dm, '_enforceMinimumSizes');
        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new Event('resize')); // second triggers clearTimeout on line 239

        vi.runAllTimers();
        // Should only call once (second resize reset the timer)
        expect(spy).toHaveBeenCalledTimes(1);

        dm.unmount();
    });
});
