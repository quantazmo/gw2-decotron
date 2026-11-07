import { scaleLinear, type LinearScale, type ZoomTransform } from './src/ui/scaleFactory.ts';
import { createZoomHandler } from './src/ui/ZoomHandler.js';
import { UI_LAYOUT, ZOOM } from './src/config/constants.js';
import { ZoomCalculationService } from './src/domain/ZoomCalculationService.js';
import { initializeApplication } from './src/initialization/ApplicationInitializer.js';
import { zoomStore } from './src/ui/stores/ZoomStore.js';
import { XmlLayoutAdapter } from './src/infrastructure/XmlLayoutAdapter.js';
import { MapViewer } from './src/ui/components/MapViewer.js';
import { LayerPanel } from './src/ui/components/LayerPanel.js';
import { ToolPanel } from './src/ui/components/ToolPanel.js';
import { FileDropZone } from './src/ui/components/FileDropZone.js';

type AppContextLike = {
    appStore: { getState: () => any; subscribe: (listener: (state: any) => void) => void; dispatch: (action: string, payload?: any) => void };
    selectionStore: any;
    appService: { execute: (command: any) => any };
    eventBus: { publish: (eventName: string, payload?: unknown) => void; subscribe: (eventName: string, handler: (payload: any) => void) => void };
    homesteadLayout?: { setMap?: (map: any) => void; getAllLayers?: () => any[]; addLayer?: (layer: any) => void };
    contextMenu?: any;
    toolModeStore?: any;
    mapRepository?: { loadById: (id: number) => Promise<any> };
} & Record<string, any>;

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

function zoomed(): void {
    // Legacy compatibility hook. Real rendering updates are driven by MapViewer/ZoomStore.
}

declare global {
    interface Window {
        xZoom?: (value: number) => number;
        yZoom?: (value: number) => number;
        resetZoom?: () => void;
        openFileDialog?: () => void;
        addDecorationRefactored?: (...args: any[]) => any;
        deleteDecorationRefactored?: (...args: any[]) => any;
        getBoundaryInfo?: (...args: any[]) => any;
        isPointInMapBoundary?: (...args: any[]) => any;
        completeLayoutLoadingWorkflow?: (xmlContent: string, fileName: string) => Promise<void>;
    }
}

// ============================================================================
// REFACTORED ARCHITECTURE INITIALIZATION
// ============================================================================
// Initialize the refactored architecture
let appContext: AppContextLike | null = null;

async function setupRefactoredArchitecture() {
    console.log('[script.js] 🚀 ========== SETUP REFACTORED ARCHITECTURE ==========');
    try {
        console.log('[script.js]   ↳ Calling initializeApplication()...');
        appContext = await initializeApplication();
        console.log('[script.js] ✅ Refactored architecture initialized successfully');

        // Subscribe to AppStore changes to update UI
        console.log('[script.js]   ↳ Subscribing to AppStore changes...');
        appContext.appStore.subscribe((state) => {
            console.log('[script.js] 🔄 AppStore state changed:', state);
            // Any AppStore changes will trigger UI updates here
        });

        // Initialize ToolPanel component
        const toolPanelContainer = document.getElementById('tool-panel');
        if (toolPanelContainer) {
            console.log('[script.js]   ↳ Initializing ToolPanel component...');
            toolPanel = new ToolPanel(toolPanelContainer);
            toolPanel.attachExistingGroups();
            console.log('[script.js] ✅ ToolPanel component initialized');
        } else {
            console.warn('[script.js] ⚠️  toolPanelContainer not found in DOM');
        }

        // Initialize LayerPanel component
        const layersPanelContainer = document.getElementById('layers-list');
        if (layersPanelContainer) {
            console.log('[script.js]   ↳ Initializing LayerPanel component...');
            layerPanel = new LayerPanel(
                layersPanelContainer,
                appContext.appStore as any,
                appContext.selectionStore,
                appContext.appService as any,
                appContext.eventBus as any
            );
            if (appContext.contextMenu) {
                layerPanel.setContextMenu(appContext.contextMenu);
            }
            console.log('[script.js] ✅ LayerPanel component initialized');
        } else {
            console.warn('[script.js] ⚠️  layersPanelContainer not found in DOM');
        }

        // Initialize FileDropZone component
        const chartContainer = document.getElementById('map-container');
        const fileInput = document.getElementById('file-input') as HTMLInputElement | null;
        if (chartContainer) {
            console.log('[script.js]   ↳ Initializing FileDropZone component...');
            fileDropZone = new FileDropZone(chartContainer, appContext.appService as any, appContext.eventBus as any, {
                useExistingUI: true,
                fileInputElement: fileInput ?? undefined
            });
            console.log('[script.js] ✅ FileDropZone component initialized');
        } else {
            console.warn('[script.js] ⚠️  chartContainer not found in DOM');
        }

        return appContext;
    } catch (error) {
        console.error('[script.js] ❌ Failed to initialize refactored architecture:', error);
        // Continue with legacy code if initialization fails
        return null;
    }
}

// Call during DOMContentLoaded
let architectureInitialized = false;

// Disable add-layer button until a layout is loaded
function updateAddLayerButtonState() {
    const addLayerBtn = document.getElementById('add-layer-btn') as HTMLButtonElement | null;
    if (addLayerBtn) {
        addLayerBtn.disabled = !isMapLoaded();
    }
}

let xZoom: LinearScale | null = null;
let yZoom: LinearScale | null = null;
let xZoomBase: LinearScale | null = null;
let yZoomBase: LinearScale | null = null;

// UI Component instances
let mapViewer: any = null;
let layerPanel: any = null;
let toolPanel: any = null;
let fileDropZone: any = null;

// ============================================================================
// PHASE 8: QUERIES & DATA ACCESS (CQRS Queries)
// ============================================================================

/**
 * Query helpers - Provide convenient access to AppStore state
 * These replace direct global variable access with proper CQRS queries
 */

/**
 * Get the current map from AppStore
 * @returns {GW2Map|null} The current map or null if not loaded
 */
function getMap() {
    if (!appContext) return null;
    const state = appContext.appStore.getState();
    return state.map;
}

/**
 * Get all layers from AppStore
 * @returns {Layer[]} Array of layers
 */
function getLayers() {
    if (!appContext) return [];
    const state = appContext.appStore.getState();
    return state.layers || [];
}

/**
 * Get a specific layer by ID from AppStore
 * @param {number} layerId - The layer ID to find
 * @returns {Layer|undefined} The layer or undefined if not found
 */
function getLayerById(layerId: number | string) {
    const allLayers = getLayers();
    return allLayers.find((l: { id: number | string }) => l.id === layerId);
}

/**
 * Get the active layer ID from AppStore
 * @returns {number|null} The active layer ID or null
 */
function getActiveLayerId() {
    if (!appContext) return null;
    const state = appContext.appStore.getState();
    return state.activeLayerId;
}

/**
 * Get the layout from AppStore
 * @returns {HomesteadLayout|null} The layout or null if not loaded
 */
function getLayout() {
    if (!appContext) return null;
    const state = appContext.appStore.getState();
    return state.layout;
}

/**
 * Check if a map is loaded
 * @returns {boolean} True if a map is loaded
 */
function isMapLoaded() {
    const currentMap = getMap();
    return currentMap && currentMap.id !== 0;
}

// ============================================================================
// PHASE 3: LAYER MANAGEMENT INTEGRATION  
// ============================================================================

/**
 * Create a new layer (refactored version)
 * Uses AppStore dispatch instead of direct state mutation
 */
function createLayerRefactored(layerName?: string) {
    console.log(`[script.js] ⚡ createLayerRefactored called with name: "${layerName ?? 'undefined'}"`);

    if (!appContext || !architectureInitialized) {
        console.warn('[script.js] ⚠️  Architecture not ready, using legacy layer creation');
        return null;
    }

    const { appService, appStore, eventBus } = appContext;
    const state = appStore.getState();

    // Create new layer with unique ID
    const newLayerId = Date.now(); // Simple unique ID generation
    const layerNameToUse = layerName || `Layer ${state.layers.length + 1}`;

    console.log(`[script.js]   ↳ Executing CreateLayerCommand through AppService...`);
    // Execute command through AppService
    const command = {
        type: 'CreateLayerCommand',
        payload: {
            id: newLayerId,
            name: layerNameToUse,
            isVisible: true
        }
    };

    const result = appService.execute(command);

    console.log(`[script.js]   ↳ Executing SetActiveLayerCommand to set active layer...`);
    // Set as active layer through command
    const setActiveCommand = {
        type: 'SetActiveLayerCommand',
        payload: {
            layerId: newLayerId
        }
    };
    appService.execute(setActiveCommand);

    console.log(`[script.js] ✅ Layer created: "${layerNameToUse}" (ID: ${newLayerId})`);
    return result.layer || { id: newLayerId, name: layerNameToUse, isVisible: true, decorations: [] };
}

/**
 * Delete a layer (refactored version)
 */
function deleteLayerRefactored(layerId: number | string) {
    console.log(`[script.js] ⚡ deleteLayerRefactored called for layerId: ${layerId}`);

    if (!appContext || !architectureInitialized) {
        console.warn('[script.js] ⚠️  Architecture not ready, using legacy layer deletion');
        return;
    }

    const { appService, appStore } = appContext;

    console.log(`[script.js]   ↳ Executing DeleteLayerCommand through AppService...`);
    // Execute command through AppService
    const command = {
        type: 'DeleteLayerCommand',
        payload: {
            layerId: layerId
        }
    };
    appService.execute(command);

    // Clear selection if this layer was selected
    const state = appStore.getState();
    if (state.activeLayerId === layerId) {
        console.log(`[script.js]   ↳ Deleted layer was active, setting new active layer...`);
        const remainingLayerId = state.layers.length > 0 ? state.layers[0].id : null;
        const setActiveCommand = {
            type: 'SetActiveLayerCommand',
            payload: {
                layerId: remainingLayerId
            }
        };
        appService.execute(setActiveCommand);
    }

    console.log(`[script.js]   ↳ Layer deleted successfully`);
    // No need to publish event manually - it's published by the handler

    console.log(`[script.js] ✅ Layer deleted: ${layerId}`);
}

/**
 * Rename a layer (refactored version)
 */
function renameLayerRefactored(layerId: number | string, newName: string) {
    if (!appContext || !architectureInitialized) {
        console.warn('Architecture not ready, using legacy layer rename');
        return;
    }

    if (!newName || newName.trim().length === 0) {
        console.warn('Layer name cannot be empty');
        return;
    }

    const { appService } = appContext;

    console.log(`[script.js]   ↳ Executing RenameLayerCommand through AppService...`);
    // Execute command through AppService
    const command = {
        type: 'RenameLayerCommand',
        payload: {
            layerId: layerId,
            newName: newName.trim()
        }
    };
    appService.execute(command);

    console.log(`✓ Layer renamed to: "${newName}"`);
}

/**
 * Set active layer (refactored version)
 */
function setActiveLayerRefactored(layerId: number | string | null) {
    if (!appContext || !architectureInitialized) {
        return;
    }

    const { appService } = appContext;

    console.log(`[script.js]   ↳ Executing SetActiveLayerCommand through AppService...`);
    // Execute command through AppService
    const command = {
        type: 'SetActiveLayerCommand',
        payload: {
            layerId: layerId
        }
    };
    appService.execute(command);

    console.log(`✓ Active layer set to: ${layerId}`);
}

// ============================================================================
// PHASE 4: ZOOM & PAN MANAGEMENT INTEGRATION
// ============================================================================

/**
 * Returns the usable drawing dimensions from the #map-container element,
 * accounting for UI_LAYOUT margins.  Falls back to window dimensions when
 * the container element is not yet present (e.g. during tests).
 *
 * @returns {{ width: number, height: number }}
 */
function getChartContainerDimensions() {
    const margin = {
        top: UI_LAYOUT.MARGIN_TOP,
        right: UI_LAYOUT.MARGIN_RIGHT,
        bottom: UI_LAYOUT.MARGIN_BOTTOM,
        left: UI_LAYOUT.MARGIN_LEFT
    };
    const container = document.getElementById('map-container');
    if (container) {
        return {
            width: container.clientWidth - margin.left - margin.right,
            height: container.clientHeight - margin.top - margin.bottom
        };
    }
    // Fallback (no DOM)
    return {
        width: window.innerWidth - margin.left - margin.right,
        height: window.innerHeight - margin.top - margin.bottom
    };
}

/**
 * Store zoom handler reference for later integration with ZoomStore
 */
// Store global zoom handler for reset functionality
let globalZoomHandler: {
    reset: () => void;
    getTransform: () => ZoomTransform;
    setTransform: (transform: ZoomTransform) => void;
    setInteractionsEnabled: (enabled: boolean) => void;
} | null = null;
let moveSelectedActive = false;
let moveSelectedPreviousTransform: ZoomTransform | null = null;
let extendPatternActive = false;
let fillPatternActive = false;
const patternInteractionActive = () => extendPatternActive || fillPatternActive;
let extendPatternPreviousTransform: ZoomTransform | null = null;

/**
 * Reset zoom and pan using the refactored zoom handler
 */
function resetZoomRefactored() {
    try {
        if (moveSelectedActive || patternInteractionActive()) return;
        // Reset the zoom handler (it manages the actual zoom/pan)
        if (globalZoomHandler) {
            globalZoomHandler.reset();
        }

        // Reset ZoomStore if it's initialized
        if (zoomStore && zoomStore.isInitialized()) {
            try {
                zoomStore.reset();
            } catch (error) {
                console.debug('ZoomStore reset skipped:', getErrorMessage(error));
            }
        }

        // Publish event through EventBus if available
        if (architectureInitialized && appContext) {
            appContext.eventBus.publish('zoom:reset', {});
        }

        console.log('✓ Zoom and pan reset');
    } catch (error) {
        console.error('Error resetting zoom:', error);
    }
}



/** 
 * Reset zoom to fit map boundary.
 * Recalculates scale domains and updates all rendered elements.
 */
function resetZoom() {
    if (moveSelectedActive || patternInteractionActive() || !isMapLoaded()) return;

    // Find min/max coordinates from boundary polygon points
    const currentMap = getMap();

    // Check if boundary exists
    if (!currentMap || !currentMap.boundary) {
        console.warn('resetZoom: Map has no boundary, skipping zoom reset');
        return;
    }

    let minX, maxX, minY, maxY;

    // Handle both MapBoundary instance and plain array
    if (typeof currentMap.boundary.getBounds === 'function') {
        const bounds = currentMap.boundary.getBounds();
        minX = bounds.min.x;
        maxX = bounds.max.x;
        minY = bounds.min.y;
        maxY = bounds.max.y;
    } else {
        // Plain array or object with points
        const boundaryPoints = (currentMap.boundary.points || currentMap.boundary) as Array<{ x: number; y: number }>;
        minX = Math.min(...boundaryPoints.map((point: { x: number; y: number }) => point.x));
        maxX = Math.max(...boundaryPoints.map((point: { x: number; y: number }) => point.x));
        minY = Math.min(...boundaryPoints.map((point: { x: number; y: number }) => point.y));
        maxY = Math.max(...boundaryPoints.map((point: { x: number; y: number }) => point.y));
    }

    const rangeX = maxX - minX;
    const rangeY = maxY - minY;

    // set the dimensions and margins of the graph
    const { width, height } = getChartContainerDimensions();

    const chartAspect = width / height;
    const dataAspect = rangeX / rangeY;
    if (chartAspect > dataAspect) {
        // Chart is wider than data
        const desiredRangeX = rangeY * chartAspect;
        const difference = desiredRangeX - rangeX;
        const delta = Math.max(1, Math.ceil(difference / 2));
        minX -= delta;
        maxX += delta;
    } else if (dataAspect > chartAspect) {
        // Data is wider than chart
        const desiredRangeY = rangeX / chartAspect;
        const difference = desiredRangeY - rangeY;
        const delta = Math.max(1, Math.ceil(difference / 2));
        minY -= delta;
        maxY += delta;
    }

    // Handle fully degenerate case (both ranges zero, e.g. a point boundary)
    if (minX === maxX) { minX -= 1; maxX += 1; }
    if (minY === maxY) { minY -= 1; maxY += 1; }

    // Create native scales using scaleLinear from scaleFactory
    const x: LinearScale = scaleLinear().domain([minX, maxX]).range([0, width]) as LinearScale;
    const y: LinearScale = scaleLinear().domain([minY, maxY]).range([height, 0]) as LinearScale;

    // Create scales for zoom transformation
    xZoom = x.copy();
    yZoom = y.copy();

    // Store the original copy for proper rescaling
    xZoomBase = x.copy();
    yZoomBase = y.copy();

    // Update global references for MapViewer component
    window.xZoom = xZoom;
    window.yZoom = yZoom;

    // Reset SVG transform to identity
    const svgGroup = document.querySelector('#map-container svg g');
    const margin_top = UI_LAYOUT.MARGIN_TOP;
    const margin_left = UI_LAYOUT.MARGIN_LEFT;
    if (svgGroup) {
        svgGroup.setAttribute('transform', `translate(${margin_left}, ${margin_top})`);
    }

    // Initialize ZoomStore with the base scales if architecture is initialized
    if (architectureInitialized && appContext && zoomStore) {
        try {
            zoomStore.initialize(xZoom as any, yZoom as any, xZoomBase as any, yZoomBase as any);
        } catch (error) {
            // ZoomStore may already be initialized, that's ok
            console.debug('ZoomStore already initialized:', getErrorMessage(error));
        }
    }

    // Reset ZoomHandler transform to identity so wheel/pan stays in sync
    if (globalZoomHandler) {
        globalZoomHandler.reset();
    }
}

// ============================================================================
// PHASE 5: DECORATION MANAGEMENT INTEGRATION
// ============================================================================

/**
 * Add a decoration to a layer (refactored version using commands)
 * @param {string} layerId - The ID of the layer
 * @param {string} decorationId - The ID of the decoration
 * @param {string} name - The name of the decoration
 * @param {WorldCoordinate} position - The position of the decoration
 * @param {number} [rotation=0] - The rotation angle
 * @param {number} [scale=1] - The scale factor
 * @returns {Decoration} The created decoration
 */
async function addDecorationRefactored(
    layerId: string | number,
    decorationId: string | number,
    name: string,
    position: { x: number; y: number; z?: number },
    rotation = 0,
    scale = 1
) {
    if (!appContext || !architectureInitialized) {
        console.warn('Architecture not ready, cannot add decoration');
        return null;
    }

    try {
        const { appStore, eventBus, homesteadLayout } = appContext;

        // Use dynamic import for ES module compatibility
        const AddDecorationCommandModule = await import('./src/application/commands/AddDecorationCommand.js');
        const AddDecorationHandlerModule = await import('./src/application/handlers/AddDecorationHandler.js');

        // Handle both default and named exports
        const AddDecorationCommand = AddDecorationCommandModule.default || AddDecorationCommandModule;
        const AddDecorationHandler = AddDecorationHandlerModule.default || AddDecorationHandlerModule;

        // Create and execute command
        const command = new AddDecorationCommand(String(layerId), String(decorationId), String(name), position as any, rotation, scale);
        const handler = new AddDecorationHandler(homesteadLayout as any);
        const decoration = handler.execute(command);

        // Emit event
        eventBus.publish('decoration:added:refactored', {
            layerId,
            decorationId: decoration.id,
            name: decoration.name,
            position: decoration.position
        });

        console.log(`✓ Decoration added: "${decoration.name}" (ID: ${decoration.id})`);
        return decoration;
    } catch (error) {
        console.error('Error adding decoration:', error);
        return null;
    }
}

/**
 * Delete a decoration from a layer (refactored version using commands)
 * @param {string} layerId - The ID of the layer
 * @param {string} decorationId - The ID of the decoration to delete
 */
async function deleteDecorationRefactored(layerId: string | number, decorationId: string | number) {
    if (!appContext || !architectureInitialized) {
        console.warn('Architecture not ready, cannot delete decoration');
        return;
    }

    try {
        const { eventBus, homesteadLayout } = appContext;

        // Use dynamic import for ES module compatibility
        const DeleteDecorationCommandModule = await import('./src/application/commands/DeleteDecorationCommand.js');
        const DeleteDecorationHandlerModule = await import('./src/application/handlers/DeleteDecorationHandler.js');

        // Handle both default and named exports
        const DeleteDecorationCommand = DeleteDecorationCommandModule.default || DeleteDecorationCommandModule;
        const DeleteDecorationHandler = DeleteDecorationHandlerModule.default || DeleteDecorationHandlerModule;

        // Create and execute command
        const command = new DeleteDecorationCommand(String(layerId), String(decorationId));
        const handler = new DeleteDecorationHandler(homesteadLayout as any);
        handler.execute(command);

        // Emit event
        eventBus.publish('decoration:deleted:refactored', {
            layerId,
            decorationId
        });

        console.log(`✓ Decoration deleted: ${decorationId}`);
    } catch (error) {
        console.error('Error deleting decoration:', error);
    }
}

// ============================================================================
// PHASE 6: BOUNDARY & MAP MANAGEMENT INTEGRATION
// ============================================================================



/**
 * Get boundary validation info using domain entity
 * @param {GW2Map} gw2Map - The GW2Map domain entity
 * @returns {Object} Boundary info with validation
 */
function getBoundaryInfo(gw2Map: { boundary?: { getBounds: () => any; points?: Array<{ x: number; y: number }> } } | null) {
    if (!gw2Map || !gw2Map.boundary) {
        console.warn('No boundary available');
        return null;
    }

    try {
        const boundary = gw2Map.boundary;
        const bounds = boundary.getBounds();
        const pointCount = boundary.points?.length ?? 0;

        return {
            pointCount,
            bounds: bounds,
            width: bounds.maxX - bounds.minX,
            height: bounds.maxY - bounds.minY,
            area: (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY)
        };
    } catch (error) {
        console.error('Error getting boundary info:', error);
        return null;
    }
}

/**
 * Check if a point is within map boundary
 * @param {GW2Map} gw2Map - The GW2Map domain entity
 * @param {Object} point - Point with x, y coordinates
 * @returns {boolean} Whether point is contained in boundary
 */
function isPointInMapBoundary(gw2Map: { boundary?: { contains: (point: { x: number; y: number }) => boolean } } | null, point: { x: number; y: number }) {
    if (!gw2Map || !gw2Map.boundary) {
        return false;
    }

    try {
        return gw2Map.boundary.contains(point);
    } catch (error) {
        console.error('Error checking boundary containment:', error);
        return false;
    }
}

/**
 * Load map data from XML string
 * @param {string} xmlString - The XML content as a string
 * @returns {Promise<GW2Layout>}
 */
// ============================================================================
// PHASE 2: LAYOUT LOADING INTEGRATION
// ============================================================================

/**
 * Complete layout loading workflow
 * Orchestrates the full process: parse XML -> load map -> create entities -> initialize rendering
 * @param {string} xmlString - The XML layout content
 * @returns {Promise<Object>} The loaded layout data
 */
async function completeLayoutLoadingWorkflow(xmlString: string, fileName?: string) {
    console.log('[completeLayoutLoadingWorkflow] 🚀 Starting layout load workflow');

    try {
        // Step 1: Parse layout using LoadLayoutCommand
        let layout;
        if (architectureInitialized && appContext) {
            layout = await loadLayoutWithRefactoredArchitecture(xmlString);
        } else {
            layout = await loadLayoutFromXml(xmlString);
        }

        // Step 2: Load map from GW2 API (using repository if architecture initialized)
        let newMap;
        let gw2MapEntity = null;

        if (architectureInitialized && appContext && appContext.mapRepository) {
            // Use new architecture: mapRepository returns GW2Map entity directly
            gw2MapEntity = await appContext.mapRepository.loadById(layout.id);
            console.log('[Debug] Loaded gw2MapEntity from repository:', gw2MapEntity);
            console.log('[Debug] gw2MapEntity.boundary:', gw2MapEntity?.boundary);

            if (gw2MapEntity) {
                const homesteadLayoutInstance = appContext.homesteadLayout;
                if (!homesteadLayoutInstance || typeof homesteadLayoutInstance.setMap !== 'function') {
                    throw new Error('HomesteadLayout is not available for map assignment');
                }
                homesteadLayoutInstance.setMap(gw2MapEntity);
                // Convert to legacy format for backward compatibility
                newMap = {
                    id: gw2MapEntity.id,
                    name: gw2MapEntity.name,
                    continent_id: gw2MapEntity.continent_id,
                    floor: gw2MapEntity.floor,
                    tiles: gw2MapEntity.tiles,
                    boundary: gw2MapEntity.boundary, // Keep MapBoundary instance
                    rect: gw2MapEntity.rect || { min: [0, 0], max: [1, 1] }
                };
                console.log('[Debug] Created newMap from gw2MapEntity:', newMap);
                console.log('[Debug] newMap.boundary after copy:', newMap.boundary);
            } else {
                throw new Error(`Failed to load map ${layout.id}`);
            }
        } else {
            throw new Error(`Cannot load map ${layout.id}: refactored architecture not initialized`);
        }

        // Step 5: For refactored architecture, create a default layer with decorations
        if (architectureInitialized && appContext) {
            const { appStore, homesteadLayout } = appContext;
            const { Layer } = await import('./src/domain/Layer.js');
            const { Decoration } = await import('./src/domain/Decoration.js');
            const { LAYER_COLORS } = await import('./src/config/constants.js');

            if (!homesteadLayout || typeof homesteadLayout.getAllLayers !== 'function' || typeof homesteadLayout.addLayer !== 'function') {
                throw new Error('HomesteadLayout is not available for default layer creation');
            }

            // Create a proper Layer domain entity with a random unused palette color
            const defaultLayerId = 'layer-' + Date.now();
            const layerName = fileName ? fileName.replace(/\.xml$/i, '') : 'Default Layer';
            const usedColors = new Set(homesteadLayout.getAllLayers().map(layer => layer.color));
            const unusedColors = (LAYER_COLORS as readonly string[]).filter(c => !usedColors.has(c));
            const pool = unusedColors.length > 0 ? unusedColors : (LAYER_COLORS as readonly string[]);
            const layerColor = pool[Math.floor(Math.random() * pool.length)];
            const defaultLayer = new Layer(defaultLayerId, layerName, true, layerColor);

            // Add decorations to the layer
            // Decoration.create() sets id = XML prop-type and assigns a unique uid.
            layout.decorations.forEach((decorationData) => {
                const decorationName = String(decorationData.name ?? 'Decoration');
                const decoration = Decoration.create(
                    decorationData.id,
                    decorationName,
                    { x: decorationData.position.x, y: decorationData.position.y, z: decorationData.position.z },
                    decorationData.rotation?.y || 0,  // Use y rotation as single rotation value
                    decorationData.scale || 1
                );
                if (decorationData.rotation && typeof decorationData.rotation === 'object') {
                    decoration.rotX = decorationData.rotation.x || 0;
                    decoration.rotZ = decorationData.rotation.z || 0;
                }
                defaultLayer.addDecoration(decoration);
            });

            // Add layer to layout
            homesteadLayout.addLayer(defaultLayer);

            // Update AppStore with layout and map - pass the HomesteadLayout instance
            console.log('[Debug] About to dispatch LOAD_LAYOUT with map:', newMap);
            console.log('[Debug] newMap.boundary:', newMap.boundary);
            console.log('[Debug] newMap.boundary type:', typeof newMap.boundary);
            console.log('[Debug] newMap.boundary.getBounds?', typeof newMap.boundary?.getBounds);

            appStore.dispatch('LOAD_LAYOUT', homesteadLayout);

            console.log(`✓ Created default layer with ${layout.decorations.length} decorations`);
        }

        // Step 6: Initialize map elements with the new map data
        if (isMapLoaded()) {
            initializeMapElements();
        }

        // Step 7: Enable add-layer button when a valid map is loaded
        updateAddLayerButtonState();

        // Step 8: Reset zoom to fit the new map
        resetZoom();

        console.log('[completeLayoutLoadingWorkflow] ✅ Layout load workflow complete');
        return layout;
    } catch (error) {
        console.error('[completeLayoutLoadingWorkflow] ❌ Error in workflow:', error);
        throw error;
    }
}

// Expose for use by FileDropZone component
(window as any).completeLayoutLoadingWorkflow = completeLayoutLoadingWorkflow;

/**
 * Load layout using the refactored XmlLayoutAdapter
 * Uses AppStore and EventBus instead of direct state manipulation
 */
async function loadLayoutWithRefactoredArchitecture(xmlString: string) {
    if (!appContext) {
        console.warn('Refactored architecture not initialized, using legacy loading');
        return loadLayoutFromXml(xmlString);
    }

    try {
        const { appStore, eventBus, homesteadLayout, appService } = appContext;

        // Use LoadLayoutCommand to load the layout properly
        const command = {
            type: 'LoadLayoutCommand',
            payload: {
                xmlContent: xmlString
            }
        };

        // Execute command - this will trigger domain events (await since it's async)
        const result = await appService.execute(command);

        // Parse for basic info (id, name) - we need this for map loading
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, 'application/xml');
        const xmlMap = xmlDoc.documentElement;
        const mapId = Number.parseInt(xmlMap.getAttribute('mapId') ?? '0', 10);
        const mapName = xmlMap.getAttribute('mapName') ?? '';

        // Decorations are already parsed by XmlLayoutAdapter
        const decorations = [...xmlDoc.getElementsByTagName('prop')]
            .map(xmlProp => {
                const posAttr = xmlProp.getAttribute('pos') ?? '0 0 0';
                const rotAttr = xmlProp.getAttribute('rot') ?? '0 0 0';
                const position = posAttr.split(' ');
                const rotation = rotAttr.split(' ');
                return {
                    id: Number.parseInt(xmlProp.getAttribute('id') ?? '0', 10),
                    name: xmlProp.getAttribute('name'),
                    position: {
                        x: Number.parseFloat(position[0] ?? '0'),
                        y: Number.parseFloat(position[1] ?? '0'),
                        z: Number.parseFloat(position[2] ?? '0')
                    },
                    rotation: {
                        x: Number.parseFloat(rotation[0] ?? '0'),
                        y: Number.parseFloat(rotation[1] ?? '0'),
                        z: Number.parseFloat(rotation[2] ?? '0')
                    },
                    scale: Number.parseFloat(xmlProp.getAttribute('scl') ?? '1')
                };
            });

        console.log('✓ Layout loaded with refactored architecture');

        // Return layout info for map loading
        return {
            id: mapId,
            name: mapName,
            decorations
        };
    } catch (error) {
        console.error('Error in refactored layout loading:', error);
        // Fall back to legacy loading
        return loadLayoutFromXml(xmlString);
    }
}

async function loadLayoutFromXml(xmlString: string) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'application/xml');

    // Check for parsing errors
    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
        throw new Error('XML parsing error: Invalid XML file');
    }

    const xmlMap = xmlDoc.documentElement;
    const mapId = Number.parseInt(xmlMap.getAttribute('mapId') ?? '0', 10);

    const layout = {
        id: mapId,
        name: xmlMap.getAttribute('mapName'),
        decorations: [...xmlDoc.getElementsByTagName('prop')]
            .map(xmlProp => {
                const posAttr = xmlProp.getAttribute('pos') ?? '0 0 0';
                const rotAttr = xmlProp.getAttribute('rot') ?? '0 0 0';
                const position = posAttr.split(' ');
                const rotation = rotAttr.split(' ');
                return {
                    id: Number.parseInt(xmlProp.getAttribute('id') ?? '0', 10),
                    name: xmlProp.getAttribute('name'),
                    position: {
                        x: Number.parseFloat(position[0] ?? '0'),
                        y: Number.parseFloat(position[1] ?? '0'),
                        z: Number.parseFloat(position[2] ?? '0')
                    },
                    rotation: {
                        x: Number.parseFloat(rotation[0] ?? '0'),
                        y: Number.parseFloat(rotation[1] ?? '0'),
                        z: Number.parseFloat(rotation[2] ?? '0')
                    },
                    scale: Number.parseFloat(xmlProp.getAttribute('scl') ?? '1')
                };
            })
    };

    return layout;
}



// Handle panel resizing
var isResizing = false;
var startX = 0;
var startWidth = 0;

var panelResizer = document.getElementById('panel-resizer');
toolPanel = document.getElementById('tool-panel');

// Guard: #panel-resizer and #tool-panel are only present in the legacy layout.
// In the DockManager architecture these elements do not exist, so skip binding.
if (panelResizer && toolPanel) {
    panelResizer.addEventListener('mousedown', function (e) {
        isResizing = true;
        startX = e.clientX;
        startWidth = toolPanel.offsetWidth;
    });

    document.addEventListener('mousemove', function (e) {
        if (!isResizing) return;

        var deltaX = startX - e.clientX; // Subtract because moving right should decrease panel width
        var newWidth = startWidth + deltaX;

        // Set minimum width of 200px
        if (newWidth < 200) newWidth = 200;

        toolPanel.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', function () {
        isResizing = false;
    });
}

/**
 * Handle files dropped onto the container
 * @param {FileList} files - The dropped files
 */
function handleDroppedFiles(files: FileList) {
    for (const file of files) {
        if (file.type === 'text/xml' || file.name.endsWith('.xml')) {
            const reader = new FileReader();
            reader.onload = async function (event) {
                try {
                    const xmlString = event.target?.result;
                    if (typeof xmlString !== 'string') {
                        throw new Error('Loaded file content was not text');
                    }

                    // Use the complete workflow function
                    await completeLayoutLoadingWorkflow(xmlString, file.name);
                } catch (error) {
                    console.error('Error reading file:', error);
                    alert('Error reading file: ' + getErrorMessage(error));
                }
            };
            reader.readAsText(file);
        } else {
            console.warn('Skipped non-XML file:', file.name);
        }
    }
}

/**
 * Initialize map elements after loading a new map.
 * Creates MapViewer component to handle SVG rendering.
 */
function initializeMapElements() {
    const chartContainer = document.getElementById('map-container');
    if (!chartContainer) {
        return;
    }

    // Remove the welcome dialog before replacing content
    const welcomeDialog = chartContainer.querySelector('#welcome-dialog');
    if (welcomeDialog) {
        welcomeDialog.remove();
    }

    chartContainer.innerHTML = `
        <svg>
            <g></g>
        </svg>
        <div class="move-selected-hint" role="status" hidden>Use the mouse to pan the map and move the selected decorations.</div>`;

    // set the dimensions and margins of the graph
    const { width, height } = getChartContainerDimensions();

    // Get the SVG element and the inner group
    const svgElement = chartContainer.querySelector('svg') as SVGSVGElement | null;
    const svgGroup = chartContainer.querySelector('svg g') as SVGGElement | null;
    if (svgGroup) {
        svgGroup.setAttribute('transform',
            'translate(' + UI_LAYOUT.MARGIN_LEFT + ',' + UI_LAYOUT.MARGIN_TOP + ')');
    }

    // Calculate the map bounds from the boundary polygon
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    const currentMap = getMap();
    console.log('[initializeMapElements] currentMap:', currentMap);
    console.log('[initializeMapElements] currentMap.boundary:', currentMap?.boundary);

    if (currentMap && currentMap.boundary) {
        // Handle both MapBoundary instance and plain array
        if (typeof currentMap.boundary.getBounds === 'function') {
            // MapBoundary instance with getBounds() method
            const bounds = currentMap.boundary.getBounds();
            minX = bounds.min.x;
            maxX = bounds.max.x;
            minY = bounds.min.y;
            maxY = bounds.max.y;
        } else if (Array.isArray(currentMap.boundary)) {
            // Plain array of points (legacy format)
            currentMap.boundary.forEach((point: { x: number; y: number }) => {
                minX = Math.min(minX, point.x);
                maxX = Math.max(maxX, point.x);
                minY = Math.min(minY, point.y);
                maxY = Math.max(maxY, point.y);
            });
        } else if (currentMap.boundary.points && Array.isArray(currentMap.boundary.points)) {
            // MapBoundary-like object with points array
            currentMap.boundary.points.forEach((point: { x: number; y: number }) => {
                minX = Math.min(minX, point.x);
                maxX = Math.max(maxX, point.x);
                minY = Math.min(minY, point.y);
                maxY = Math.max(maxY, point.y);
            });
        }
    } else if (currentMap && currentMap.tiles && currentMap.tiles.length > 0) {
        // Fallback to tile bounds if no boundary is available
        currentMap.tiles.forEach((tile: { mapCoords: { x: number; y: number }; tileSize: number }) => {
            minX = Math.min(minX, tile.mapCoords.x);
            maxX = Math.max(maxX, tile.mapCoords.x + tile.tileSize);
            minY = Math.min(minY, tile.mapCoords.y);
            maxY = Math.max(maxY, tile.mapCoords.y + tile.tileSize);
        });
    }

    // Fallback if still no bounds
    if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
        console.warn('Could not calculate map bounds, using default domain [0, 1000]');
        minX = 0; maxX = 1000; minY = 0; maxY = 1000;
    }

    // Calculate viewport size (no margins)
    const viewportWidth = width;
    const viewportHeight = height;

    const mapWidth = maxX - minX;
    const mapHeight = maxY - minY;

    // Expand domain to match viewport aspect ratio (same logic as resetZoom).
    // This also prevents degenerate [v, v] ranges when mapWidth or mapHeight is 0,
    // which would make every scale call return NaN.
    const chartAspect = viewportWidth / viewportHeight;
    const dataAspect = (mapWidth > 0 && mapHeight > 0) ? (mapWidth / mapHeight) : chartAspect;

    if (chartAspect > dataAspect) {
        const desiredRangeX = Math.max(mapWidth, 1) * chartAspect;
        const delta = Math.ceil((desiredRangeX - mapWidth) / 2);
        minX -= delta;
        maxX += delta;
    } else {
        const desiredRangeY = Math.max(mapHeight, 1) / chartAspect;
        const delta = Math.ceil((desiredRangeY - mapHeight) / 2);
        minY -= delta;
        maxY += delta;
    }

    // Safety guard: ensure the domain is never degenerate (min === max)
    if (minX === maxX) { minX -= 1; maxX += 1; }
    if (minY === maxY) { minY -= 1; maxY += 1; }

    // Create native scale functions using scaleLinear from scaleFactory
    const x: LinearScale = scaleLinear().domain([minX, maxX]).range([0, viewportWidth]) as LinearScale;
    const y: LinearScale = scaleLinear().domain([minY, maxY]).range([viewportHeight, 0]) as LinearScale;

    // Create scales for zoom transformation
    xZoom = x.copy();
    yZoom = y.copy();

    // Store the original copy for proper rescaling
    xZoomBase = x.copy();
    yZoomBase = y.copy();

    // Expose zoom functions globally for MapViewer component
    window.xZoom = xZoom as any;
    window.yZoom = yZoom as any;

    // Initialize ZoomStore if architecture is active
    if (architectureInitialized && appContext && zoomStore) {
        zoomStore.initialize(xZoom as any, yZoom as any, xZoomBase as any, yZoomBase as any);
        console.log('✓ ZoomStore initialized with scales');
    }

    // Create MapViewer instance if architecture is initialized
    if (architectureInitialized && appContext) {
        mapViewer = new MapViewer(svgElement as SVGSVGElement, zoomStore as any, appContext.appStore as any, appContext.selectionStore as any);
        console.log('✓ MapViewer component initialized');

        // Wire appService and shared contextMenu to MapViewer for DnD and context menu
        if (appContext.appService) {
            mapViewer.setAppService(appContext.appService);
        }
        mapViewer.setEventBus(appContext.eventBus);
        if (appContext.contextMenu) {
            mapViewer.setContextMenu(appContext.contextMenu);
        }
        // Wire ToolModeStore to MapViewer for rectangle selection (T097)
        if (appContext.toolModeStore) {
            mapViewer.setToolModeStore(appContext.toolModeStore);
        }

        // Trigger initial render with current AppStore state
        const currentState = appContext.appStore.getState();
        if (currentState.map) {
            console.log('✓ Rendering map with current state');
            mapViewer.render(currentState);
        }
    }

    if (!svgElement) {
        return;
    }

    // Initialize zoom handler with native events
    const margin = { top: UI_LAYOUT.MARGIN_TOP, right: UI_LAYOUT.MARGIN_RIGHT, bottom: UI_LAYOUT.MARGIN_BOTTOM, left: UI_LAYOUT.MARGIN_LEFT };
    initializeZoomHandler(svgElement, margin, width, height);
}

/**
 * Initialize zoom handler using native mouse and wheel events.
 * Uses the refactored createZoomHandler which integrates with ZoomStore
 * and ZoomCalculationService for proper state management.
 * 
 * @param {SVGElement} svgElement - The SVG element to attach zoom to
 * @param {Object} margin - Margin object with top, right, bottom, left
 * @param {number} width - Chart width
 * @param {number} height - Chart height
 */
function initializeZoomHandler(svgElement: SVGSVGElement, margin: { top: number; right: number; bottom: number; left: number }, width: number, height: number) {
    // Create zoom handler with refactored architecture
    const zoomHandler = createZoomHandler(svgElement, zoomStore as any, {
        minZoom: ZOOM.MIN_LEVEL,
        maxZoom: ZOOM.MAX_LEVEL,
        eventBus: architectureInitialized && appContext ? appContext.eventBus : null
    });

    // Store globally for reset functionality
    globalZoomHandler = zoomHandler;

    // Register zoom callback to update element positions when transform changes
    zoomHandler.on('zoom', (transform) => {
        // Update scales based on current zoom/pan transform
        // xZoomBase and yZoomBase are the original scales without zoom/pan
        // Use rescaleX/Y to adjust for the current zoom/pan
        xZoom = transform.rescaleX(xZoomBase as any) as any;
        yZoom = transform.rescaleY(yZoomBase as any) as any;

        // Update global references for MapViewer component (must happen before setZoom)
        window.xZoom = xZoom as any;
        window.yZoom = yZoom as any;

        // Update ZoomStore with new scales
        // This will trigger MapViewer to update if architecture is initialized
        if (zoomStore && zoomStore.isInitialized()) {
            zoomStore.setZoom(xZoom as any, yZoom as any);
        }

        // Call legacy zoomed() only if refactored architecture is NOT active
        // When architecture is active, MapViewer handles the updates via ZoomStore events
        if (!architectureInitialized || !mapViewer) {
            zoomed();
        }
    });
}

/**
 * Render elements using native DOM APIs with a simple loop pattern.
 * 
 * @param {Element} container - The parent element to append elements to
 * @param {Array} data - Array of data items to render
 * @param {string} tagName - The SVG/HTML tag name to create
 * @param {Function} attributeBuilder - Function that takes a data item and returns an object of attributes
 * @returns {Array<Element>} Array of created elements
 */


/**
 * Open file dialog to select an XML file
 */
function openFileDialog() {
    if (fileDropZone) {
        fileDropZone.browse();
    } else {
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            (fileInput as HTMLInputElement).click();
        }
    }
}

// ============================================================================
// LEGACY: File input change handler - NOW HANDLED BY FileDropZone COMPONENT
// ============================================================================
/*
const fileInput = document.getElementById('file-input');
fileInput.addEventListener('change', function (e) {
    const files = e.target.files;
    if (files.length > 0) {
        handleDroppedFiles(files);
        // Reset the input so the same file can be selected again
        fileInput.value = '';
    }
});
*/

// Expose functions to global scope for debugging and backwards compatibility
window.resetZoom = resetZoom;
window.openFileDialog = openFileDialog;
window.addDecorationRefactored = addDecorationRefactored;
window.deleteDecorationRefactored = deleteDecorationRefactored;
// Phase 6 map functions
window.getBoundaryInfo = getBoundaryInfo;
window.isPointInMapBoundary = isPointInMapBoundary;

// Initialize button state on page load
document.addEventListener('DOMContentLoaded', function () {
    console.log('[script.js] 🌐 ========== DOM CONTENT LOADED ==========');

    console.log('[script.js]   ↳ Updating add-layer button state...');
    updateAddLayerButtonState();

    // Set up event listeners for buttons (Phase 7 Component Migration)
    console.log('[script.js]   ↳ Setting up button event listeners...');
    const loadFileOverlayBtn = document.getElementById('load-file-overlay-btn');
    if (loadFileOverlayBtn) {
        console.log('[script.js]     • Binding load-file-overlay-btn');
        loadFileOverlayBtn.addEventListener('click', openFileDialog);
    }

    const loadUrlOverlayBtn = document.getElementById('load-url-overlay-btn');
    if (loadUrlOverlayBtn) {
        console.log('[script.js]     • Binding load-url-overlay-btn');
        loadUrlOverlayBtn.addEventListener('click', () => {
            const ribbonUrlBtn = document.querySelector('[data-action="ribbon-load-url"]') as HTMLButtonElement | null;
            ribbonUrlBtn?.click();
        });
    }

    const resetZoomBtn = document.getElementById('reset-zoom-btn');
    if (resetZoomBtn) {
        console.log('[script.js]     • Binding reset-zoom-btn');
        resetZoomBtn.addEventListener('click', resetZoomRefactored);
    }

    // Initialize refactored architecture
    console.log('[script.js]   ↳ Initializing refactored architecture...');
    setupRefactoredArchitecture().then((context) => {
        appContext = context;
        architectureInitialized = true;
        console.log('[script.js] ✅ Architecture initialization complete, architectureInitialized =', architectureInitialized);
        // Signal to Playwright (and other test harnesses) that the app is fully ready.
        document.body.setAttribute('data-app-ready', 'true');

        // Load layout from ?layout= URL parameter (if present)
        const layoutUrl = new URLSearchParams(window.location.search).get('layout');
        if (layoutUrl) {
            const isAbsolute = /^https?:\/\//i.test(layoutUrl);
            const isRelative = layoutUrl.startsWith('/');
            if (isAbsolute || isRelative) {
                console.log('[script.js]   ↳ Loading layout from URL parameter:', layoutUrl);
                const fileName = layoutUrl.split('/').pop()?.split('?')[0] || 'layout.xml';
                fetch(layoutUrl)
                    .then(res => {
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        return res.text();
                    })
                    .then(xmlContent => completeLayoutLoadingWorkflow(xmlContent, fileName))
                    .catch(err => console.error('[script.js] ❌ Failed to load layout from URL parameter:', err));
            } else {
                console.warn('[script.js] ⚠️  Ignoring invalid ?layout= URL:', layoutUrl);
            }
        }

        // Wire ribbon zoom buttons through EventBus → ZoomHandler
        if (!appContext) return;

        appContext.eventBus.subscribe('zoom:fit-requested', () => {
            if (!moveSelectedActive && !patternInteractionActive() && isMapLoaded()) resetZoom();
        });
        appContext.eventBus.subscribe('zoom:fit-selected-requested', () => {
            if (!globalZoomHandler || !appContext || !xZoomBase || !yZoomBase || moveSelectedActive || patternInteractionActive()) return;

            const selectedIds = new Set(appContext.selectionStore.getSelectedIds());
            if (selectedIds.size === 0) return;

            const layers = appContext.appStore.getState().layers ?? [];
            const selectedDecorations = layers.flatMap((layer: any) => {
                const decorations = typeof layer.getAllDecorations === 'function'
                    ? layer.getAllDecorations()
                    : layer.decorations instanceof Map
                        ? Array.from(layer.decorations.values())
                        : layer.decorations ?? [];
                return decorations.filter((decoration: any) => selectedIds.has(decoration.uid) && decoration.position);
            });
            if (selectedDecorations.length === 0) return;

            const points = selectedDecorations.map((decoration: any) => ({
                x: xZoomBase!(decoration.position.x),
                y: yZoomBase!(decoration.position.y)
            })).filter((point: { x: number; y: number }) => Number.isFinite(point.x) && Number.isFinite(point.y));
            if (points.length === 0) return;

            const minX = Math.min(...points.map((point: { x: number; y: number }) => point.x));
            const maxX = Math.max(...points.map((point: { x: number; y: number }) => point.x));
            const minY = Math.min(...points.map((point: { x: number; y: number }) => point.y));
            const maxY = Math.max(...points.map((point: { x: number; y: number }) => point.y));
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            const width = Math.max(maxX - minX, 40);
            const height = Math.max(maxY - minY, 40);
            const fit = ZoomCalculationService.calculateZoomToFitArea({
                min: { x: centerX - width / 2, y: centerY - height / 2 },
                width,
                height
            }, getChartContainerDimensions());

            globalZoomHandler.setTransform({ k: fit.zoom, x: fit.pan.x, y: fit.pan.y });
        });
        appContext.eventBus.subscribe('move:selected-start-requested', () => {
            if (!globalZoomHandler || !appContext || moveSelectedActive || patternInteractionActive()) return;
            moveSelectedPreviousTransform = globalZoomHandler.getTransform();
            appContext.eventBus.publish('zoom:fit-selected-requested');
            moveSelectedActive = true;
            globalZoomHandler.setInteractionsEnabled(true);
            const position = mapViewer?.beginMoveSelected();
            if (position) appContext.eventBus.publish('move:selected-position-changed', position);
        });
        appContext.eventBus.subscribe<{ x: number; y: number; z: number }>('move:selected-position-requested', position => {
            mapViewer?.setMoveSelectedPosition(position);
        });
        appContext.eventBus.subscribe<boolean>('move:selected-copy-changed', enabled => {
            mapViewer?.setMoveSelectedCopyEnabled(enabled);
        });
        appContext.eventBus.subscribe<string>('move:selected-copy-target-changed', layerId => {
            mapViewer?.setMoveSelectedCopyTargetLayer(layerId);
        });
        appContext.eventBus.subscribe('move:selected-save-requested', async () => {
            if (!moveSelectedActive) return;
            moveSelectedActive = false;
            globalZoomHandler?.setInteractionsEnabled(true);
            await mapViewer?.commitMoveSelected();
            moveSelectedPreviousTransform = null;
        });
        appContext.eventBus.subscribe('move:selected-cancel-requested', () => {
            if (!moveSelectedActive) return;
            moveSelectedActive = false;
            mapViewer?.cancelMoveSelected();
            globalZoomHandler?.setInteractionsEnabled(true);
            if (moveSelectedPreviousTransform) globalZoomHandler?.setTransform(moveSelectedPreviousTransform);
            moveSelectedPreviousTransform = null;
        });
        type ExtendPatternValues = {
            position: { x: number; y: number; z: number };
            rotation: { x: number; y: number; z: number };
        };
        type ExtendPatternOptions = {
            method: string;
            count: number;
            swapDirection: boolean;
            start: ExtendPatternValues;
            step: ExtendPatternValues;
        };
        const getSelectedPattern = () => {
            if (!appContext) return null;
            const selectedIds = appContext.selectionStore.getSelectedIds();
            if (selectedIds.length < 1 || selectedIds.length > 2) return null;
            const layers = appContext.appStore.getState().layers ?? [];
            const selected = selectedIds.map(decorationId => {
                for (const layer of layers as any[]) {
                    const decorations = typeof layer.getAllDecorations === 'function'
                        ? layer.getAllDecorations()
                        : layer.decorations instanceof Map
                            ? Array.from(layer.decorations.values())
                            : layer.decorations ?? [];
                    const decoration = typeof layer.getDecoration === 'function'
                        ? layer.getDecoration(decorationId)
                        : decorations.find((item: any) => item.uid === decorationId);
                    if (decoration) return { layer, decoration };
                }
                return null;
            });
            if (selected.some(item => !item?.decoration.position) ||
                selected.some(item => item?.decoration.id !== selected[0]?.decoration.id)) return null;
            return selected as Array<{ layer: any; decoration: any }>;
        };
        const buildExtendPatternCopies = (options: ExtendPatternOptions) => {
            const selected = getSelectedPattern();
            if (!selected) return null;
            const source = selected.length === 2 && options.swapDirection ? selected[0] : selected[selected.length - 1];
            const targetLayer = source.layer;
            const copies = Array.from({ length: options.count }, (_, index) => {
                const step = selected.length + index;
                return {
                    decorationId: source.decoration.uid,
                    name: source.decoration.name,
                    color: targetLayer.color,
                    position: {
                        x: options.start.position.x + options.step.position.x * step,
                        y: options.start.position.y + options.step.position.y * step,
                        z: options.start.position.z + options.step.position.z * step
                    },
                    rotation: options.start.rotation.y + options.step.rotation.y * step,
                    rotX: options.start.rotation.x + options.step.rotation.x * step,
                    rotZ: options.start.rotation.z + options.step.rotation.z * step
                };
            });
            return { selected, targetLayer, copies };
        };
        const fitPatternToScreen = (worldPoints: Array<{ x: number; y: number }>) => {
            if (!globalZoomHandler || !xZoomBase || !yZoomBase) return;
            const points = worldPoints.map(position => ({
                x: xZoomBase!(position.x),
                y: yZoomBase!(position.y)
            })).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
            if (points.length === 0) return;

            const minX = Math.min(...points.map(point => point.x));
            const maxX = Math.max(...points.map(point => point.x));
            const minY = Math.min(...points.map(point => point.y));
            const maxY = Math.max(...points.map(point => point.y));
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            const width = Math.max(maxX - minX, 40);
            const height = Math.max(maxY - minY, 40);
            const fit = ZoomCalculationService.calculateZoomToFitArea({
                min: { x: centerX - width / 2, y: centerY - height / 2 },
                width,
                height
            }, getChartContainerDimensions());
            globalZoomHandler.setTransform({ k: fit.zoom, x: fit.pan.x, y: fit.pan.y });
        };
        const updateExtendPatternPreview = (options: ExtendPatternOptions) => {
            if (!globalZoomHandler || !xZoomBase || !yZoomBase || options.method && options.method !== 'linear') return;
            const pattern = buildExtendPatternCopies(options);
            if (!pattern) {
                mapViewer?.setExtendPatternPreview([]);
                return;
            }

            const previews = pattern.copies.map((copy, index) => ({
                uid: `extend-pattern-preview-${index}`,
                name: copy.name,
                color: copy.color,
                position: copy.position
            }));
            if (pattern.selected.length === 2) {
                const movingSeed = options.swapDirection ? pattern.selected[0] : pattern.selected[1];
                previews.unshift({
                    uid: 'extend-pattern-moved-seed-preview',
                    name: movingSeed.decoration.name,
                    color: movingSeed.layer.color,
                    sourceDecorationId: movingSeed.decoration.uid,
                    position: {
                        x: options.start.position.x + options.step.position.x,
                        y: options.start.position.y + options.step.position.y,
                        z: options.start.position.z + options.step.position.z
                    }
                });
            }
            const movedSeedPosition = pattern.selected.length === 2 ? {
                x: options.start.position.x + options.step.position.x,
                y: options.start.position.y + options.step.position.y
            } : null;
            const worldPoints = [
                ...pattern.selected.map(item => item.decoration.position),
                ...(movedSeedPosition ? [movedSeedPosition] : []),
                ...pattern.copies.map(copy => copy.position)
            ];
            mapViewer?.setExtendPatternPreview(previews, [
                options.start.position,
                ...(movedSeedPosition ? [movedSeedPosition] : []),
                ...pattern.copies.map(copy => copy.position)
            ]);
            fitPatternToScreen(worldPoints);
        };

        appContext.eventBus.subscribe('extend:pattern-start-requested', () => {
            const selected = getSelectedPattern();
            if (!globalZoomHandler || !appContext || moveSelectedActive || patternInteractionActive() || !selected) return;
            const first = selected[0].decoration;
            const second = selected[1]?.decoration;
            const start: ExtendPatternValues = {
                position: { x: first.position.x, y: first.position.y, z: first.position.z ?? 0 },
                rotation: { x: first.rotX ?? 0, y: first.rotation ?? 0, z: first.rotZ ?? 0 }
            };
            const step: ExtendPatternValues = {
                position: {
                    x: second ? second.position.x - first.position.x : 0,
                    y: second ? second.position.y - first.position.y : 0,
                    z: second ? (second.position.z ?? 0) - (first.position.z ?? 0) : 0
                },
                rotation: {
                    x: second ? (second.rotX ?? 0) - (first.rotX ?? 0) : 0,
                    y: second ? (second.rotation ?? 0) - (first.rotation ?? 0) : 0,
                    z: second ? (second.rotZ ?? 0) - (first.rotZ ?? 0) : 0
                }
            };
            extendPatternPreviousTransform = globalZoomHandler.getTransform();
            extendPatternActive = true;
            globalZoomHandler.setInteractionsEnabled(false);
            const options: ExtendPatternOptions = { method: 'linear', count: 1, swapDirection: false, start, step };
            updateExtendPatternPreview(options);
            appContext.eventBus.publish('extend:pattern-seed-values-changed', { start, step });
        });
        appContext.eventBus.subscribe<ExtendPatternOptions>('extend:pattern-options-changed', options => {
            if (!extendPatternActive || !Number.isInteger(options?.count) || options.count < 1) return;
            updateExtendPatternPreview(options);
        });
        appContext.eventBus.subscribe<ExtendPatternOptions>('extend:pattern-save-requested', async options => {
            if (!extendPatternActive || !appContext || options?.method !== 'linear' || !Number.isInteger(options?.count) || options.count < 1) return;
            const pattern = buildExtendPatternCopies(options);
            if (!pattern) {
                appContext.eventBus.publish('extend:pattern-cancel-requested');
                return;
            }

            try {
                if (pattern.selected.length === 2) {
                    const movedSeed = pattern.selected[options.swapDirection ? 0 : 1];
                    const position = {
                        x: options.start.position.x + options.step.position.x,
                        y: options.start.position.y + options.step.position.y,
                        z: options.start.position.z + options.step.position.z,
                        rotation: options.start.rotation.y + options.step.rotation.y
                    };
                    await appContext.appService.execute({
                        type: 'UpdateDecorationsCommand',
                        payload: {
                            updates: [{
                                layerId: movedSeed.layer.id,
                                decorationId: movedSeed.decoration.uid,
                                position,
                                rotation: position.rotation,
                                rotX: options.start.rotation.x + options.step.rotation.x,
                                rotZ: options.start.rotation.z + options.step.rotation.z
                            }]
                        }
                    });
                }
                await appContext.appService.execute({
                    type: 'CopyDecorationsCommand',
                    payload: {
                        targetLayerId: pattern.targetLayer.id,
                        copies: pattern.copies.map(({ decorationId, position, rotation, rotX, rotZ }) => ({ decorationId, position, rotation, rotX, rotZ }))
                    }
                });
                mapViewer?.setExtendPatternPreview([]);
                extendPatternActive = false;
                globalZoomHandler?.setInteractionsEnabled(true);
                extendPatternPreviousTransform = null;
                appContext.eventBus.publish('extend:pattern-completed');
            } catch (error) {
                console.error('[ExtendDecorationPattern] Failed to create pattern copies:', error);
                appContext.eventBus.publish('extend:pattern-cancel-requested');
                alert(`Could not extend decoration pattern: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
        appContext.eventBus.subscribe('extend:pattern-cancel-requested', () => {
            if (!extendPatternActive) return;
            extendPatternActive = false;
            mapViewer?.setExtendPatternPreview([]);
            globalZoomHandler?.setInteractionsEnabled(true);
            if (extendPatternPreviousTransform) globalZoomHandler?.setTransform(extendPatternPreviousTransform);
            extendPatternPreviousTransform = null;
        });
        appContext.eventBus.subscribe('fill:pattern-start-requested', () => {
            const selected = getSelectedPattern();
            if (!globalZoomHandler || !appContext || moveSelectedActive || patternInteractionActive() || selected?.length !== 2) return;
            const toValues = (decoration: any): ExtendPatternValues => ({
                position: { x: decoration.position.x, y: decoration.position.y, z: decoration.position.z ?? 0 },
                rotation: { x: decoration.rotX ?? 0, y: decoration.rotation ?? 0, z: decoration.rotZ ?? 0 }
            });
            const first = toValues(selected[0].decoration);
            const second = toValues(selected[1].decoration);
            fillPatternActive = true;
            globalZoomHandler.setInteractionsEnabled(false);
            appContext.eventBus.publish('fill:pattern-seed-values-changed', { start: first, end: second });
            updateFillPatternPreview(1, selected, first, second);
        });
        const updateFillPatternPreview = (count: number, selected: Array<{ layer: any; decoration: any }>, start: ExtendPatternValues, end: ExtendPatternValues) => {
            const copies = Array.from({ length: count }, (_, index) => {
                const fraction = (index + 1) / (count + 1);
                return {
                    uid: `fill-pattern-preview-${index}`,
                    name: selected[0].decoration.name,
                    color: selected[0].layer.color,
                    position: {
                        x: start.position.x + (end.position.x - start.position.x) * fraction,
                        y: start.position.y + (end.position.y - start.position.y) * fraction
                    }
                };
            });
            const guidePoints = [
                ...selected.map(item => item.decoration.position),
                ...copies.map(copy => copy.position)
            ];
            mapViewer?.setExtendPatternPreview(copies, guidePoints);
            fitPatternToScreen([
                ...selected.map(item => item.decoration.position),
                ...copies.map(copy => copy.position)
            ]);
        };
        const getFillPattern = (count: number) => {
            const selected = getSelectedPattern();
            if (!selected || selected.length !== 2) return null;
            const first = selected[0].decoration;
            const second = selected[1].decoration;
            const start: ExtendPatternValues = {
                position: { x: first.position.x, y: first.position.y, z: first.position.z ?? 0 },
                rotation: { x: first.rotX ?? 0, y: first.rotation ?? 0, z: first.rotZ ?? 0 }
            };
            const end: ExtendPatternValues = {
                position: { x: second.position.x, y: second.position.y, z: second.position.z ?? 0 },
                rotation: { x: second.rotX ?? 0, y: second.rotation ?? 0, z: second.rotZ ?? 0 }
            };
            const copies = Array.from({ length: count }, (_, index) => {
                const fraction = (index + 1) / (count + 1);
                return {
                    decorationId: first.uid,
                    position: {
                        x: start.position.x + (end.position.x - start.position.x) * fraction,
                        y: start.position.y + (end.position.y - start.position.y) * fraction,
                        z: start.position.z + (end.position.z - start.position.z) * fraction
                    },
                    rotation: start.rotation.y + (end.rotation.y - start.rotation.y) * fraction,
                    rotX: start.rotation.x + (end.rotation.x - start.rotation.x) * fraction,
                    rotZ: start.rotation.z + (end.rotation.z - start.rotation.z) * fraction
                };
            });
            return { selected, copies, start, end };
        };
        appContext.eventBus.subscribe<{ count: number }>('fill:pattern-options-changed', options => {
            if (!fillPatternActive || !Number.isInteger(options?.count) || options.count < 1) return;
            const pattern = getFillPattern(options.count);
            if (pattern) updateFillPatternPreview(options.count, pattern.selected, pattern.start, pattern.end);
        });
        appContext.eventBus.subscribe<{ count: number }>('fill:pattern-save-requested', async options => {
            if (!fillPatternActive || !appContext || !Number.isInteger(options?.count) || options.count < 1) return;
            const pattern = getFillPattern(options.count);
            if (!pattern) {
                appContext.eventBus.publish('fill:pattern-cancel-requested');
                return;
            }
            try {
                await appContext.appService.execute({
                    type: 'CopyDecorationsCommand',
                    payload: {
                        targetLayerId: pattern.selected[0].layer.id,
                        copies: pattern.copies
                    }
                });
                mapViewer?.setExtendPatternPreview([]);
                fillPatternActive = false;
                globalZoomHandler?.setInteractionsEnabled(true);
                appContext.eventBus.publish('fill:pattern-completed');
            } catch (error) {
                console.error('[FillDecorationPattern] Failed to create pattern copies:', error);
                appContext.eventBus.publish('fill:pattern-cancel-requested');
                alert(`Could not fill decoration pattern: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
        appContext.eventBus.subscribe('fill:pattern-cancel-requested', () => {
            if (!fillPatternActive) return;
            fillPatternActive = false;
            mapViewer?.setExtendPatternPreview([]);
            globalZoomHandler?.setInteractionsEnabled(true);
        });
        appContext.eventBus.subscribe('zoom:in-requested', () => {
            if (!globalZoomHandler || moveSelectedActive || patternInteractionActive()) return;
            const t = globalZoomHandler.getTransform();
            const svgEl = document.getElementById('map-container')?.querySelector('svg');
            if (!svgEl) return;
            const rect = svgEl.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const factor = 1.2;
            const newK = t.k * factor;
            globalZoomHandler.setTransform({
                k: newK,
                x: cx - (cx - t.x) * factor,
                y: cy - (cy - t.y) * factor
            });
        });
        appContext.eventBus.subscribe('zoom:out-requested', () => {
            if (!globalZoomHandler || moveSelectedActive || patternInteractionActive()) return;
            const t = globalZoomHandler.getTransform();
            const svgEl = document.getElementById('map-container')?.querySelector('svg');
            if (!svgEl) return;
            const rect = svgEl.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const factor = 1 / 1.2;
            const newK = t.k * factor;
            globalZoomHandler.setTransform({
                k: newK,
                x: cx - (cx - t.x) * factor,
                y: cy - (cy - t.y) * factor
            });
        });
    }).catch((error) => {
        console.error('[script.js] ❌ Architecture initialization failed:', error);
    });

    // T118: Re-fit map on window resize using container dimensions
    window.addEventListener('resize', () => {
        if (!moveSelectedActive && !patternInteractionActive() && isMapLoaded()) {
            resetZoom();
        }
    });

    // T119: Re-fit map when the chart container changes size (e.g. panels toggled)
    const chartContainerForObserver = document.getElementById('map-container');
    if (chartContainerForObserver && typeof ResizeObserver !== 'undefined') {
        const containerResizeObserver = new ResizeObserver(() => {
            if (!moveSelectedActive && !patternInteractionActive() && isMapLoaded()) {
                resetZoom();
            }
        });
        containerResizeObserver.observe(chartContainerForObserver);
    }
});
