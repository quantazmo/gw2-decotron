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

    test('shows the Create panel during move mode and restores the normal panels on cancel and save', () => {
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
        expect(rootElement.querySelector('[data-panel-id="create"]')).not.toBeNull();
        expect(rootElement.querySelector('[data-panel-id="create"] .dock-region-title-text').textContent).toBe('Move Selected');
        expect(Array.from(rootElement.querySelectorAll('.create-panel-actions button')).map(button => button.textContent)).toEqual(['Save', 'Cancel']);
        expect(rootElement.querySelector('[data-panel-id="layers"]')).toBeNull();
        expect(rootElement.querySelector('[data-panel-id="decorationList"]')).toBeNull();
        const positionInputs = Array.from(rootElement.querySelectorAll('.move-position-input'));
        expect(positionInputs.map(input => input.dataset.axis)).toEqual(['x', 'y', 'z']);
        const copyInput = rootElement.querySelector('.move-as-copy-input');
        expect(copyInput.checked).toBe(false);
        const targetControl = rootElement.querySelector('.move-copy-target-control');
        const targetSelect = rootElement.querySelector('.move-copy-target-select');
        expect(targetControl.hidden).toBe(true);
        expect(targetSelect.value).toBe('layer-2');
        expect(Array.from(targetSelect.options).map(option => option.textContent)).toEqual(['Garden', 'Workshop', 'New Layer']);

        let requestedPosition;
        let requestedCopy;
        let requestedTarget;
        eventBus.subscribe('move:selected-position-requested', position => { requestedPosition = position; });
        eventBus.subscribe('move:selected-copy-changed', enabled => { requestedCopy = enabled; });
        eventBus.subscribe('move:selected-copy-target-changed', target => { requestedTarget = target; });
        eventBus.publish('move:selected-position-changed', { x: 10, y: 20, z: 30 });
        expect(positionInputs.map(input => input.value)).toEqual(['10', '20', '30']);
        positionInputs[0].value = '42';
        positionInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        expect(requestedPosition).toEqual({ x: 42, y: 20, z: 30 });
        copyInput.checked = true;
        copyInput.dispatchEvent(new Event('change', { bubbles: true }));
        expect(requestedCopy).toBe(true);
        expect(targetControl.hidden).toBe(false);
        targetSelect.value = 'layer-1';
        targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
        expect(requestedTarget).toBe('layer-1');

        rootElement.querySelector('.create-panel-cancel').click();
        expect(moveHint.hidden).toBe(true);
        expect(rootElement.querySelector('[data-panel-id="create"]')).toBeNull();
        expect(rootElement.querySelector('[data-panel-id="layers"]')).not.toBeNull();
        expect(rootElement.querySelector('[data-panel-id="decorationList"]')).not.toBeNull();

        eventBus.publish('move:selected-start-requested');
        expect(moveHint.hidden).toBe(false);
        rootElement.querySelector('.create-panel-save').click();
        expect(moveHint.hidden).toBe(true);
        expect(rootElement.querySelector('[data-panel-id="create"]')).toBeNull();
        expect(rootElement.querySelector('[data-panel-id="layers"]')).not.toBeNull();
        expect(rootElement.querySelector('[data-panel-id="decorationList"]')).not.toBeNull();

        dm.unmount();
    });

    test('shows read-only Start and editable Offset fields, publishes pattern values, and restores panels on cancel', () => {
        const selectedIds = ['seed-a', 'seed-b'];
        const selectionStore = { getSelectedIds: () => selectedIds };
        const dm = new DockManager(rootElement, layoutStore, panelContentMap, null, eventBus, makeFakeAppStore(), null, null, null, selectionStore);
        dm.mount();

        eventBus.publish('extend:pattern-start-requested');
        expect(rootElement.querySelector('[data-panel-id="create"] .dock-region-title-text').textContent).toBe('Extend Decoration Pattern');
        expect(rootElement.querySelector('[data-panel-id="layers"]')).toBeNull();
        expect(rootElement.querySelector('[data-panel-id="decorationList"]')).toBeNull();
        const countInput = rootElement.querySelector('.extend-pattern-count-input');
        const swapStartButton = rootElement.querySelector('.extend-pattern-swap-start-button');
        const methodSelect = rootElement.querySelector('.extend-pattern-method-select');
        expect(countInput.value).toBe('1');
        expect(countInput.min).toBe('1');
        expect(swapStartButton.hidden).toBe(false);
        expect(swapStartButton.textContent).toBe('Swap Start Decoration');
        expect(swapStartButton.getAttribute('aria-pressed')).toBe('false');
        expect(methodSelect.options).toHaveLength(1);
        expect(methodSelect.value).toBe('linear');
        const startX = rootElement.querySelector('[data-role="start"][data-group="position"][data-axis="x"]');
        const stepX = rootElement.querySelector('[data-role="step"][data-group="position"][data-axis="x"]');
        expect(startX.getAttribute('aria-label')).toBe('Start position x');
        expect(startX.readOnly).toBe(true);
        expect(stepX.readOnly).toBe(false);
        expect(stepX.getAttribute('aria-label')).toBe('Offset position x');
        expect(rootElement.querySelector('.extend-pattern-grid-header:nth-child(2)').textContent).toBe('Start');
        expect(rootElement.querySelector('.extend-pattern-grid-header:nth-child(3)').textContent).toBe('Offset');

        eventBus.publish('extend:pattern-seed-values-changed', {
            start: { position: { x: 10, y: 20, z: 30 }, rotation: { x: 1, y: 2, z: 3 } },
            step: { position: { x: 4, y: 5, z: 6 }, rotation: { x: 0.1, y: 0.2, z: 0.3 } }
        });
        expect(startX.value).toBe('10');
        expect(stepX.value).toBe('4');

        const optionUpdates = [];
        eventBus.subscribe('extend:pattern-options-changed', options => optionUpdates.push(options));
        countInput.value = '3';
        countInput.dispatchEvent(new Event('input', { bubbles: true }));
        swapStartButton.click();
        expect(optionUpdates).toEqual([
            expect.objectContaining({ method: 'linear', count: 3, swapDirection: false }),
            expect.objectContaining({ method: 'linear', count: 3, swapDirection: true })
        ]);
        expect(optionUpdates[0].start.position.x).toBe(10);
        expect(optionUpdates[0].step.position.x).toBe(4);
        expect(optionUpdates[1].start.position.x).toBe(14);
        expect(optionUpdates[1].step.position.x).toBe(-4);
        expect(swapStartButton.getAttribute('aria-pressed')).toBe('true');
        swapStartButton.click();
        expect(optionUpdates[2].start.position.x).toBe(10);
        expect(optionUpdates[2].step.position.x).toBe(4);
        expect(swapStartButton.getAttribute('aria-pressed')).toBe('false');
        swapStartButton.click();

        let saveRequest;
        eventBus.subscribe('extend:pattern-save-requested', options => { saveRequest = options; });
        countInput.value = '4';
        rootElement.querySelector('.create-panel-save').click();
        expect(saveRequest).toMatchObject({ method: 'linear', count: 4, swapDirection: true, step: { position: { x: -4 } } });
        expect(rootElement.querySelector('[data-panel-id="create"]')).not.toBeNull();
        eventBus.publish('extend:pattern-completed');
        expect(rootElement.querySelector('[data-panel-id="layers"]')).not.toBeNull();

        selectedIds.splice(1);
        eventBus.publish('extend:pattern-start-requested');
        expect(rootElement.querySelector('.extend-pattern-swap-start-button').hidden).toBe(true);
        rootElement.querySelector('.create-panel-cancel').click();
        expect(rootElement.querySelector('[data-panel-id="create"]')).toBeNull();
        expect(rootElement.querySelector('[data-panel-id="decorationList"]')).not.toBeNull();
        dm.unmount();
    });

    test('shows read-only fill offsets evenly divided by count plus one and publishes save requests', () => {
        const dm = new DockManager(rootElement, layoutStore, panelContentMap, null, eventBus, makeFakeAppStore());
        dm.mount();

        eventBus.publish('fill:pattern-start-requested');
        expect(rootElement.querySelector('[data-panel-id="create"] .dock-region-title-text').textContent).toBe('Fill Decoration Pattern');
        const methodSelect = rootElement.querySelector('.fill-pattern-method-select');
        const countInput = rootElement.querySelector('.fill-pattern-count-input');
        expect(methodSelect.getAttribute('aria-label')).toBe('Method');
        expect(methodSelect.options).toHaveLength(1);
        expect(methodSelect.value).toBe('linear');
        expect(methodSelect.options[0].textContent).toBe('Linear');
        expect(methodSelect.compareDocumentPosition(countInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        const startX = rootElement.querySelector('[data-role="start"][data-group="position"][data-axis="x"]');
        const offsetX = rootElement.querySelector('[data-role="step"][data-group="position"][data-axis="x"]');
        expect(startX.readOnly).toBe(true);
        expect(offsetX.readOnly).toBe(true);

        eventBus.publish('fill:pattern-seed-values-changed', {
            start: { position: { x: 10, y: 20, z: 30 }, rotation: { x: 1, y: 2, z: 3 } },
            end: { position: { x: 30, y: 60, z: 70 }, rotation: { x: 5, y: 10, z: 15 } }
        });
        expect(startX.value).toBe('10');
        expect(offsetX.value).toBe('10');

        const optionUpdates = [];
        eventBus.subscribe('fill:pattern-options-changed', options => optionUpdates.push(options));
        countInput.value = '3';
        countInput.dispatchEvent(new Event('input', { bubbles: true }));
        expect(offsetX.value).toBe('5');
        expect(optionUpdates).toEqual([{ count: 3 }]);

        let saveRequest;
        eventBus.subscribe('fill:pattern-save-requested', options => { saveRequest = options; });
        rootElement.querySelector('.create-panel-save').click();
        expect(saveRequest).toEqual({ count: 3 });
        eventBus.publish('fill:pattern-completed');
        expect(rootElement.querySelector('[data-panel-id="create"]')).toBeNull();
        dm.unmount();
    });

    // ─────────────────────────────────────────────────────────────────────────
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
