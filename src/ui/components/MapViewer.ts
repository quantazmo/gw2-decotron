/**
 * MapViewer Component
 * Encapsulates SVG map element and rendering
 * Subscribes to ZoomStore changes
 * Renders: tiles, boundary, all layers' circles
 */

import * as renderHelpers from '../renderHelpers.js';
import * as domHelpers from '../domHelpers.js';
import { SelectionRectangle } from './SelectionRectangle.js';
import type { GW2Map } from '../../domain/GW2Map.js';
import type { Layer } from '../../domain/Layer.js';
import type { Decoration } from '../../domain/Decoration.js';

declare global {
    interface Window {
        xZoom?: (value: number) => number;
        yZoom?: (value: number) => number;
    }
}

interface MapViewerState {
    map: GW2Map | null;
    layers: MapViewerLayer[];
}

interface ZoomStoreLike {
    onChange?: (listener: (data: unknown) => void) => unknown;
}

interface AppStoreLike {
    subscribe?: (listener: (state: MapViewerState) => void) => unknown;
    getState: () => MapViewerState;
}

interface SelectionStoreLike {
    subscribe?: (listener: () => void) => unknown;
    isSelected: (id: string) => boolean;
    selectDecoration: (id: string) => void;
    toggleDecoration: (id: string) => void;
    clearSelection: () => void;
    getSelectedIds: () => string[];
    removeFromSelection: (ids: string[]) => void;
    addToSelection: (ids: string[]) => void;
    selectAll: (ids: string[]) => void;
}

interface ToolModeStoreLike {
    getMode: () => string;
    subscribe: (listener: (mode: string) => void) => unknown;
}

interface AppServiceLike {
    execute: (command: { type: string; payload: unknown }) => Promise<unknown>;
}

interface ContextMenuLike {
    show: (x: number, y: number, items: Array<{ label: string; action?: () => void; submenu?: Array<{ label: string; action: () => void }> }>) => void;
}

interface MapViewerDecoration {
    uid: string;
    name?: string;
    color?: string;
    position: { x: number; y: number };
}

interface MapViewerLayer {
    id: string;
    name: string;
    isVisible: boolean;
    color?: string;
    decorations?: Map<string, Decoration> | Decoration[];
    getAllDecorations?: () => Decoration[];
}

const TILE_EDGE_OVERDRAW = 0.5;

class MapViewer {
    private svgElement: SVGSVGElement;
    private zoomStore: ZoomStoreLike;
    private appStore: AppStoreLike;
    private selectionStore: SelectionStoreLike | null;
    private appService: AppServiceLike | null;
    private tileGroup!: SVGGElement;
    private boundaryGroup!: SVGGElement;
    private layersGroup!: SVGGElement;
    private decorationsGroup!: SVGGElement;
    private currentMap: GW2Map | null;
    private currentLayers: MapViewerLayer[];
    private _lastRenderedMapId: number | null;
    private decorationCircles: Map<string, SVGCircleElement>;
    private _contextMenu: ContextMenuLike | null;
    private _toolModeStore: ToolModeStoreLike | null;
    private _selectionRect: SelectionRectangle | null;
    private _containerGroup: SVGGElement | null;
    private _selectionIndicator: HTMLDivElement | null = null;
    private _selectionShortcutHint: HTMLDivElement | null = null;
    private _indicatorMouseX = 0;
    private _indicatorMouseY = 0;
    private _indicatorCtrl = false;
    private _indicatorShift = false;

    constructor(svgElement: SVGSVGElement, zoomStore: ZoomStoreLike, appStore: AppStoreLike, selectionStore: SelectionStoreLike | null) {
        this.svgElement = svgElement;
        this.zoomStore = zoomStore;
        this.appStore = appStore;
        this.selectionStore = selectionStore || null;
        this.appService = null;

        // Cache rendered data to avoid recreating on zoom
        this.currentMap = null;
        this.currentLayers = [];

        // Track the last rendered map id to skip unnecessary tile re-renders
        this._lastRenderedMapId = null;

        // Cache decoration circles for fast updates during zoom
        this.decorationCircles = new Map(); // Map<decorationId, SVGCircleElement>

        /** @type {ContextMenu|null} Shared context menu instance */
        this._contextMenu = null;

        /** @type {import('../stores/ToolModeStore.js').ToolModeStore|null} */
        this._toolModeStore = null;

        /** @type {SelectionRectangle|null} */
        this._selectionRect = null;

        /** @type {SVGGElement|null} The top-level container group (has the margin translate transform) */
        this._containerGroup = null;

        this.initialize();
        this.subscribeToChanges();
    }

    /**
     * Initialize SVG structure
     */
    initialize(): void {
        // Create viewBox and ensure SVG is set up properly
        this.svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');

        // Find the existing transformed group (created by legacy code) or select first group
        // This ensures MapViewer uses the same coordinate space as legacy rendering
        let containerGroup = this.svgElement.querySelector('g');

        // If no group exists, create a main container group
        if (!containerGroup) {
            containerGroup = renderHelpers.createGroup({ className: 'map-container' });
            this.svgElement.appendChild(containerGroup);
        }

        // Store reference so coordinate correction can be applied during rectangle selection
        this._containerGroup = containerGroup;

        // Create groups for organized rendering inside the container group
        this.tileGroup = renderHelpers.createGroup({ className: 'tiles' });
        this.boundaryGroup = renderHelpers.createGroup({ className: 'boundary' });
        this.layersGroup = renderHelpers.createGroup({ className: 'layers' });
        this.decorationsGroup = renderHelpers.createGroup({ className: 'decorations' });

        // Append to the container group instead of directly to SVG
        containerGroup.appendChild(this.tileGroup);
        containerGroup.appendChild(this.boundaryGroup);
        containerGroup.appendChild(this.layersGroup);
        containerGroup.appendChild(this.decorationsGroup);

        // Bind click handlers for decoration selection
        this._bindSelectionHandlers();
        // Bind pointer handlers for rectangle selection (select mode)
        this._bindRectangleSelectHandlers();
    }

    /**
     * Subscribe to store changes
     */
    subscribeToChanges(): void {
        // Listen to zoom/pan changes
        if (this.zoomStore && this.zoomStore.onChange) {
            this.zoomStore.onChange((data) => {
                this.updateTransform(data);
            });
        }

        // Listen to app state changes
        if (this.appStore && this.appStore.subscribe) {
            this.appStore.subscribe((state) => {
                this.render(state);
            });
        }

        // Listen to selection changes to update highlights
        if (this.selectionStore && this.selectionStore.subscribe) {
            this.selectionStore.subscribe(() => {
                this._updateSelectionHighlights();
            });
        }
    }

    /**
     * Update SVG transform for zoom and pan
     * @param {Object} transform - Transform with sx, sy, tx, ty
     */
    updateTransform(_transform: unknown): void {
        // Update positions of existing elements instead of recreating them
        // The xZoom/yZoom functions are updated globally before this is called
        if (this.currentMap) {
            this.updateTilePositions(this.currentMap);
            this.updateBoundaryPosition(this.currentMap);
            this.updateDecorationPositions(this.currentLayers);
        }
    }

    /**
     * Render the entire map based on app state
     * @param {Object} state - App state
     */
    render(state: MapViewerState): void {
        if (!state.map) {
            this.clear();
            return;
        }

        // Cache state for zoom updates
        this.currentMap = state.map;
        this.currentLayers = state.layers || [];

        // Only re-render tiles and boundary when the map itself changes.
        // Layer operations (add, visibility toggle) must not recreate tile
        // <image> elements because doing so causes the browser to reload the
        // tile images, producing a visible flicker.
        if (state.map.id !== this._lastRenderedMapId) {
            this.renderMap(state.map);
            this.renderBoundary(state.map);
            this._lastRenderedMapId = state.map.id;
        }

        this.renderLayers(state.layers);
    }

    /**
     * Render map tiles
     * @param {GW2Map} map - The map to render
     */
    renderMap(map: GW2Map): void {
        domHelpers.empty(this.tileGroup);

        if (!map.tiles || !Array.isArray(map.tiles)) {
            return;
        }

        // Use global xZoom/yZoom functions for coordinate transformation
        const xZoom = window.xZoom;
        const yZoom = window.yZoom;
        if (typeof xZoom !== 'function' || typeof yZoom !== 'function') {
            console.error('xZoom/yZoom functions not available');
            return;
        }

        map.tiles.forEach(tile => {
            if (!tile.mapCoords || tile.tileSize === undefined || !tile.url) return;
            const tileWidth = tile.tileSizeX ?? tile.tileSize;
            const tileHeight = tile.tileSizeY ?? tile.tileSize;
            // Create SVG image element for tile
            const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');

            // Convert world coordinates to screen coordinates
            const x1 = xZoom(tile.mapCoords.x);
            const x2 = xZoom(tile.mapCoords.x + tileWidth);
            const y1 = yZoom(tile.mapCoords.y + tileHeight);
            const y2 = yZoom(tile.mapCoords.y);
            image.setAttribute('href', tile.url);
            image.setAttribute('x', String(x1 - TILE_EDGE_OVERDRAW));
            image.setAttribute('y', String(y1 - TILE_EDGE_OVERDRAW));
            image.setAttribute('width', String(x2 - x1 + TILE_EDGE_OVERDRAW * 2));
            image.setAttribute('height', String(y2 - y1 + TILE_EDGE_OVERDRAW * 2));
            image.setAttribute('class', 'tile');
            image.setAttribute('preserveAspectRatio', 'none');

            this.tileGroup.appendChild(image);
        });
    }

    /**
     * Render map boundary
     * @param {GW2Map} map - The map to render
     */
    renderBoundary(map: GW2Map): void {
        domHelpers.empty(this.boundaryGroup);

        // Handle both map.boundary (array) and map.boundary.points (nested)
        const boundaryPoints = map.boundary?.points ?? [];

        if (!boundaryPoints || !Array.isArray(boundaryPoints) || boundaryPoints.length === 0) {
            return;
        }

        // Use global xZoom/yZoom functions for coordinate transformation
        const xZoom = window.xZoom;
        const yZoom = window.yZoom;
        if (!xZoom || !yZoom) {
            console.error('xZoom/yZoom functions not available');
            return;
        }

        // Convert world coordinates to screen coordinates as [x, y] tuples
        const transformedPoints: Array<[number, number]> = boundaryPoints.map(point => [
            xZoom(point.x),
            yZoom(point.y)
        ]);

        const polygon = renderHelpers.createPolygon(
            transformedPoints,
            {
                fill: 'transparent',
                opacity: 0.25,
                stroke: 'white',
                strokeWidth: 2,
                className: 'boundary'
            }
        );

        this.boundaryGroup.appendChild(polygon);
    }

    /**
     * Render all layers and their decorations
     * @param {Layer[]} layers - Array of layers to render
     */
    renderLayers(layers: MapViewerLayer[]): void {
        domHelpers.empty(this.layersGroup);
        domHelpers.empty(this.decorationsGroup);

        // Clear decoration circle cache
        this.decorationCircles.clear();

        if (!Array.isArray(layers)) {
            return;
        }

        layers.forEach((layer, index) => {
            // Skip rendering hidden layers completely
            if (!layer.isVisible) {
                return;
            }

            const layerGroup = renderHelpers.createGroup({
                className: `layer layer-${layer.id}`,
                id: `layer-${layer.id}`
            });

            layerGroup.setAttribute('data-layer-id', String(layer.id));

            // Get decorations - handle both Map (domain object) and Array (DTO/plain object)
            let decorations: Decoration[] = [];
            if (layer.getAllDecorations && typeof layer.getAllDecorations === 'function') {
                // Layer domain object with getAllDecorations method
                decorations = layer.getAllDecorations();
            } else if (layer.decorations && Array.isArray(layer.decorations)) {
                // Plain object with decorations array
                decorations = layer.decorations;
            } else if (layer.decorations instanceof Map) {
                // Layer with Map of decorations
                decorations = Array.from(layer.decorations.values());
            }

            decorations.forEach(decoration => {
                if (decoration && decoration.position) {
                    const circle = this.createDecorationElement(decoration, layer.color);
                    if (circle) {
                        // Cache the circle for fast zoom updates
                        this.decorationCircles.set(decoration.uid, circle);
                        layerGroup.appendChild(circle);
                    }
                }
            });

            this.decorationsGroup.appendChild(layerGroup);
        });
    }

    /**
     * Create a decoration circle element
     * @param {Decoration} decoration - The decoration to render
     * @param {string} [layerColor] - The layer color to use for the fill
     * @returns {SVGCircleElement}
     */
    createDecorationElement(decoration: MapViewerDecoration, layerColor?: string): SVGCircleElement | null {
        // Ensure decoration has valid position
        if (!decoration || !decoration.position || typeof decoration.position.x !== 'number' || typeof decoration.position.y !== 'number') {
            console.warn('Invalid decoration position:', decoration);
            return null;
        }

        // Use global xZoom/yZoom functions for coordinate transformation
        if (typeof window.xZoom !== 'function' || typeof window.yZoom !== 'function') {
            console.error('xZoom/yZoom functions not available');
            return null;
        }

        // Convert world coordinates to screen coordinates
        const screenX = window.xZoom(decoration.position.x);
        const screenY = window.yZoom(decoration.position.y);

        const circle = renderHelpers.createCircle(
            screenX,
            screenY,
            5,
            {
                fill: layerColor || decoration.color || '#00d4ff',
                stroke: '#000000',
                strokeWidth: 1,
                className: `decoration decoration-point decoration-${decoration.uid}`,
                opacity: 0.7
            }
        );

        circle.setAttribute('data-decoration-id', decoration.uid);
        circle.setAttribute('title', decoration.name || 'Decoration');

        // Apply selection highlight if already selected
        if (this.selectionStore && this.selectionStore.isSelected(decoration.uid)) {
            circle.classList.add('selected-decoration');
        }

        return circle;
    }

    /**
     * Update tile positions without recreating them (for zoom/pan)
     * @param {GW2Map} map - The map with tile data
     */
    updateTilePositions(map: GW2Map): void {
        if (!map.tiles || !Array.isArray(map.tiles)) {
            return;
        }

        const xZoom = window.xZoom;
        const yZoom = window.yZoom;
        if (!xZoom || !yZoom) return;

        const tileImages = this.tileGroup.querySelectorAll('image');

        map.tiles.forEach((tile, index) => {
            if (!tile.mapCoords || tile.tileSize === undefined) return;
            if (tileImages[index]) {
                const tileWidth = tile.tileSizeX ?? tile.tileSize;
                const tileHeight = tile.tileSizeY ?? tile.tileSize;
                const x1 = xZoom(tile.mapCoords.x);
                const x2 = xZoom(tile.mapCoords.x + tileWidth);
                const y1 = yZoom(tile.mapCoords.y + tileHeight);
                const y2 = yZoom(tile.mapCoords.y);

                tileImages[index].setAttribute('x', String(x1 - TILE_EDGE_OVERDRAW));
                tileImages[index].setAttribute('y', String(y1 - TILE_EDGE_OVERDRAW));
                tileImages[index].setAttribute('width', String(x2 - x1 + TILE_EDGE_OVERDRAW * 2));
                tileImages[index].setAttribute('height', String(y2 - y1 + TILE_EDGE_OVERDRAW * 2));
            }
        });
    }

    /**
     * Update boundary position without recreating it (for zoom/pan)
     * @param {GW2Map} map - The map with boundary data
     */
    updateBoundaryPosition(map: GW2Map): void {
        const boundaryPoints = map.boundary?.points ?? [];

        if (!boundaryPoints || !Array.isArray(boundaryPoints) || boundaryPoints.length === 0) {
            return;
        }

        const xZoom = window.xZoom;
        const yZoom = window.yZoom;
        if (!xZoom || !yZoom) return;

        const polygon = this.boundaryGroup.querySelector('polygon');
        if (polygon) {
            const pointsString = boundaryPoints.map(point =>
                `${xZoom(point.x)},${yZoom(point.y)}`
            ).join(' ');

            polygon.setAttribute('points', pointsString);
        }
    }

    /**
     * Update decoration positions without recreating them (for zoom/pan)
     * @param {Layer[]} layers - Array of layers with decorations
     */
    updateDecorationPositions(layers: MapViewerLayer[]): void {
        if (!Array.isArray(layers)) {
            return;
        }

        const xZoom = window.xZoom;
        const yZoom = window.yZoom;
        if (!xZoom || !yZoom) return;

        layers.forEach(layer => {
            if (!layer.isVisible) {
                return;
            }

            let decorations: Decoration[] = [];
            if (layer.getAllDecorations && typeof layer.getAllDecorations === 'function') {
                decorations = layer.getAllDecorations();
            } else if (layer.decorations && Array.isArray(layer.decorations)) {
                decorations = layer.decorations;
            } else if (layer.decorations instanceof Map) {
                decorations = Array.from(layer.decorations.values());
            }

            decorations.forEach(decoration => {
                if (decoration && decoration.position) {
                    // Use cached circle reference instead of querySelector
                    const circle = this.decorationCircles.get(decoration.uid);
                    if (circle) {
                        const screenX = xZoom(decoration.position.x);
                        const screenY = yZoom(decoration.position.y);
                        circle.setAttribute('cx', String(screenX));
                        circle.setAttribute('cy', String(screenY));
                    }
                }
            });
        });
    }

    /**
     * Clear all rendered content
     */
    clear(): void {
        domHelpers.empty(this.tileGroup);
        domHelpers.empty(this.boundaryGroup);
        domHelpers.empty(this.layersGroup);
        domHelpers.empty(this.decorationsGroup);

        // Clear caches
        this.currentMap = null;
        this.currentLayers = [];
        this._lastRenderedMapId = null;
        this.decorationCircles.clear();
    }

    /**
     * Set viewport dimensions
     * @param {number} width - Viewport width
     * @param {number} height - Viewport height
     */
    setViewport(width: number, height: number): void {
        this.svgElement.setAttribute('width', String(width));
        this.svgElement.setAttribute('height', String(height));
        this.svgElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }

    /**
     * Get screen coordinates from SVG click event
     * @param {MouseEvent} event - The mouse event
     * @returns {Object} {x, y} screen coordinates
     */
    getClickCoordinates(event: MouseEvent): { x: number; y: number } {
        const svg = this.svgElement;
        const rect = svg.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        return { x, y };
    }

    /**
     * Bind click handlers on the SVG for decoration selection.
     * Click on decoration → select; Ctrl+Click → toggle; click empty → clear.
     * Hidden-layer decorations are not selectable.
     * In 'select' mode, single clicks on decorations still select; empty-area
     * selection is handled by _bindRectangleSelectHandlers.
     * @private
     */
    _bindSelectionHandlers(): void {
        // Track whether a drag (pan) occurred between mousedown and click so that
        // releasing the mouse after panning does not clear the selection.
        let panDragOccurred = false;
        let mouseIsDown = false;

        this.svgElement.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            panDragOccurred = false;
            mouseIsDown = true;
        });

        document.addEventListener('mousemove', (e) => {
            if (mouseIsDown && e.buttons === 1) {
                panDragOccurred = true;
            }
        });

        document.addEventListener('mouseup', () => {
            mouseIsDown = false;
        });

        this.svgElement.addEventListener('click', (e) => {
            const selectionStore = this.selectionStore;
            if (!selectionStore) return;

            // In 'select' mode, empty-area clicks are handled by the rectangle
            // pointer handler (the click fires after a zero-distance drag, so we
            // skip the clearSelection here to avoid wiping the just-finished rect).
            const mode = this._toolModeStore ? this._toolModeStore.getMode() : 'pan';

            // Walk from event target up to find a decoration circle
            const target = e.target instanceof Element ? e.target : null;
            const circle = target?.closest('[data-decoration-id]') ?? null;

            if (circle) {
                const decorationId = circle.getAttribute('data-decoration-id');
                if (!decorationId) return;
                // Check that the decoration belongs to a visible layer
                const layerGroup = circle.closest('[data-layer-id]');
                if (layerGroup) {
                    const layerId = layerGroup.getAttribute('data-layer-id');
                    const layer = this.currentLayers.find(l => l.id === layerId);
                    if (layer && !layer.isVisible) {
                        return; // Hidden layer — not selectable
                    }
                }

                if (e.ctrlKey || e.metaKey) {
                    selectionStore.toggleDecoration(decorationId);
                } else {
                    selectionStore.selectDecoration(decorationId);
                }
            } else if (mode === 'pan') {
                // In pan mode only: clicking empty area clears selection,
                // but only if the mouse was not dragged (panned) beforehand.
                if (!panDragOccurred) {
                    selectionStore.clearSelection();
                }
                panDragOccurred = false;
            }
        });
    }

    /**
     * Bind capture-phase mousedown + pointermove/pointerup handlers for
     * rectangle selection in 'select' mode.
     *
     * In 'pan' mode:  nothing extra happens; ZoomHandler takes over.
     * In 'select' mode when clicking on empty SVG area:
     *   - mousedown (capture) blocks ZoomHandler's pan via stopImmediatePropagation
     *   - pointermove draws the selection rectangle
     *   - pointerup finalises, determines enclosed decorations and selects them
     * @private
     */
    _bindRectangleSelectHandlers(): void {
        let rectInProgress = false;
        let hasMoved = false;

        // Capture-phase mousedown: intercepted before ZoomHandler's bubble listener.
        this.svgElement.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (!this._toolModeStore || !this._selectionRect) return;
            const selectionRect = this._selectionRect;
            if (this._toolModeStore.getMode() !== 'select') return;

            const target = e.target instanceof Element ? e.target : null;
            const circle = target?.closest('[data-decoration-id]') ?? null;
            if (circle) return; // Decoration click — let normal click handler process it

            // Block ZoomHandler from starting a pan
            e.stopImmediatePropagation();

            hasMoved = false;
            rectInProgress = true;

            const svgCoords = this._getSVGCoords(e);
            selectionRect.start(svgCoords.x, svgCoords.y);

            const onMove = (me: MouseEvent) => {
                if (!rectInProgress) return;
                hasMoved = true;
                const coords = this._getSVGCoords(me);
                selectionRect.update(coords.x, coords.y);
            };

            const onUp = (me: MouseEvent) => {
                if (!rectInProgress) return;
                rectInProgress = false;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);

                const bounds = selectionRect.finish();

                const selectionStore = this.selectionStore;
                if (!selectionStore) return;

                if (hasMoved && bounds && (bounds.width > 2 || bounds.height > 2)) {
                    // Select decorations within the rectangle.
                    // bounds are in SVG root coordinates (_getSVGCoords uses svgElement.getScreenCTM).
                    // Decoration cx/cy attributes are in the container group's local coordinate
                    // space (offset by the group's translate transform, e.g. translate(10,10)).
                    // Subtract the group offset so both are in the same coordinate system.
                    const groupOffset = this._getContainerGroupOffset();
                    const groupBounds = {
                        x: bounds.x - groupOffset.x,
                        y: bounds.y - groupOffset.y,
                        width: bounds.width,
                        height: bounds.height
                    };
                    const ids = selectionRect.getDecorationsInBounds(
                        groupBounds, this.decorationCircles
                    );
                    // Filter to only visible-layer decorations
                    const visibleIds = ids.filter(id => {
                        const circle = this.decorationCircles.get(id);
                        if (!circle) return false;
                        const layerGroup = circle.closest('[data-layer-id]');
                        if (!layerGroup) return false;
                        const layerId = layerGroup.getAttribute('data-layer-id');
                        const layer = this.currentLayers.find(l => l.id === layerId);
                        return layer && layer.isVisible;
                    });

                    if (me.shiftKey) {
                        // Shift (with or without Ctrl): remove from selection
                        selectionStore.removeFromSelection(visibleIds);
                    } else if (me.ctrlKey || me.metaKey) {
                        // Ctrl only: additive — add to current selection
                        selectionStore.addToSelection(visibleIds);
                    } else {
                        // No modifier: replace selection
                        selectionStore.selectAll(visibleIds);
                    }
                } else if (!hasMoved) {
                    // Zero-distance click on empty area → clear selection
                    selectionStore.clearSelection();
                }
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        }, true); // capture phase
    }

    /**
     * Convert a MouseEvent's clientX/Y to SVG coordinate space.
     * @param {MouseEvent} e
     * @returns {{ x: number, y: number }}
     * @private
     */
    /**
     * Return the {x, y} translation from the container group's transform attribute.
     * Decoration cx/cy values are in this group's local coordinate space, so the
     * result is used to shift selection bounds into that same space before hit-testing.
     * @returns {{ x: number, y: number }}
     * @private
     */
    _getContainerGroupOffset(): { x: number; y: number } {
        if (!this._containerGroup) return { x: 0, y: 0 };
        const transform = this._containerGroup.getAttribute('transform') || '';
        const match = /translate\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*\)/.exec(transform);
        if (!match) return { x: 0, y: 0 };
        return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
    }

    _getSVGCoords(e: MouseEvent): DOMPoint | { x: number; y: number } {
        let point: DOMPoint;
        try {
            // createSVGPoint is standard but may be unavailable in some JSDOM versions
            point = this.svgElement.createSVGPoint();
            point.x = e.clientX;
            point.y = e.clientY;
            const ctm = this.svgElement.getScreenCTM();
            if (ctm) {
                return point.matrixTransform(ctm.inverse());
            }
        } catch (_) { /* fallback below */ }

        // Fallback: subtract bounding rect
        const rect = this.svgElement.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    /**
     * Update visual selection highlights on decoration circles.
     * @private
     */
    _updateSelectionHighlights(): void {
        for (const [id, circle] of this.decorationCircles) {
            if (this.selectionStore && this.selectionStore.isSelected(id)) {
                circle.classList.add('selected-decoration');
                // Move to end of parent so it renders on top of non-selected decorations
                if (circle.parentNode) {
                    circle.parentNode.appendChild(circle);
                }
            } else {
                circle.classList.remove('selected-decoration');
            }
        }
    }

    /**
     * Set the selection store (for late binding)
     * @param {SelectionStore} selectionStore
     */
    setSelectionStore(selectionStore: SelectionStoreLike): void {
        this.selectionStore = selectionStore;
    }

    /**
     * Set the ToolModeStore (for late binding).
     * Creates a SelectionRectangle on the SVG for rectangle selection.
     * @param {import('../stores/ToolModeStore.js').ToolModeStore} toolModeStore
     */
    setToolModeStore(toolModeStore: ToolModeStoreLike): void {
        this._toolModeStore = toolModeStore;
        this._selectionRect = new SelectionRectangle(this.svgElement);

        const shortcutHint = document.createElement('div');
        shortcutHint.className = 'selection-shortcut-hint';
        shortcutHint.setAttribute('role', 'note');
        shortcutHint.setAttribute('aria-label', 'Selection shortcuts');
        shortcutHint.hidden = true;

        const addHint = document.createElement('span');
        addHint.innerHTML = '<kbd>Ctrl</kbd> / <kbd>Cmd</kbd> Add to selection';
        const removeHint = document.createElement('span');
        removeHint.innerHTML = '<kbd>Shift</kbd> Remove from selection';
        shortcutHint.append(addHint, removeHint);
        this.svgElement.parentElement?.appendChild(shortcutHint);
        this._selectionShortcutHint = shortcutHint;

        const updateToolMode = (mode: string) => {
            this.svgElement.style.cursor = mode === 'select' ? 'crosshair' : 'grab';
            if (this._selectionShortcutHint) {
                this._selectionShortcutHint.hidden = mode !== 'select';
            }
            this._updateSelectionIndicator();
        };
        updateToolMode(toolModeStore.getMode());
        toolModeStore.subscribe(updateToolMode);

        this._initSelectionModeIndicator();
    }

    /**
     * Create and manage the floating +/- indicator near the cursor in select mode.
     * @private
     */
    _initSelectionModeIndicator(): void {
        const indicator = document.createElement('div');
        indicator.className = 'selection-mode-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        document.body.appendChild(indicator);
        this._selectionIndicator = indicator;
        this._indicatorMouseX = 0;
        this._indicatorMouseY = 0;
        this._indicatorCtrl = false;
        this._indicatorShift = false;

        const update = () => this._updateSelectionIndicator();

        this.svgElement.addEventListener('mousemove', (e) => {
            this._indicatorMouseX = e.clientX;
            this._indicatorMouseY = e.clientY;
            this._indicatorCtrl = e.ctrlKey || e.metaKey;
            this._indicatorShift = e.shiftKey;
            update();
        });

        this.svgElement.addEventListener('mouseleave', () => {
            if (this._selectionIndicator) {
                this._selectionIndicator.style.display = 'none';
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Control' || e.key === 'Meta') this._indicatorCtrl = true;
            if (e.key === 'Shift') this._indicatorShift = true;
            update();
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === 'Control' || e.key === 'Meta') this._indicatorCtrl = false;
            if (e.key === 'Shift') this._indicatorShift = false;
            update();
        });
    }

    /**
     * Update the selection mode indicator position and label.
     * @private
     */
    _updateSelectionIndicator(): void {
        const el = this._selectionIndicator;
        if (!el) return;

        const inSelectMode = this._toolModeStore && this._toolModeStore.getMode() === 'select';
        if (!inSelectMode) {
            el.style.display = 'none';
            return;
        }

        if (this._indicatorShift) {
            el.textContent = '−';
            el.className = 'selection-mode-indicator selection-mode-indicator--remove';
        } else if (this._indicatorCtrl) {
            el.textContent = '+';
            el.className = 'selection-mode-indicator selection-mode-indicator--add';
        } else {
            el.style.display = 'none';
            return;
        }

        el.style.display = 'block';
        el.style.left = (this._indicatorMouseX + 18) + 'px';
        el.style.top = (this._indicatorMouseY + 18) + 'px';
    }

    /**
     * Set the AppService reference (for late binding)
     * @param {AppService} appService
     */
    setAppService(appService: AppServiceLike): void {
        this.appService = appService;
    }

    /**
     * Set the shared ContextMenu instance
     * @param {ContextMenu} contextMenu
     */
    setContextMenu(contextMenu: ContextMenuLike): void {
        this._contextMenu = contextMenu;
        this._bindContextMenuHandler();
        this._bindDragHandlers();
    }

    /**
     * Bind right-click context menu on selected decoration circles.
     * @private
     */
    _bindContextMenuHandler(): void {
        this.svgElement.addEventListener('contextmenu', (e) => {
            const contextMenu = this._contextMenu;
            const selectionStore = this.selectionStore;
            const appService = this.appService;
            if (!contextMenu || !selectionStore || !appService) return;

            const target = e.target instanceof Element ? e.target : null;
            const circle = target?.closest('[data-decoration-id]') ?? null;
            if (!circle) return;

            const decorationId = circle.getAttribute('data-decoration-id');
            if (!decorationId) return;

            // Check visible layer
            const layerGroup = circle.closest('[data-layer-id]');
            if (layerGroup) {
                const layerId = layerGroup.getAttribute('data-layer-id');
                const layer = this.currentLayers.find(l => l.id === layerId);
                if (layer && !layer.isVisible) return;
            }

            // If right-clicked decoration is not selected, select it first
            if (!selectionStore.isSelected(decorationId)) {
                selectionStore.selectDecoration(decorationId);
            }

            e.preventDefault();

            const selectedIds = selectionStore.getSelectedIds();
            const count = selectedIds.length;
            const state = this.appStore.getState();
            const layers = state.layers || [];
            const layerId = layerGroup?.getAttribute('data-layer-id');

            const clickedLayer = layers.find(layer => layer.id === layerId);
            const layerDecorations = clickedLayer
                ? (clickedLayer.getAllDecorations?.() ?? (clickedLayer.decorations instanceof Map
                    ? Array.from(clickedLayer.decorations.values())
                    : clickedLayer.decorations ?? []))
                : [];
            const layerDecorationIds = layerDecorations.map(decoration => decoration.uid);

            const visibleDecorations = layers
                .filter(layer => layer.isVisible)
                .flatMap(layer => layer.getAllDecorations?.() ?? (layer.decorations instanceof Map
                    ? Array.from(layer.decorations.values())
                    : layer.decorations ?? []));
            const clickedDecoration = visibleDecorations.find(decoration => decoration.uid === decorationId);

            const moveSubmenu = layers.filter(layer => layer.id !== layerId).map(l => ({
                label: l.name || `Layer ${l.id}`,
                action: () => {
                    void appService.execute({
                        type: 'MoveDecorationsCommand',
                        payload: { decorationIds: selectedIds, targetLayerId: l.id }
                    });
                }
            }));
            moveSubmenu.push({
                label: 'New Layer',
                action: async () => {
                    const createdLayer = await appService.execute({
                        type: 'CreateLayerCommand',
                        payload: { isVisible: true }
                    }) as { id?: string } | undefined;
                    if (createdLayer?.id) {
                        await appService.execute({
                            type: 'MoveDecorationsCommand',
                            payload: { decorationIds: selectedIds, targetLayerId: createdLayer.id }
                        });
                    }
                }
            });
            const copySubmenu = layers.map(layer => ({
                label: layer.name || `Layer ${layer.id}`,
                action: () => {
                    void appService.execute({
                        type: 'CopyDecorationsCommand',
                        payload: { decorationIds: selectedIds, targetLayerId: layer.id }
                    });
                }
            }));
            copySubmenu.push({
                label: 'New Layer',
                action: async () => {
                    const createdLayer = await appService.execute({
                        type: 'CreateLayerCommand',
                        payload: { isVisible: true }
                    }) as { id?: string } | undefined;
                    if (createdLayer?.id) {
                        await appService.execute({
                            type: 'CopyDecorationsCommand',
                            payload: { decorationIds: selectedIds, targetLayerId: createdLayer.id }
                        });
                    }
                }
            });

            const items: Array<{ label: string; action?: () => void; submenu?: Array<{ label: string; action: () => void }> }> = [];
            items.push({
                label: `Select All in Layer (${layerDecorationIds.length})`,
                action: () => selectionStore.selectAll(layerDecorationIds)
            });
            if (clickedDecoration) {
                const sameTypeIds = visibleDecorations
                    .filter(decoration => decoration.id === clickedDecoration.id)
                    .map(decoration => decoration.uid);
                if (sameTypeIds.length > 1) {
                    items.push({
                        label: `Select All of Same Type (${sameTypeIds.length})`,
                        action: () => selectionStore.selectAll(sameTypeIds)
                    });
                }
            }
            items.push({ label: 'Move to Layer', submenu: moveSubmenu });
            items.push({ label: 'Copy to', submenu: copySubmenu });
            items.push({
                label: `Delete ${count} Decoration${count > 1 ? 's' : ''}`,
                action: () => {
                    void appService.execute({
                        type: 'DeleteDecorationsCommand',
                        payload: { decorationIds: selectedIds }
                    });
                }
            });

            contextMenu.show(e.clientX, e.clientY, items);
        });
    }

    /**
     * Bind dragstart on SVG decoration circles for DnD to Layer Panel.
     * SVG elements don't have native draggable support, so we use
     * mousedown + mousemove to initiate a manual drag via a hidden helper element.
     * @private
     */
    _bindDragHandlers(): void {
        // Use a helper HTML element overlaid on SVG to enable native drag
        let dragHelper: HTMLDivElement | null = null;

        this.svgElement.addEventListener('mousedown', (e) => {
            const selectionStore = this.selectionStore;
            if (!selectionStore) return;
            if (e.button !== 0) return; // left click only

            const target = e.target instanceof Element ? e.target : null;
            const circle = target?.closest('[data-decoration-id]') ?? null;
            if (!circle) return;

            const decorationId = circle.getAttribute('data-decoration-id');
            if (!decorationId || !selectionStore.isSelected(decorationId)) return;

            // Create a hidden draggable helper element for native HTML DnD
            const helperElement = document.createElement('div');
            dragHelper = helperElement;
            helperElement.setAttribute('draggable', 'true');
            helperElement.style.position = 'fixed';
            helperElement.style.left = `${e.clientX - 5}px`;
            helperElement.style.top = `${e.clientY - 5}px`;
            helperElement.style.width = '10px';
            helperElement.style.height = '10px';
            helperElement.style.opacity = '0';
            helperElement.style.zIndex = '9999';
            document.body.appendChild(helperElement);

            helperElement.addEventListener('dragstart', (de) => {
                const currentSelectionStore = this.selectionStore;
                const dataTransfer = de.dataTransfer;
                if (!currentSelectionStore || !dataTransfer) return;
                const selectedIds = currentSelectionStore.getSelectedIds();
                dataTransfer.setData('application/x-decoration-ids', JSON.stringify(selectedIds));
                dataTransfer.effectAllowed = 'move';

                const count = selectedIds.length;
                if (count > 0) {
                    const dragImage = document.createElement('div');
                    dragImage.className = 'decoration-drag-image';
                    dragImage.textContent = `${count} decoration${count > 1 ? 's' : ''}`;
                    dragImage.style.position = 'absolute';
                    dragImage.style.top = '-9999px';
                    document.body.appendChild(dragImage);
                    dataTransfer.setDragImage(dragImage, 0, 0);
                    setTimeout(() => document.body.removeChild(dragImage), 0);
                }
            });

            helperElement.addEventListener('dragend', () => {
                if (dragHelper && dragHelper.parentNode) {
                    dragHelper.parentNode.removeChild(dragHelper);
                }
                dragHelper = null;
            });

            // Programmatically trigger dragstart on the helper
            // Use a small delay so the helper is in the DOM
            setTimeout(() => {
                const currentHelper = dragHelper;
                if (currentHelper) {
                    const dragEvent = new DragEvent('dragstart', {
                        bubbles: true,
                        cancelable: true,
                        dataTransfer: new DataTransfer()
                    });
                    currentHelper.dispatchEvent(dragEvent);
                }
            }, 0);
        });
    }
}

export { MapViewer };
