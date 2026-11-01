/**
 * Integration tests for rectangle selection workflow (US10)
 * Covers: draw rectangle to select, Ctrl+drag for additive,
 *         empty rectangle clears, mode switch preserves selection
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { ToolModeStore } from '../../src/ui/stores/ToolModeStore.js';
import { SelectionStore } from '../../src/ui/stores/SelectionStore.js';
import { SelectionRectangle } from '../../src/ui/components/SelectionRectangle.js';
import { SelectionLasso } from '../../src/ui/components/SelectionLasso.js';
import { EventBus } from '../../src/ui/EventBus.js';

// Build a map of decoration circles at known screen positions
function buildCircleMap(positions) {
    const map = new Map();
    for (const [id, cx, cy] of positions) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', cy);
        circle.setAttribute('r', '5');
        map.set(id, circle);
    }
    return map;
}

describe('Rectangle Selection Workflow Integration Tests', () => {
    let toolModeStore;
    let selectionStore;
    let eventBus;
    let svg;
    let selectionRect;
    let selectionLasso;
    let circleMap;

    beforeEach(() => {
        eventBus = new EventBus();
        eventBus.debugEnabled = false;
        toolModeStore = new ToolModeStore();
        selectionStore = new SelectionStore(eventBus);

        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        document.body.appendChild(svg);
        selectionRect = new SelectionRectangle(svg);
        selectionLasso = new SelectionLasso(svg);

        circleMap = buildCircleMap([
            ['d1', 50, 50],
            ['d2', 150, 150],
            ['d3', 250, 250],
            ['d4', 100, 100],
        ]);
    });

    afterEach(() => {
        if (svg.parentNode) svg.parentNode.removeChild(svg);
    });

    describe('default mode', () => {
        test('ToolModeStore defaults to "pan"', () => {
            expect(toolModeStore.getMode()).toBe('pan');
        });
    });

    describe('draw rectangle to select', () => {
        test('selecting rectangle enclosing d1 and d4 selects them', () => {
            toolModeStore.setMode('select');

            selectionRect.start(0, 0);
            selectionRect.update(130, 130);
            const bounds = selectionRect.finish();

            // Simulate the MapViewer rectangle-complete logic
            selectionStore.clearSelection();
            const ids = selectionRect.getDecorationsInBounds(bounds, circleMap);
            for (const id of ids) {
                selectionStore.toggleDecoration(id);
            }

            expect(selectionStore.isSelected('d1')).toBe(true);
            expect(selectionStore.isSelected('d4')).toBe(true);
            expect(selectionStore.isSelected('d2')).toBe(false);
            expect(selectionStore.isSelected('d3')).toBe(false);
        });

        test('selecting rectangle enclosing all decorations selects all', () => {
            toolModeStore.setMode('select');

            selectionRect.start(0, 0);
            selectionRect.update(300, 300);
            const bounds = selectionRect.finish();

            selectionStore.clearSelection();
            const ids = selectionRect.getDecorationsInBounds(bounds, circleMap);
            for (const id of ids) {
                selectionStore.toggleDecoration(id);
            }

            expect(selectionStore.getSelectionCount()).toBe(4);
        });
    });

    describe('draw lasso to select', () => {
        test('selects decorations inside a freeform polygon', () => {
            toolModeStore.setMode('lasso');

            selectionLasso.start(0, 0);
            selectionLasso.update(130, 0);
            selectionLasso.update(130, 130);
            selectionLasso.update(0, 130);
            const polygon = selectionLasso.finish();

            const ids = selectionLasso.getDecorationsInPolygon(polygon, circleMap);
            selectionStore.selectAll(ids);

            expect(selectionStore.isSelected('d1')).toBe(true);
            expect(selectionStore.isSelected('d4')).toBe(true);
            expect(selectionStore.isSelected('d2')).toBe(false);
            expect(selectionStore.isSelected('d3')).toBe(false);
        });

        test('respects a concave lasso boundary', () => {
            selectionLasso.start(0, 0);
            selectionLasso.update(200, 0);
            selectionLasso.update(200, 50);
            selectionLasso.update(50, 50);
            selectionLasso.update(50, 200);
            selectionLasso.update(0, 200);
            const polygon = selectionLasso.finish();

            expect(selectionLasso.getDecorationsInPolygon(polygon, circleMap)).toEqual(['d1']);
        });
    });

    describe('additive (Ctrl+drag)', () => {
        test('ctrl+drag adds to existing selection without clearing it', () => {
            // Pre-select d3
            selectionStore.selectDecoration('d3');
            expect(selectionStore.isSelected('d3')).toBe(true);

            toolModeStore.setMode('select');

            selectionRect.start(0, 0);
            selectionRect.update(130, 130);
            const bounds = selectionRect.finish();

            // Additive: toggle (Ctrl key simulated)
            const ids = selectionRect.getDecorationsInBounds(bounds, circleMap);
            for (const id of ids) {
                selectionStore.toggleDecoration(id);
            }

            // d3 should still be selected (it was already selected before)
            expect(selectionStore.isSelected('d3')).toBe(true);
            // d1 and d4 added
            expect(selectionStore.isSelected('d1')).toBe(true);
            expect(selectionStore.isSelected('d4')).toBe(true);
        });
    });

    describe('empty rectangle clears', () => {
        test('zero-size rectangle drag triggers clearSelection', () => {
            selectionStore.selectDecoration('d1');
            expect(selectionStore.isSelected('d1')).toBe(true);

            toolModeStore.setMode('select');

            selectionRect.start(300, 300);
            const bounds = selectionRect.finish(); // zero-size

            // Zero-drag: clear selection (hasMoved === false simulation)
            if (!bounds || (bounds.width <= 2 && bounds.height <= 2)) {
                selectionStore.clearSelection();
            }

            expect(selectionStore.getSelectionCount()).toBe(0);
        });
    });

    describe('mode switch preserves selection', () => {
        test('switching from select to pan preserves current selection', () => {
            selectionStore.selectDecoration('d1');
            selectionStore.toggleDecoration('d2');

            toolModeStore.setMode('select');
            toolModeStore.setMode('pan');

            // Selection should be unchanged
            expect(selectionStore.isSelected('d1')).toBe(true);
            expect(selectionStore.isSelected('d2')).toBe(true);
            expect(selectionStore.getSelectionCount()).toBe(2);
        });

        test('switching from pan to select preserves current selection', () => {
            selectionStore.selectDecoration('d3');

            expect(toolModeStore.getMode()).toBe('pan');
            toolModeStore.setMode('select');

            expect(selectionStore.isSelected('d3')).toBe(true);
            expect(selectionStore.getSelectionCount()).toBe(1);
        });
    });

    describe('ToolModeStore reactivity', () => {
        test('subscribe listener fires on mode change', () => {
            const changes = [];
            toolModeStore.subscribe((m) => changes.push(m));

            toolModeStore.setMode('select');
            toolModeStore.setMode('pan');

            expect(changes).toEqual(['select', 'pan']);
        });

        test('unsubscribe prevents future notifications', () => {
            const calls = [];
            const unsub = toolModeStore.subscribe((m) => calls.push(m));

            toolModeStore.setMode('select');
            unsub();
            toolModeStore.setMode('pan');

            expect(calls).toEqual(['select']);
        });
    });
});
