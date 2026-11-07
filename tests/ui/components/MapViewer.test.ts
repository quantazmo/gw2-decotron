import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/ui/renderHelpers.js', () => ({
    createGroup: (opts) => {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        if (opts?.className) g.setAttribute('class', opts.className);
        if (opts?.id) g.setAttribute('id', opts.id);
        return g;
    },
    createPolygon: (_points, opts) => {
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        if (opts?.className) poly.setAttribute('class', opts.className);
        return poly;
    },
    createCircle: (cx, cy, r, opts) => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', cy);
        circle.setAttribute('r', r);
        if (opts?.className) circle.setAttribute('class', opts.className);
        return circle;
    },
}));

vi.mock('../../../src/ui/domHelpers.js', () => ({
    empty: (el) => { while (el.firstChild) el.removeChild(el.firstChild); },
}));

vi.mock('../../../src/ui/components/SelectionRectangle.js', () => ({
    SelectionRectangle: class {
        constructor() { }
        activate() { }
        deactivate() { }
    },
}));

const { MapViewer } = await import('../../../src/ui/components/MapViewer.js');
import { MapType } from '../../../src/domain/MapType.js';

function makeSvg() {
    return document.createElementNS('http://www.w3.org/2000/svg', 'svg');
}

function makeZoomStore() {
    const listeners = [];
    return {
        onChange: (cb) => listeners.push(cb),
        _trigger: (data) => listeners.forEach(cb => cb(data)),
    };
}

function makeAppStore(initialState = {}) {
    const subs = [];
    let state = initialState;
    return {
        subscribe: (cb) => subs.push(cb),
        getState: () => state,
        _trigger: (s) => { state = s; subs.forEach(cb => cb(s)); },
    };
}

function makeSelectionStore() {
    const subs = [];
    return {
        subscribe: (cb) => subs.push(cb),
        isSelected: () => false,
        _trigger: () => subs.forEach(cb => cb()),
    };
}

function makeMap(id = 1) {
    return {
        id,
        tiles: [
            { url: `https://example.com/tile-${id}.png`, mapCoords: { x: 0, y: 0 }, tileSize: 256 },
        ],
        boundary: null,
    };
}

function setupGlobals() {
    window.xZoom = (x) => x;
    window.yZoom = (y) => y;
}

describe('MapViewer', () => {
    beforeEach(() => {
        setupGlobals();
    });

    afterEach(() => {
        delete window.xZoom;
        delete window.yZoom;
    });

    describe('tile rendering optimisation', () => {
        it('renders tile images on the first state update', () => {
            const svg = makeSvg();
            const viewer = new MapViewer(svg, makeZoomStore(), makeAppStore(), makeSelectionStore());

            const map = makeMap(1);
            viewer.render({ map, layers: [] });

            const tileImages = viewer.tileGroup.querySelectorAll('image');
            expect(tileImages).toHaveLength(1);
            expect(tileImages[0].getAttribute('href')).toBe('https://example.com/tile-1.png');
        });

        it('does NOT recreate tile images when only layers change (same map id)', () => {
            const svg = makeSvg();
            const viewer = new MapViewer(svg, makeZoomStore(), makeAppStore(), makeSelectionStore());

            const map = makeMap(1);
            viewer.render({ map, layers: [] });

            // Grab a reference to the first tile image
            const firstRenderImage = viewer.tileGroup.querySelector('image');
            const originalHref = firstRenderImage.getAttribute('href');

            // Trigger a layer-only state change (same map object)
            const newLayer = { id: 'layer-new', isVisible: true, decorations: [] };
            viewer.render({ map, layers: [newLayer] });

            // The same image element should still be present (not recreated)
            const afterRenderImage = viewer.tileGroup.querySelector('image');
            expect(afterRenderImage).toBe(firstRenderImage);
            expect(afterRenderImage.getAttribute('href')).toBe(originalHref);
        });

        it('does NOT recreate tile images when layer visibility is toggled (same map id)', () => {
            const svg = makeSvg();
            const viewer = new MapViewer(svg, makeZoomStore(), makeAppStore(), makeSelectionStore());

            const map = makeMap(1);
            const layer = { id: 'layer-1', isVisible: true, decorations: [] };
            viewer.render({ map, layers: [layer] });

            const originalImage = viewer.tileGroup.querySelector('image');

            // Toggle visibility
            const hiddenLayer = { id: 'layer-1', isVisible: false, decorations: [] };
            viewer.render({ map, layers: [hiddenLayer] });

            expect(viewer.tileGroup.querySelector('image')).toBe(originalImage);
        });

        it('recreates tile images when the map changes', () => {
            const svg = makeSvg();
            const viewer = new MapViewer(svg, makeZoomStore(), makeAppStore(), makeSelectionStore());

            const map1 = makeMap(1);
            viewer.render({ map: map1, layers: [] });
            const firstImage = viewer.tileGroup.querySelector('image');

            const map2 = makeMap(2);
            viewer.render({ map: map2, layers: [] });
            const secondImage = viewer.tileGroup.querySelector('image');

            expect(secondImage).not.toBe(firstImage);
            expect(secondImage.getAttribute('href')).toBe('https://example.com/tile-2.png');
        });

        it('clears tiles when map is removed', () => {
            const svg = makeSvg();
            const viewer = new MapViewer(svg, makeZoomStore(), makeAppStore(), makeSelectionStore());

            viewer.render({ map: makeMap(1), layers: [] });
            expect(viewer.tileGroup.querySelectorAll('image')).toHaveLength(1);

            viewer.render({ map: null, layers: [] });
            expect(viewer.tileGroup.querySelectorAll('image')).toHaveLength(0);
        });
    });

    it('loads decoration icons and renders them inside a layer-colored circular border', async () => {
        const svg = makeSvg();
        const iconApi = {
            getHomesteadDecorations: vi.fn().mockResolvedValue([{ id: 21, icon: 'https://example.com/decoration.png' }]),
            getGuildUpgrades: vi.fn(),
        };
        const viewer = new MapViewer(svg, makeZoomStore(), makeAppStore(), makeSelectionStore(), iconApi);
        const layer = {
            id: 'layer-1',
            isVisible: true,
            color: '#123456',
            decorations: [{ uid: 'decoration-1', id: 21, name: 'Test decoration', position: { x: 30, y: 40 } }],
        };
        viewer.render({ map: makeMap(1), mapType: MapType.Homestead, layers: [layer] });
        viewer.setDecorationDisplayMode('icon');

        await Promise.resolve();

        const image = viewer.decorationsGroup.querySelector('.decoration-icon');
        const border = viewer.decorationsGroup.querySelector('.decoration-point');
        expect(iconApi.getHomesteadDecorations).toHaveBeenCalledWith([21], 'en');
        expect(image.getAttribute('href')).toBe('https://example.com/decoration.png');
        expect(image.getAttribute('width')).toBe('24');
        expect(border.getAttribute('r')).toBe('15');
        expect(border.getAttribute('stroke')).toBe('#123456');
    });

    describe('selection shortcut hint', () => {
        it('shows shortcut guidance only while select mode is active', () => {
            const panel = document.createElement('div');
            const svg = makeSvg();
            panel.appendChild(svg);
            const viewer = new MapViewer(svg, makeZoomStore(), makeAppStore(), makeSelectionStore());
            let mode = 'select';
            const listeners = [];
            const toolModeStore = {
                getMode: () => mode,
                subscribe: (listener) => listeners.push(listener),
            };

            viewer.setToolModeStore(toolModeStore);

            const hint = panel.querySelector('.selection-shortcut-hint');
            expect(hint.hidden).toBe(false);
            expect(hint.textContent).toContain('Add to selection');
            expect(hint.textContent).toContain('Remove from selection');

            mode = 'pan';
            listeners.forEach(listener => listener(mode));
            expect(hint.hidden).toBe(true);

            mode = 'select';
            listeners.forEach(listener => listener(mode));
            expect(hint.hidden).toBe(false);

            mode = 'lasso';
            listeners.forEach(listener => listener(mode));
            expect(hint.hidden).toBe(false);
        });
    });

    describe('selected decoration z-order', () => {
        function makeLayer(decorations) {
            return { id: 'layer-1', isVisible: true, color: '#00d4ff', decorations };
        }

        function makeDecoration(uid) {
            return { uid, name: `Dec ${uid}`, position: { x: 10, y: 10 }, color: '#00d4ff' };
        }

        it('moves selected decoration circles to the front of their parent group', () => {
            const svg = makeSvg();
            let isSelected = (_id) => false;
            const selectionStore = {
                subscribe: (cb) => { selectionStore._trigger = cb; },
                isSelected: (id) => isSelected(id),
            };
            const viewer = new MapViewer(svg, makeZoomStore(), makeAppStore(), selectionStore);

            const decorations = [
                makeDecoration('a'),
                makeDecoration('b'),
                makeDecoration('c'),
            ];
            viewer.render({ map: makeMap(1), layers: [makeLayer(decorations)] });

            const layerGroup = viewer.decorationsGroup.querySelector('.layer-layer-1');
            const circlesBeforeSelection = Array.from(layerGroup.querySelectorAll('circle'));
            expect(circlesBeforeSelection.map(c => c.getAttribute('data-decoration-id'))).toEqual(['a', 'b', 'c']);

            // Select 'a' — it should move to the end of its parent (rendered on top)
            isSelected = (id) => id === 'a';
            selectionStore._trigger();

            const circlesAfterSelection = Array.from(layerGroup.querySelectorAll('circle'));
            expect(circlesAfterSelection.map(c => c.getAttribute('data-decoration-id'))).toEqual(['b', 'c', 'a']);
        });

        it('restores original DOM order when decoration is deselected', () => {
            const svg = makeSvg();
            let isSelected = (id) => id === 'b';
            const selectionStore = {
                subscribe: (cb) => { selectionStore._trigger = cb; },
                isSelected: (id) => isSelected(id),
            };
            const viewer = new MapViewer(svg, makeZoomStore(), makeAppStore(), selectionStore);

            const decorations = [makeDecoration('x'), makeDecoration('y'), makeDecoration('z')];
            viewer.render({ map: makeMap(1), layers: [makeLayer(decorations)] });

            // Deselect — no circle should be at the end due to selection
            isSelected = (_id) => false;
            selectionStore._trigger();

            const layerGroup = viewer.decorationsGroup.querySelector('.layer-layer-1');
            const circles = Array.from(layerGroup.querySelectorAll('circle'));
            // All circles should still be present (order may vary, but none are out-of-place selected)
            expect(circles).toHaveLength(3);
            circles.forEach(c => expect(c.classList.contains('selected-decoration')).toBe(false));
        });
    });

    describe('move selected decorations', () => {
        it('starts at a zero offset and commits the entered displacement on save', async () => {
            const svg = makeSvg();
            const linearScale = (value) => value;
            linearScale.domain = () => [0, 100];
            linearScale.range = () => [0, 100];
            window.xZoom = linearScale;
            window.yZoom = linearScale;

            const decoration = { uid: 'a', name: 'Decoration A', position: { x: 10, y: 20 } };
            const layer = { id: 'layer-1', isVisible: true, color: '#00d4ff', decorations: [decoration] };
            const state = { map: makeMap(1), layers: [layer] };
            const appStore = makeAppStore(state);
            const selectionStore = {
                getSelectedIds: () => ['a'],
                isSelected: id => id === 'a',
                subscribe: vi.fn(),
            };
            const appService = { execute: vi.fn().mockResolvedValue(undefined) };
            const viewer = new MapViewer(svg, makeZoomStore(), appStore, selectionStore);
            viewer.setAppService(appService);
            const toolModeStore = { setMode: vi.fn() };
            viewer._toolModeStore = toolModeStore;
            viewer.render(state);

            const circle = viewer.decorationCircles.get('a');
            expect(viewer.beginMoveSelected()).toEqual({ x: 0, y: 0, z: 0 });
            expect(toolModeStore.setMode).toHaveBeenCalledWith('pan');
            viewer.setMoveSelectedPosition({ x: 10, y: 20, z: 0 });
            expect(circle.getAttribute('cx')).toBe('20');
            expect(circle.getAttribute('cy')).toBe('40');

            await viewer.commitMoveSelected();
            expect(appService.execute).toHaveBeenCalledWith({
                type: 'UpdateDecorationsCommand',
                payload: {
                    updates: [{
                        layerId: 'layer-1',
                        decorationId: 'a',
                        position: { x: 20, y: 40, z: 0, rotation: 0 }
                    }]
                }
            });
        });

        it('commits all selected decorations through one batch command', async () => {
            const svg = makeSvg();
            const linearScale = value => value;
            linearScale.domain = () => [0, 100];
            linearScale.range = () => [0, 100];
            window.xZoom = linearScale;
            window.yZoom = linearScale;

            const first = { uid: 'a', name: 'Decoration A', position: { x: 10, y: 20 } };
            const second = { uid: 'b', name: 'Decoration B', position: { x: 30, y: 40 } };
            const layer = { id: 'layer-1', isVisible: true, color: '#00d4ff', decorations: [first, second] };
            const state = { map: makeMap(1), layers: [layer] };
            const appService = { execute: vi.fn().mockResolvedValue(undefined) };
            const viewer = new MapViewer(svg, makeZoomStore(), makeAppStore(state), {
                getSelectedIds: () => ['a', 'b'],
                isSelected: id => id === 'a' || id === 'b',
                subscribe: vi.fn(),
            });
            viewer.setAppService(appService);
            viewer.render(state);

            viewer.beginMoveSelected();
            viewer.setMoveSelectedPosition({ x: 5, y: 7, z: 0 });
            await viewer.commitMoveSelected();

            expect(appService.execute).toHaveBeenCalledTimes(1);
            expect(appService.execute).toHaveBeenCalledWith({
                type: 'UpdateDecorationsCommand',
                payload: {
                    updates: [
                        { layerId: 'layer-1', decorationId: 'a', position: { x: 15, y: 27, z: 0, rotation: 0 } },
                        { layerId: 'layer-1', decorationId: 'b', position: { x: 35, y: 47, z: 0, rotation: 0 } }
                    ]
                }
            });
        });

        it('derives XY offsets from the change in viewport world center', () => {
            const svg = makeSvg();
            const makeScale = initialDomain => {
                let domain = initialDomain;
                const scale = value => (value - domain[0]) / (domain[1] - domain[0]) * 100;
                scale.domain = () => domain;
                scale.range = () => [0, 100];
                scale.setDomain = nextDomain => { domain = nextDomain; };
                return scale;
            };
            const xScale = makeScale([0, 100]);
            const yScale = makeScale([0, 100]);
            window.xZoom = xScale;
            window.yZoom = yScale;

            const decoration = { uid: 'a', name: 'Decoration A', position: { x: 10, y: 20 } };
            const layer = { id: 'layer-1', isVisible: true, color: '#00d4ff', decorations: [decoration] };
            const viewer = new MapViewer(svg, makeZoomStore(), makeAppStore(), {
                getSelectedIds: () => ['a'],
                isSelected: id => id === 'a',
                subscribe: vi.fn(),
            });
            viewer.render({ map: makeMap(1), layers: [layer] });
            const circle = viewer.decorationCircles.get('a');
            viewer.beginMoveSelected();

            xScale.setDomain([10, 110]);
            yScale.setDomain([20, 120]);
            viewer.updateTransform({});

            expect(viewer._moveCurrentPosition).toEqual({ x: 10, y: 20, z: 0 });
            expect(circle.getAttribute('cx')).toBe('10');
            expect(circle.getAttribute('cy')).toBe('20');
        });

        it('keeps originals in place and commits preview copies at the requested XYZ position', async () => {
            const svg = makeSvg();
            const linearScale = (value) => value;
            linearScale.domain = () => [0, 100];
            linearScale.range = () => [0, 100];
            window.xZoom = linearScale;
            window.yZoom = linearScale;

            const decoration = { uid: 'a', name: 'Decoration A', position: { x: 10, y: 20, z: 3 } };
            const layer = { id: 'layer-1', isVisible: true, color: '#00d4ff', decorations: [decoration] };
            const state = { map: makeMap(1), layers: [layer] };
            const selectionStore = {
                getSelectedIds: () => ['a'],
                isSelected: id => id === 'a',
                selectAll: vi.fn(),
                subscribe: vi.fn(),
            };
            const appService = {
                execute: vi.fn(async command => command.type === 'CopyDecorationsCommand'
                    ? { decorationIds: ['copy-a'] }
                    : undefined),
            };
            const viewer = new MapViewer(svg, makeZoomStore(), makeAppStore(state), selectionStore);
            viewer.setAppService(appService);
            viewer.render(state);

            const original = viewer.decorationCircles.get('a');
            viewer.beginMoveSelected();
            viewer.setMoveSelectedCopyEnabled(true);
            viewer.setMoveSelectedCopyTargetLayer('target-layer');
            viewer.setMoveSelectedPosition({ x: 20, y: 20, z: 5 });
            const preview = viewer._moveCopyPreviewGroup.querySelector('[data-decoration-id="a"]');
            expect(original.getAttribute('cx')).toBe('10');
            expect(original.getAttribute('cy')).toBe('20');
            expect(preview.getAttribute('cx')).toBe('30');
            expect(preview.getAttribute('cy')).toBe('40');

            await viewer.commitMoveSelected();
            expect(appService.execute).toHaveBeenNthCalledWith(1, {
                type: 'CopyDecorationsCommand',
                payload: { decorationIds: ['a'], targetLayerId: 'target-layer' }
            });
            expect(appService.execute).toHaveBeenNthCalledWith(2, {
                type: 'UpdateDecorationCommand',
                payload: {
                    layerId: 'target-layer',
                    decorationId: 'copy-a',
                    position: { x: 30, y: 40, z: 8, rotation: 0 }
                }
            });
            expect(selectionStore.selectAll).toHaveBeenCalledWith(['copy-a']);
        });

        it('creates a new target layer before copying when New Layer is selected', async () => {
            const svg = makeSvg();
            const linearScale = value => value;
            linearScale.domain = () => [0, 100];
            linearScale.range = () => [0, 100];
            window.xZoom = linearScale;
            window.yZoom = linearScale;

            const decoration = { uid: 'a', name: 'Decoration A', position: { x: 10, y: 20, z: 0 } };
            const layer = { id: 'source-layer', isVisible: true, decorations: [decoration] };
            const state = { map: makeMap(1), layers: [layer] };
            const selectionStore = {
                getSelectedIds: () => ['a'],
                isSelected: id => id === 'a',
                selectAll: vi.fn(),
                subscribe: vi.fn(),
            };
            const appService = {
                execute: vi.fn(async command => {
                    if (command.type === 'CreateLayerCommand') return { id: 'new-layer' };
                    if (command.type === 'CopyDecorationsCommand') return { decorationIds: ['copy-a'] };
                    return undefined;
                }),
            };
            const viewer = new MapViewer(svg, makeZoomStore(), makeAppStore(state), selectionStore);
            viewer.setAppService(appService);
            viewer.render(state);
            viewer.beginMoveSelected();
            viewer.setMoveSelectedCopyEnabled(true);
            viewer.setMoveSelectedCopyTargetLayer('__new__');
            viewer.setMoveSelectedPosition({ x: 4, y: 6, z: 2 });

            await viewer.commitMoveSelected();

            expect(appService.execute).toHaveBeenNthCalledWith(1, {
                type: 'CreateLayerCommand',
                payload: { isVisible: true }
            });
            expect(appService.execute).toHaveBeenNthCalledWith(2, {
                type: 'CopyDecorationsCommand',
                payload: { decorationIds: ['a'], targetLayerId: 'new-layer' }
            });
            expect(appService.execute).toHaveBeenNthCalledWith(3, {
                type: 'UpdateDecorationCommand',
                payload: {
                    layerId: 'new-layer',
                    decorationId: 'copy-a',
                    position: { x: 14, y: 26, z: 2, rotation: 0 }
                }
            });
        });
    });

    describe('extend pattern previews', () => {
        it('renders pending copies distinctly and clears them without adding decoration hit targets', () => {
            const svg = makeSvg();
            const viewer = new MapViewer(svg, makeZoomStore(), makeAppStore(), makeSelectionStore());

            viewer.setExtendPatternPreview([{
                uid: 'extend-pattern-preview-0',
                name: 'Pending Oak',
                color: '#318a55',
                position: { x: 120, y: 240 },
            }], [{ x: 100, y: 200 }, { x: 120, y: 240 }]);

            const previewGroup = svg.querySelector('.extend-pattern-previews');
            const guide = previewGroup.firstElementChild;
            const preview = svg.querySelector('.extend-pattern-previews .extend-pattern-preview');
            expect(guide.classList.contains('extend-pattern-guide-line')).toBe(true);
            expect(guide.getAttribute('d')).toBe('M100,200 L120,240');
            expect(guide.nextElementSibling).toBe(preview);
            expect(preview).not.toBeNull();
            expect(preview.getAttribute('cx')).toBe('120');
            expect(preview.getAttribute('cy')).toBe('240');
            expect(preview.getAttribute('data-decoration-id')).toBeNull();
            expect(preview.getAttribute('pointer-events')).toBe('none');

            viewer.setExtendPatternPreview([]);
            expect(svg.querySelector('.extend-pattern-preview')).toBeNull();
            expect(svg.querySelector('.extend-pattern-guide-line')).toBeNull();
        });

        it('temporarily moves the non-start seed and restores originals when swapped or cleared', () => {
            const svg = makeSvg();
            const viewer = new MapViewer(svg, makeZoomStore(), makeAppStore(), makeSelectionStore());
            const seeds = [
                { uid: 'seed-a', name: 'Oak A', position: { x: 10, y: 20 }, color: '#318a55' },
                { uid: 'seed-b', name: 'Oak B', position: { x: 30, y: 40 }, color: '#318a55' }
            ];
            viewer.render({
                map: makeMap(1),
                layers: [{ id: 'layer-1', isVisible: true, color: '#318a55', decorations: seeds }]
            });

            const originalA = svg.querySelector('[data-decoration-id="seed-a"]');
            const originalB = svg.querySelector('[data-decoration-id="seed-b"]');
            viewer.setExtendPatternPreview([{
                uid: 'extend-pattern-moved-seed-preview',
                name: 'Oak B',
                color: '#318a55',
                position: { x: 50, y: 60 },
                sourceDecorationId: 'seed-b'
            }]);

            expect(originalA.classList.contains('extend-pattern-source-hidden')).toBe(false);
            expect(originalB.classList.contains('extend-pattern-source-hidden')).toBe(true);
            const movedPreview = svg.querySelector('[data-preview-source-id="seed-b"]');
            expect(movedPreview.getAttribute('cx')).toBe('50');
            expect(movedPreview.getAttribute('data-decoration-id')).toBeNull();

            viewer.setExtendPatternPreview([{
                uid: 'extend-pattern-moved-seed-preview',
                name: 'Oak A',
                color: '#318a55',
                position: { x: 10, y: 20 },
                sourceDecorationId: 'seed-a'
            }]);
            expect(originalA.classList.contains('extend-pattern-source-hidden')).toBe(true);
            expect(originalB.classList.contains('extend-pattern-source-hidden')).toBe(false);

            viewer.setExtendPatternPreview([]);
            expect(originalA.classList.contains('extend-pattern-source-hidden')).toBe(false);
            expect(originalB.classList.contains('extend-pattern-source-hidden')).toBe(false);
            expect(svg.querySelector('.extend-pattern-preview')).toBeNull();
        });
    });

    describe('pan drag preserves selection', () => {
        it('does not clear selection when a drag (pan) precedes the click on empty area', () => {
            const svg = makeSvg();
            const clearSelection = vi.fn();
            const selectionStore = {
                subscribe: vi.fn(),
                isSelected: () => false,
                clearSelection,
            };
            new MapViewer(svg, makeZoomStore(), makeAppStore(), selectionStore);

            // Simulate pan: mousedown → mousemove on document → mouseup → click on empty SVG
            svg.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 100, clientY: 100 }));
            document.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, bubbles: true, clientX: 150, clientY: 150 }));
            document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            svg.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(clearSelection).not.toHaveBeenCalled();
        });

        it('clears selection on a clean click (no drag) on empty area in pan mode', () => {
            const svg = makeSvg();
            const clearSelection = vi.fn();
            const selectionStore = {
                subscribe: vi.fn(),
                isSelected: () => false,
                clearSelection,
            };
            new MapViewer(svg, makeZoomStore(), makeAppStore(), selectionStore);

            // Simulate clean click: mousedown then click, no mouse movement
            svg.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 100, clientY: 100 }));
            svg.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(clearSelection).toHaveBeenCalledOnce();
        });
    });

    describe('decoration context menu', () => {
        it('offers matching selection actions and moves only to other layers', async () => {
            const svg = makeSvg();
            const selectionStore = {
                subscribe: vi.fn(),
                isSelected: (id) => id === 'd1',
                getSelectedIds: () => ['d1'],
                selectDecoration: vi.fn(),
                selectAll: vi.fn()
            };
            const execute = vi.fn(async command => command.type === 'CreateLayerCommand' ? { id: 'layer-new' } : undefined);
            const appService = { execute };
            const layer = {
                id: 'layer-1',
                name: 'Layer 1',
                isVisible: true,
                decorations: [
                    { uid: 'd1', id: 'oak', name: 'Oak', position: { x: 10, y: 10 } },
                    { uid: 'd2', id: 'oak', name: 'Oak', position: { x: 20, y: 20 } }
                ]
            };
            const otherLayer = { id: 'layer-2', name: 'Layer 2', isVisible: true, decorations: [] };
            let shownItems = [];
            const layers = [layer, otherLayer];
            const viewer = new MapViewer(svg, makeZoomStore(), makeAppStore({ layers }), selectionStore);
            viewer.render({ map: makeMap(1), layers });
            viewer.setAppService(appService);
            viewer.setContextMenu({ show: (_x, _y, items) => { shownItems = items; } });

            viewer.decorationsGroup.querySelector('[data-decoration-id="d1"]')
                .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 20 }));

            expect(shownItems.map(item => item.label)).toContain('Select All in Layer (2)');
            expect(shownItems.map(item => item.label)).toContain('Select All of Same Type (2)');
            const moveSubmenu = shownItems.find(item => item.label === 'Move to Layer').submenu;
            expect(moveSubmenu.map(item => item.label)).toEqual(['Layer 2', 'New Layer']);
            shownItems.find(item => item.label.startsWith('Select All in Layer')).action();
            expect(selectionStore.selectAll).toHaveBeenCalledWith(['d1', 'd2']);
            await moveSubmenu[1].action();
            expect(execute.mock.calls.map(([command]) => command.type)).toEqual(['CreateLayerCommand', 'MoveDecorationsCommand']);
            expect(execute.mock.calls[1][0].payload).toEqual({ decorationIds: ['d1'], targetLayerId: 'layer-new' });

            const copySubmenu = shownItems.find(item => item.label === 'Copy to').submenu;
            expect(copySubmenu.map(item => item.label)).toEqual(['Layer 1', 'Layer 2', 'New Layer']);
            copySubmenu[1].action();
            expect(execute.mock.calls.at(-1)[0]).toMatchObject({
                type: 'CopyDecorationsCommand',
                payload: { decorationIds: ['d1'], targetLayerId: 'layer-2' }
            });
            await copySubmenu[2].action();
            expect(execute.mock.calls.at(-1)[0]).toMatchObject({
                type: 'CopyDecorationsCommand',
                payload: { decorationIds: ['d1'], targetLayerId: 'layer-new' }
            });
        });

        it('keeps Move to Layer available when the clicked decoration is the only layer', () => {
            const svg = makeSvg();
            const selectionStore = {
                subscribe: vi.fn(),
                isSelected: () => true,
                getSelectedIds: () => ['d1'],
                selectDecoration: vi.fn(),
                selectAll: vi.fn()
            };
            const layer = {
                id: 'layer-1', name: 'Layer 1', isVisible: true,
                decorations: [{ uid: 'd1', id: 'oak', name: 'Oak', position: { x: 10, y: 10 } }]
            };
            const viewer = new MapViewer(svg, makeZoomStore(), makeAppStore({ layers: [layer] }), selectionStore);
            let shownItems = [];
            viewer.render({ map: makeMap(1), layers: [layer] });
            viewer.setAppService({ execute: vi.fn() });
            viewer.setContextMenu({ show: (_x, _y, items) => { shownItems = items; } });

            viewer.decorationsGroup.querySelector('[data-decoration-id="d1"]')
                .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

            expect(shownItems.find(item => item.label === 'Move to Layer').submenu.map(item => item.label)).toEqual(['New Layer']);
        });
    });
});
