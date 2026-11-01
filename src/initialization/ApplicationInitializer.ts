/**
 * ApplicationInitializer
 * Bootstraps the refactored architecture
 * Sets up AppService, stores, and event bindings
 * 
 * NOTE: Domain classes use CommonJS exports, so they cannot be imported directly
 * in ES modules. They are instantiated server-side or deferred until needed.
 */

import { AppStore, appStore } from '../ui/stores/AppStore.js';
import { ZoomStore, zoomStore } from '../ui/stores/ZoomStore.js';
import { SelectionStore } from '../ui/stores/SelectionStore.js';
import { EventBus, eventBus } from '../ui/EventBus.js';
import { InfrastructureFactory } from '../infrastructure/InfrastructureFactory.js';
import { HomesteadLayout } from '../domain/HomesteadLayout.js';
import { AppService } from '../application/AppService.js';
import { DockPanelLayoutStore } from '../ui/stores/DockPanelLayoutStore.js';
import { PanelLayoutRepository } from '../infrastructure/repositories/PanelLayoutRepository.js';
import { SettingsRepository } from '../infrastructure/repositories/SettingsRepository.js';
import { DockManager } from '../ui/components/DockManager.js';
import { DockPanelHandler } from '../application/handlers/DockPanelHandler.js';
import { MergePanelToTabHandler } from '../application/handlers/MergePanelToTabHandler.js';
import { StackPanelHandler } from '../application/handlers/StackPanelHandler.js';
import { ReorderPanelHandler } from '../application/handlers/ReorderPanelHandler.js';
import { ResizeDockHandler } from '../application/handlers/ResizeDockHandler.js';
import { ResetLayoutHandler } from '../application/handlers/ResetLayoutHandler.js';
import { UndoRedoManager } from '../application/UndoRedoManager.js';
import { SwitchMapHandler } from '../application/handlers/SwitchMapHandler.js';
import { ToggleLayerVisibilityHandler } from '../application/handlers/ToggleLayerVisibilityHandler.js';
import { DeleteLayerHandler } from '../application/handlers/DeleteLayerHandler.js';
import { CreateLayerHandler } from '../application/handlers/CreateLayerHandler.js';
import { UpdateDecorationHandler } from '../application/handlers/UpdateDecorationHandler.js';
import { MoveDecorationsHandler } from '../application/handlers/MoveDecorationsHandler.js';
import { CopyDecorationsHandler } from '../application/handlers/CopyDecorationsHandler.js';
import { MergeLayerHandler } from '../application/handlers/MergeLayerHandler.js';
import { DeleteDecorationsHandler } from '../application/handlers/DeleteDecorationsHandler.js';
import { ExportLayersHandler } from '../application/handlers/ExportLayersHandler.js';
import { ExportDialog } from '../ui/components/ExportDialog.js';
import { CraftMissingDecorationsDialog } from '../ui/components/CraftMissingDecorationsDialog.js';
import { ConfirmDialog } from '../ui/components/ConfirmDialog.js';
import { ContextMenu } from '../ui/components/ContextMenu.js';
import { DecorationInfoDialog } from '../ui/components/DecorationInfoDialog.js';
import { DecorationListPanel } from '../ui/components/DecorationListPanel.js';
import { SettingsDialog } from '../ui/components/SettingsDialog.js';
import { ThemeManager } from '../ui/ThemeManager.js';
import { ToolModeStore } from '../ui/stores/ToolModeStore.js';
import { Layer } from '../domain/Layer.js';
import { Decoration } from '../domain/Decoration.js';
import { WorldCoordinate } from '../domain/WorldCoordinate.js';
import { AccountDecorationInventory } from '../domain/AccountDecorationInventory.js';
import { MapType } from '../domain/MapType.js';
import type { UndoRecord } from '../application/UndoRecord.js';

declare global {
    interface Window {
        requireCommand?: (name: string) => new (data: Record<string, unknown>) => { constructor: { name: string } };
        requireQuery?: (name: string) => new (data: Record<string, unknown>) => { constructor: { name: string } };
    }
}

type UndoExecutor = { undo(record: UndoRecord): void; redo(record: UndoRecord): void };

interface ApplicationContext {
    appService: AppService;
    infrastructure: InfrastructureFactory;
    mapRepository: ReturnType<InfrastructureFactory['getMapRepository']>;
    appStore: AppStore;
    zoomStore: ZoomStore;
    selectionStore: SelectionStore;
    eventBus: EventBus;
    homesteadLayout: HomesteadLayout;
    xmlAdapter: ReturnType<InfrastructureFactory['getLayoutAdapter']>;
    layoutStore?: DockPanelLayoutStore;
    panelLayoutRepository?: PanelLayoutRepository;
    undoRedoManager?: UndoRedoManager;
    undoExecutors?: Record<string, UndoExecutor>;
    contextMenu?: ContextMenu;
    _keydownHandler?: (event: KeyboardEvent) => void;
    exportDialog?: ExportDialog;
    craftMissingDecorationsDialog?: CraftMissingDecorationsDialog;
    settingsRepository?: SettingsRepository;
    settingsDialog?: SettingsDialog;
    themeManager?: ThemeManager;
    accountDecorationInventory?: AccountDecorationInventory | null;
    confirmDialog?: ConfirmDialog;
    toolModeStore?: ToolModeStore;
    dockManager?: DockManager;
    decorationListPanel?: DecorationListPanel;
}

interface DecorationUndoDTO {
    id: string | number;
    uid?: string;
    name: string;
    position: { x: number; y: number; z?: number; rotation?: number };
    rotation: number;
    rotX?: number;
    rotZ?: number;
    scale: number;
}

/**
 * Initialize the entire application with refactored architecture
 * Async function that initializes AppService and all stores
 */
export async function initializeApplication(): Promise<ApplicationContext> {
    console.log('[ApplicationInitializer] 🚀 Starting application initialization...');

    // Create infrastructure factory
    console.log('[ApplicationInitializer]   ↳ Creating InfrastructureFactory...');
    const infrastructure = new InfrastructureFactory();

    // Get infrastructure components
    console.log('[ApplicationInitializer]   ↳ Initializing infrastructure adapters and repositories...');
    const xmlAdapter = infrastructure.getLayoutAdapter();
    const mapRepository = infrastructure.getMapRepository();

    // Create HomesteadLayout instance (now that it's an ES module)
    console.log('[ApplicationInitializer]   ↳ Creating HomesteadLayout...');
    const homesteadLayout = new HomesteadLayout('default', 'New Layout');

    // Get or use existing stores (these are singletons)
    console.log('[ApplicationInitializer]   ↳ Getting singleton stores...');
    const appStoreInstance = appStore; // Use singleton from AppStore.js
    const zoomStoreInstance = zoomStore; // Use singleton from ZoomStore.js
    const selectionStore = new SelectionStore();

    // Create AppService instance
    console.log('[ApplicationInitializer]   ↳ Creating AppService...');
    const appService = await AppService.createAsync(homesteadLayout, xmlAdapter);

    // Set the AppStore on AppService so it can dispatch actions
    console.log('[ApplicationInitializer]   ↳ Setting AppStore on AppService...');
    appService.setAppStore(appStoreInstance);

    // Re-register ToggleLayerVisibilityHandler with selectionStore for auto-deselect on hide
    console.log('[ApplicationInitializer]   ↳ Re-registering ToggleLayerVisibilityHandler with SelectionStore...');
    appService.registerCommandHandler('ToggleLayerVisibilityCommand', new ToggleLayerVisibilityHandler(homesteadLayout, selectionStore));

    // Create application context
    const context: ApplicationContext = {
        appService, // Now properly initialized
        infrastructure, // Infrastructure factory for accessing repositories
        mapRepository,
        appStore: appStoreInstance,
        zoomStore: zoomStoreInstance,
        selectionStore,
        contextMenu: new ContextMenu(),
        eventBus,
        homesteadLayout,
        xmlAdapter
    };

    // Create LayoutRepository (localStorage persistence for layout)
    console.log('[ApplicationInitializer]   ↳ Creating LayoutRepository...');
    const panelLayoutRepository = new PanelLayoutRepository();

    // Create LayoutStore with auto-persist wired in
    console.log('[ApplicationInitializer]   ↳ Creating LayoutStore...');
    const layoutStore = new DockPanelLayoutStore(eventBus, panelLayoutRepository);

    // Restore persisted layout (falls back to default on missing / invalid data)
    console.log('[ApplicationInitializer]   ↳ Restoring saved layout from localStorage...');
    const savedLayout = panelLayoutRepository.load();
    layoutStore.setState(savedLayout);
    eventBus.publish('layout:restored', savedLayout);

    context.layoutStore = layoutStore;
    context.panelLayoutRepository = panelLayoutRepository;

    // Register layout-related command handlers (depend on layoutStore)
    console.log('[ApplicationInitializer]   ↳ Registering layout command handlers...');
    appService.registerCommandHandler('DockPanelCommand', new DockPanelHandler(layoutStore));
    appService.registerCommandHandler('MergePanelToTabCommand', new MergePanelToTabHandler(layoutStore));
    appService.registerCommandHandler('StackPanelCommand', new StackPanelHandler(layoutStore));
    appService.registerCommandHandler('ReorderPanelCommand', new ReorderPanelHandler(layoutStore));
    appService.registerCommandHandler('ResizeDockCommand', new ResizeDockHandler(layoutStore));
    appService.registerCommandHandler('ResetLayoutCommand', new ResetLayoutHandler(layoutStore, panelLayoutRepository));

    // Create UndoRedoManager and register SwitchMapHandler
    console.log('[ApplicationInitializer]   ↳ Creating UndoRedoManager...');
    const undoRedoManager = new UndoRedoManager();
    context.undoRedoManager = undoRedoManager;

    console.log('[ApplicationInitializer]   ↳ Registering SwitchMapHandler...');
    appService.registerCommandHandler('SwitchMapCommand', new SwitchMapHandler(homesteadLayout, xmlAdapter, undoRedoManager));

    // Re-register DeleteLayerHandler with selectionStore and undoRedoManager for deselect + undo
    console.log('[ApplicationInitializer]   ↳ Re-registering DeleteLayerHandler with SelectionStore + UndoRedoManager...');
    appService.registerCommandHandler('DeleteLayerCommand', new DeleteLayerHandler(homesteadLayout, selectionStore, undoRedoManager));

    // Re-register CreateLayerHandler with undoRedoManager for undo support
    console.log('[ApplicationInitializer]   ↳ Re-registering CreateLayerHandler with UndoRedoManager...');
    appService.registerCommandHandler('CreateLayerCommand', new CreateLayerHandler(homesteadLayout, undoRedoManager));

    // Register MoveDecorationsHandler with undoRedoManager
    console.log('[ApplicationInitializer]   ↳ Registering MoveDecorationsHandler...');
    appService.registerCommandHandler('MoveDecorationsCommand', new MoveDecorationsHandler(homesteadLayout, undoRedoManager));

    // Re-register UpdateDecorationHandler with undoRedoManager
    console.log('[ApplicationInitializer]   ↳ Registering UpdateDecorationHandler with UndoRedoManager...');
    appService.registerCommandHandler('UpdateDecorationCommand', new UpdateDecorationHandler(homesteadLayout, undoRedoManager));

    // Register CopyDecorationsHandler with undo support
    appService.registerCommandHandler('CopyDecorationsCommand', new CopyDecorationsHandler(homesteadLayout, undoRedoManager));

    // Register MergeLayerHandler with selectionStore and undoRedoManager
    console.log('[ApplicationInitializer]   ↳ Registering MergeLayerHandler...');
    appService.registerCommandHandler('MergeLayerCommand', new MergeLayerHandler(homesteadLayout, selectionStore, undoRedoManager));

    // Register DeleteDecorationsHandler with selectionStore and undoRedoManager
    console.log('[ApplicationInitializer]   ↳ Registering DeleteDecorationsHandler...');
    appService.registerCommandHandler('DeleteDecorationsCommand', new DeleteDecorationsHandler(homesteadLayout, selectionStore, undoRedoManager));

    // Register ExportLayersHandler with appStore (needs appStore for state access)
    console.log('[ApplicationInitializer]   ↳ Registering ExportLayersHandler...');
    appService.registerCommandHandler('ExportLayersCommand', new ExportLayersHandler(appStoreInstance));

    // Wire undo/redo execution for DELETE_LAYER records
    // When undo returns a DELETE_LAYER record, re-add the deleted layer with its decorations.
    // When redo returns a DELETE_LAYER record, re-delete the layer.
    console.log('[ApplicationInitializer]   ↳ Registering undo executors...');
    const undoExecutors: Record<string, UndoExecutor> = {
        DeleteLayerCommand: {
            undo(record) {
                const { layerId, layerName, isVisible, wasActive, decorations } = record.reverseData as unknown as {
                    layerId: string; layerName: string; isVisible: boolean; wasActive: boolean; decorations: DecorationUndoDTO[];
                };
                const layer = new Layer(layerId, layerName, isVisible);
                for (const dto of decorations) {
                    const position = new WorldCoordinate(
                        dto.position.x, dto.position.y,
                        dto.position.z || 0, dto.position.rotation || 0
                    );
                    const decoration = new Decoration(dto.id, dto.name, position, dto.rotation, dto.scale);
                    if (dto.uid) decoration.uid = dto.uid; // restore internal uid
                    layer.addDecoration(decoration);
                }
                homesteadLayout.addLayer(layer);
                if (wasActive) {
                    homesteadLayout.setActiveLayer(layerId);
                }
                appStoreInstance.dispatch('CREATE_LAYER', layer);
            },
            redo(record) {
                const { layerId } = record.forwardData as { layerId: string };
                appService.execute({ type: 'DeleteLayerCommand', payload: { layerId } });
            }
        },
        MoveDecorationsCommand: {
            undo(record) {
                // reverseData.sourceMapping is { decorationId: sourceLayerId }
                // reverseData.originalIndices is { decorationId: index }
                const { sourceMapping, originalIndices } = record.reverseData as unknown as {
                    sourceMapping: Record<string, string>; originalIndices?: Record<string, number>;
                };
                // Sort by original index descending so earlier inserts don't shift later ones
                const entries = Object.entries(sourceMapping)
                    .map(([id, layerId]) => ({ id, layerId, index: (originalIndices && originalIndices[id] !== undefined) ? originalIndices[id] : -1 }))
                    .sort((a, b) => a.index - b.index);
                for (const { id, layerId, index } of entries) {
                    // Remove from current layer
                    const currentLayer = homesteadLayout.getDecorationLayer(id);
                    if (currentLayer) {
                        const decoration = currentLayer.getDecoration(id);
                        if (!decoration) continue;
                        currentLayer.removeDecoration(id);
                        const targetLayer = homesteadLayout.getLayer(layerId);
                        if (targetLayer) {
                            if (index >= 0) {
                                targetLayer.insertDecorationAt(decoration, index);
                            } else {
                                targetLayer.addDecoration(decoration);
                            }
                        }
                    }
                }
                appStoreInstance.dispatch('MOVE_DECORATIONS', { sourceMapping });
            },
            redo(record) {
                const { decorationIds, targetLayerId } = record.forwardData as { decorationIds: string[]; targetLayerId: string };
                homesteadLayout.moveDecorations(decorationIds, targetLayerId);
                appStoreInstance.dispatch('MOVE_DECORATIONS', { decorationIds, targetLayerId });
            }
        },
        CreateLayerCommand: {
            undo(record) {
                const { layerId } = record.reverseData as { layerId: string };
                homesteadLayout.removeLayer(layerId);
                appStoreInstance.dispatch('DELETE_LAYER', layerId);
            },
            redo(record) {
                const { layerId, layerName, isVisible } = record.forwardData as { layerId: string; layerName: string; isVisible: boolean };
                const layer = new Layer(layerId, layerName, isVisible);
                homesteadLayout.addLayer(layer);
                appStoreInstance.dispatch('CREATE_LAYER', layer);
            }
        },
        UpdateDecorationCommand: {
            undo(record) {
                appService.execute({
                    type: 'UpdateDecorationCommand',
                    payload: { ...record.reverseData, recordUndo: false }
                });
            },
            redo(record) {
                appService.execute({
                    type: 'UpdateDecorationCommand',
                    payload: { ...record.forwardData, recordUndo: false }
                });
            }
        },
        DeleteDecorationsCommand: {
            undo(record) {
                // Restore deleted decorations to their original layers at original indices
                const { removedData } = record.reverseData as unknown as {
                    removedData: Record<string, { sourceLayerId: string; decoration: DecorationUndoDTO; originalIndex: number }>;
                };
                // Sort by original index ascending so earlier positions are inserted first
                const entries = Object.entries(removedData)
                    .map(([id, data]) => ({ id, ...data }))
                    .sort((a, b) => (a.originalIndex ?? -1) - (b.originalIndex ?? -1));
                for (const { id, sourceLayerId, decoration: dto, originalIndex } of entries) {
                    const layer = homesteadLayout.getLayer(sourceLayerId);
                    if (layer) {
                        const position = new WorldCoordinate(
                            dto.position.x, dto.position.y,
                            dto.position.z || 0, dto.position.rotation || 0
                        );
                        const decoration = new Decoration(dto.id, dto.name, position, dto.rotation, dto.scale);
                        if (dto.uid) decoration.uid = dto.uid; // restore internal uid
                        if (originalIndex >= 0) {
                            layer.insertDecorationAt(decoration, originalIndex);
                        } else {
                            layer.addDecoration(decoration);
                        }
                    }
                }
                appStoreInstance.dispatch('DELETE_DECORATIONS', { restored: true });
            },
            redo(record) {
                const { decorationIds } = record.forwardData as { decorationIds: string[] };
                homesteadLayout.removeDecorations(decorationIds);
                appStoreInstance.dispatch('DELETE_DECORATIONS', { decorationIds });
            }
        },
        CopyDecorationsCommand: {
            undo(record) {
                const { decorationIds } = record.reverseData as unknown as { decorationIds: string[] };
                homesteadLayout.removeDecorations(decorationIds);
                appStoreInstance.dispatch('DELETE_DECORATIONS', { decorationIds });
            },
            redo(record) {
                const { targetLayerId, decorations } = record.forwardData as unknown as {
                    targetLayerId: string;
                    decorations: DecorationUndoDTO[];
                };
                for (const dto of decorations) {
                    const position = new WorldCoordinate(
                        dto.position.x, dto.position.y,
                        dto.position.z || 0, dto.position.rotation || 0
                    );
                    const decoration = new Decoration(dto.id, dto.name, position, dto.rotation, dto.scale);
                    if (dto.uid) decoration.uid = dto.uid;
                    decoration.rotX = dto.rotX || 0;
                    decoration.rotZ = dto.rotZ || 0;
                    homesteadLayout.addDecorationToLayer(targetLayerId, decoration);
                    appStoreInstance.dispatch('ADD_DECORATION', { layerId: targetLayerId, decoration });
                }
            }
        },
        MergeLayerCommand: {
            undo(record) {
                // Re-create the source layer with its original decorations,
                // removing those decorations from the target layer first.
                const { sourceLayerId, sourceLayerName, sourceLayerIsVisible, wasActive, targetLayerId, decorationDTOs } = record.reverseData as unknown as {
                    sourceLayerId: string; sourceLayerName: string; sourceLayerIsVisible: boolean; wasActive: boolean;
                    targetLayerId: string; decorationDTOs: DecorationUndoDTO[];
                };
                const layer = new Layer(sourceLayerId, sourceLayerName, sourceLayerIsVisible);
                for (const dto of decorationDTOs) {
                    const position = new WorldCoordinate(
                        dto.position.x, dto.position.y,
                        dto.position.z || 0, dto.position.rotation || 0
                    );
                    const decoration = new Decoration(dto.id, dto.name, position, dto.rotation, dto.scale);
                    if (dto.uid) decoration.uid = dto.uid;
                    // Remove from target layer if present (use uid — the Layer Map key)
                    const targetLayer = homesteadLayout.getLayer(targetLayerId);
                    const lookupKey = String(dto.uid || dto.id);
                    if (targetLayer && targetLayer.getDecoration(lookupKey)) {
                        targetLayer.removeDecoration(String(lookupKey));
                    }
                    layer.addDecoration(decoration);
                }
                homesteadLayout.addLayer(layer);
                if (wasActive) {
                    homesteadLayout.setActiveLayer(sourceLayerId);
                }
                appStoreInstance.dispatch('CREATE_LAYER', layer);
            },
            redo(record) {
                const { sourceLayerId, targetLayerId } = record.forwardData as { sourceLayerId: string; targetLayerId: string };
                appService.execute({ type: 'MergeLayerCommand', payload: { sourceLayerId, targetLayerId } });
            }
        }
    };
    context.undoExecutors = undoExecutors;

    // Wire undo/redo execution via EventBus
    // When 'undo:requested' is published, pop from undo stack and execute reverse
    // When 'redo:requested' is published, pop from redo stack and execute forward
    console.log('[ApplicationInitializer]   ↳ Wiring undo/redo execution via EventBus...');
    eventBus.subscribe('undo:requested', () => {
        const record = undoRedoManager.undo();
        if (record && undoExecutors[record.commandType]) {
            undoExecutors[record.commandType].undo(record);
        }
    });
    eventBus.subscribe('redo:requested', () => {
        const record = undoRedoManager.redo();
        if (record && undoExecutors[record.commandType]) {
            undoExecutors[record.commandType].redo(record);
        }
    });

    // Centralized keyboard shortcut handler (T056)
    console.log('[ApplicationInitializer]   ↳ Setting up centralized keyboard shortcuts...');
    const keydownHandler = (e: KeyboardEvent) => {
        // Skip when focus is in input, textarea, or contenteditable
        const target = e.target;
        if (target instanceof HTMLElement &&
            (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
            return;
        }

        // Ctrl+Z (or Cmd+Z on Mac) → Undo
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
            e.preventDefault();
            eventBus.publish('undo:requested');
            return;
        }

        // Ctrl+Y or Ctrl+Shift+Z → Redo
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
            e.preventDefault();
            eventBus.publish('redo:requested');
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
            e.preventDefault();
            eventBus.publish('redo:requested');
            return;
        }

        // Ctrl+1–9 → Move selected decorations to Nth layer by panel order
        if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
            const layerIndex = parseInt(e.key, 10) - 1;
            const layers = appStoreInstance.getState().layers || [];
            if (layerIndex < layers.length && selectionStore.getSelectionCount() > 0) {
                e.preventDefault();
                const targetLayer = layers[layerIndex];
                const selectedIds = selectionStore.getSelectedIds();
                appService.execute({
                    type: 'MoveDecorationsCommand',
                    payload: { decorationIds: selectedIds, targetLayerId: targetLayer.id }
                });
            }
            return;
        }

        // Delete/Backspace → Delete selected decorations (T083)
        if (e.key === 'Delete' || e.key === 'Backspace') {
            const selectedIds = selectionStore.getSelectedIds();
            if (selectedIds.length > 0) {
                e.preventDefault();
                eventBus.publish('confirm:deleteDecorations', { decorationIds: selectedIds });
            }
            return;
        }

        // Escape → Clear selection and close context menu (T084)
        if (e.key === 'Escape') {
            if (context.contextMenu && context.contextMenu.isVisible()) {
                context.contextMenu.hide();
            }
            selectionStore.clearSelection();
            return;
        }
    };
    document.addEventListener('keydown', keydownHandler);
    context._keydownHandler = keydownHandler;

    // Create ExportDialog and wire ribbon:export-requested event
    console.log('[ApplicationInitializer]   ↳ Creating ExportDialog...');
    const exportDialog = new ExportDialog();
    context.exportDialog = exportDialog;
    eventBus.subscribe('ribbon:export-requested', async () => {
        const state = appStoreInstance.getState();
        const layers = state.layers || [];
        const selectedLayerIds = await exportDialog.show(layers);
        if (!selectedLayerIds) return;
        try {
            await appService.execute({
                type: 'ExportLayersCommand',
                payload: { selectedLayerIds }
            });
        } catch (err) {
            console.error('[ApplicationInitializer] ❌ Export failed:', err);
            eventBus.publish('ERROR', { message: 'Failed to export layers' });
        }
    });

    // Create CraftMissingDecorationsDialog and wire ribbon:report-requested event
    console.log('[ApplicationInitializer]   ↳ Creating CraftMissingDecorationsDialog...');
    const craftMissingDecorationsDialog = new CraftMissingDecorationsDialog();
    context.craftMissingDecorationsDialog = craftMissingDecorationsDialog;
    eventBus.subscribe<{ layout: HomesteadLayout | null }>('ribbon:report-requested', async ({ layout }) => {
        if (!layout) return;
        const mapName = layout.map?.name ?? '—';
        const layers = layout.layers ? Array.from(layout.layers.values()) : [];
        await craftMissingDecorationsDialog.show(mapName, layers, context.accountDecorationInventory ?? null);
    });

    // Create SettingsRepository and SettingsDialog, wire ribbon:settings-requested event
    console.log('[ApplicationInitializer]   ↳ Creating SettingsRepository and SettingsDialog...');
    const settingsRepository = new SettingsRepository();
    const settingsDialog = new SettingsDialog(() => {
        appService.execute({ type: 'ResetLayoutCommand', payload: {} });
    });
    const themeManager = new ThemeManager();
    context.settingsRepository = settingsRepository;
    context.settingsDialog = settingsDialog;
    context.themeManager = themeManager;

    // Apply saved theme immediately on startup
    themeManager.apply(settingsRepository.load().theme ?? 'system');

    let inventoryRequestId = 0;
    const refreshAccountDecorationInventory = async (apiKey: string): Promise<void> => {
        const requestId = ++inventoryRequestId;
        context.accountDecorationInventory = null;
        context.decorationListPanel?.setAccountInventory(null);
        if (appStoreInstance.getState().mapType !== MapType.Homestead) return;
        if (!apiKey) {
            const emptyInventory = new AccountDecorationInventory([]);
            context.accountDecorationInventory = emptyInventory;
            context.decorationListPanel?.setAccountInventory(emptyInventory);
            return;
        }

        try {
            const apiAdapter = infrastructure.getApiAdapter();
            const entries = await apiAdapter.getAccountHomesteadDecorations(apiKey);
            if (requestId !== inventoryRequestId) return;
            if (Array.isArray(entries)) {
                context.accountDecorationInventory = new AccountDecorationInventory(entries);
                console.log(`[ApplicationInitializer]   ↳ Account inventory loaded: ${context.accountDecorationInventory.size} decoration type(s)`);
            }
        } catch (err) {
            if (requestId !== inventoryRequestId) return;
            console.warn('[ApplicationInitializer] ⚠️  Failed to load account decoration inventory:', err instanceof Error ? err.message : String(err));
        }
        context.decorationListPanel?.setAccountInventory(context.accountDecorationInventory ?? null);
    };

    let inventoryMapType = appStoreInstance.getState().mapType;
    appStoreInstance.subscribe((state) => {
        if (state.mapType === inventoryMapType) return;
        inventoryMapType = state.mapType;
        void refreshAccountDecorationInventory(settingsRepository.load().apiKey);
    });

    // Load account decoration inventory on startup if an API key is set
    console.log('[ApplicationInitializer]   ↳ Loading account decoration inventory...');
    await refreshAccountDecorationInventory(settingsRepository.load().apiKey);

    eventBus.subscribe('ribbon:settings-requested', async () => {
        const current = settingsRepository.load();
        const updated = await settingsDialog.show(current);
        if (updated !== null) {
            settingsRepository.save(updated);
            themeManager.apply(updated.theme ?? 'system');
            if (updated.apiKey !== current.apiKey) {
                void refreshAccountDecorationInventory(updated.apiKey);
            }
        }
    });

    // Create ConfirmDialog for map-switch confirmation
    console.log('[ApplicationInitializer]   ↳ Creating ConfirmDialog...'); const confirmDialog = new ConfirmDialog('mapSwitch');
    context.confirmDialog = confirmDialog;

    // Wire confirm:mapSwitch event from FileDropZone to ConfirmDialog
    eventBus.subscribe<{ currentMapName: string; newMapName: string; xmlContent: string; fileName: string }>('confirm:mapSwitch', async (data) => {
        const confirmed = await confirmDialog.show({
            title: 'Switch Map?',
            message: `Switching from "${data.currentMapName}" to "${data.newMapName}" will remove all existing layers. This cannot be undone.`,
            confirmLabel: 'Switch Map',
            cancelLabel: 'Cancel'
        });

        if (confirmed) {
            // Clear all layers and undo history first
            const previousLayerCount = homesteadLayout.getLayerCount();
            homesteadLayout.clearAllLayers();
            homesteadLayout.map = null;
            undoRedoManager.clear();

            // Use the complete layout loading workflow to load the new map
            // (handles GW2 API map loading, tile initialization, zoom reset, etc.)
            if (window.completeLayoutLoadingWorkflow) {
                await window.completeLayoutLoadingWorkflow(data.xmlContent, data.fileName);
                eventBus.publish('map:switched', {
                    previousLayerCount,
                    newMapName: data.newMapName
                });
            }
        }
    });

    // Wire confirm:deleteDecorations event to ConfirmDialog
    eventBus.subscribe<{ decorationIds: string[] }>('confirm:deleteDecorations', async (data) => {
        const { decorationIds } = data;
        const count = decorationIds.length;
        const confirmed = await confirmDialog.show({
            title: `Delete ${count} Decoration${count > 1 ? 's' : ''}?`,
            message: `Are you sure you want to delete ${count === 1 ? 'this decoration' : `these ${count} decorations`}?`,
            confirmLabel: 'Delete',
            cancelLabel: 'Cancel'
        });
        if (confirmed) {
            appService.execute({
                type: 'DeleteDecorationsCommand',
                payload: { decorationIds }
            });
        }
    });

    // Create ToolModeStore for tool mode switching (T097)
    console.log('[ApplicationInitializer]   ↳ Creating ToolModeStore...');
    const toolModeStore = new ToolModeStore();
    context.toolModeStore = toolModeStore;

    // Mount DockManager to the root container
    const dockManagerRoot = document.getElementById('dock-manager-root');
    if (dockManagerRoot) {
        console.log('[ApplicationInitializer]   ↳ Creating and mounting DockManager...');
        const panelContentMap: Record<string, HTMLElement> = {};
        const mapContent = document.getElementById('map-container');
        const layersContent = document.getElementById('panel-content-layers');
        const decorationListContent = document.getElementById('panel-content-decoration-list');
        if (mapContent) panelContentMap.map = mapContent;
        if (layersContent) panelContentMap.layers = layersContent;
        if (decorationListContent) panelContentMap.decorationList = decorationListContent;
        const dockManager = new DockManager(dockManagerRoot, layoutStore, panelContentMap, appService, eventBus, appStoreInstance, zoomStoreInstance, undoRedoManager, toolModeStore, selectionStore);
        dockManager.mount();
        context.dockManager = dockManager;
    } else {
        console.warn('[ApplicationInitializer] ⚠️  #dock-manager-root not found — DockManager not mounted');
    }

    // Initialize DecorationListPanel in the decoration-list panel container
    const decorationListContainer = document.getElementById('panel-content-decoration-list');
    if (decorationListContainer) {
        console.log('[ApplicationInitializer]   ↳ Creating DecorationListPanel...');
        const decorationListPanel = new DecorationListPanel(decorationListContainer, appStoreInstance, selectionStore, eventBus, appService, context.accountDecorationInventory ?? null, infrastructure.getApiAdapter());
        context.decorationListPanel = decorationListPanel;
    }

    // Set up event flow: Stores -> Event Bus
    console.log('[ApplicationInitializer]   ↳ Setting up event bindings...');
    setupEventBindings(context);

    // Set up domain event -> AppStore bindings
    console.log('[ApplicationInitializer]   ↳ Setting up AppService event bindings...');
    setupAppServiceEventBindings(context);

    // Wire screen-reader announcements for selection changes
    const announcer = document.getElementById('selection-announcer');
    if (announcer) {
        eventBus.subscribe<{ selectedIds?: string[] }>('selection:changed', (data) => {
            const count = data.selectedIds ? data.selectedIds.length : 0;
            if (count === 0) {
                announcer.textContent = 'Selection cleared';
            } else if (count === 1) {
                announcer.textContent = '1 decoration selected';
            } else {
                announcer.textContent = `${count} decorations selected`;
            }
        });
    }

    console.log('[ApplicationInitializer] ✅ Application initialization complete!');
    return context;
}

/**
 * Deferred initialization for AppService
 * Call this after the application has initially loaded stores
 * @param {Object} context - Application context from initializeApplication()
 * @param {AppService} appServiceInstance - Instance of AppService from server/loader
 */
export function deferredInitialize(context: ApplicationContext, appServiceInstance: AppService): void {
    context.appService = appServiceInstance;

    // Connect AppService events to AppStore (if not already done)
    setupAppServiceEventBindings(context);
}

/**
 * Set up bindings between stores and event bus
 * This connects reactive UI updates
 * @param {Object} context - Application context with all services
 * @private
 */
function setupEventBindings(context: ApplicationContext): void {
    console.log('[ApplicationInitializer] ⚡ Setting up event bindings...');
    const { appStore, zoomStore, selectionStore, eventBus } = context;

    // Subscribe to AppStore changes
    console.log('[ApplicationInitializer]   ↳ Binding AppStore to EventBus (appstate:changed)...');
    appStore.subscribe((state) => {
        console.log('[ApplicationInitializer] 🔄 AppStore state changed, publishing to EventBus');
        eventBus.publish('appstate:changed', state);
    });

    // Subscribe to ZoomStore changes using getEmitter()
    console.log('[ApplicationInitializer]   ↳ Binding ZoomStore to EventBus (zoom:changed, pan:changed)...');
    const zoomEmitter = zoomStore.getEmitter();
    if (zoomEmitter) {
        zoomEmitter.on('change', (zoomState: Record<string, unknown>) => {
            console.log('[ApplicationInitializer] 🔄 ZoomStore state changed, publishing to EventBus');
            eventBus.publish('zoom:changed', zoomState);
            eventBus.publish('pan:changed', zoomState);
        });
    } else {
        console.warn('[ApplicationInitializer] ⚠️  ZoomStore emitter not available');
    }

    // Subscribe to SelectionStore changes
    console.log('[ApplicationInitializer]   ↳ Binding SelectionStore to EventBus (selection:changed)...');
    if (selectionStore && selectionStore.on && typeof selectionStore.on === 'function') {
        selectionStore.on('change', (selection: Record<string, unknown>) => {
            console.log('[ApplicationInitializer] 🔄 SelectionStore state changed, publishing to EventBus');
            eventBus.publish('selection:changed', selection);
        });
    } else {
        console.warn('[ApplicationInitializer] ⚠️  SelectionStore.on() not available');
    }

    console.log('[ApplicationInitializer] ✅ Event bindings setup complete');
}

/**
 * Set up bindings between AppService domain events and UI layer updates
 * Called after AppService is initialized
 * @param {Object} context - Application context with all services
 * @private
 */
function setupAppServiceEventBindings(context: ApplicationContext): void {
    console.log('[ApplicationInitializer] ⚡ Setting up AppService event bindings...');
    const { appService, appStore, eventBus } = context;

    if (!appService) {
        console.warn('[ApplicationInitializer] ⚠️  AppService not yet initialized for event bindings');
        return;
    }

    // When a layout is loaded, update AppStore
    appService.subscribe<{ layout: HomesteadLayout }>('LayoutLoadedEvent', (event) => {
        console.log('[Event Flow] LayoutLoadedEvent → AppStore.dispatch + EventBus.publish');
        appStore.dispatch('LOAD_LAYOUT', event.layout);
        eventBus.publish('layout:loaded', event);
    });

    // When a layer is created, update AppStore
    appService.subscribe<{ layer: Layer }>('LayerCreatedEvent', (event) => {
        console.log('[Event Flow] LayerCreatedEvent → AppStore.dispatch + EventBus.publish');
        appStore.dispatch('CREATE_LAYER', event.layer);
        eventBus.publish('layer:created', event);
    });

    // When a layer is deleted, update AppStore
    appService.subscribe<{ layerId: string }>('LayerDeletedEvent', (event) => {
        console.log('[Event Flow] LayerDeletedEvent → AppStore.dispatch + EventBus.publish');
        appStore.dispatch('DELETE_LAYER', event.layerId);
        eventBus.publish('layer:deleted', event);
    });

    // When a layer is renamed, update AppStore
    appService.subscribe<{ layerId: string; newName: string }>('LayerRenamedEvent', (event) => {
        console.log('[Event Flow] LayerRenamedEvent → AppStore.dispatch + EventBus.publish');
        appStore.dispatch('RENAME_LAYER', {
            layerId: event.layerId,
            newName: event.newName
        });
        eventBus.publish('layer:renamed', event);
    });

    // When a decoration is added, update AppStore
    appService.subscribe<{ layerId: string; decoration: Decoration }>('DecorationAddedEvent', (event) => {
        console.log('[Event Flow] DecorationAddedEvent → AppStore.dispatch + EventBus.publish');
        appStore.dispatch('ADD_DECORATION', {
            layerId: event.layerId,
            decoration: event.decoration
        });
        eventBus.publish('decoration:added', event);
    });

    // When a decoration is deleted, update AppStore
    appService.subscribe<{ layerId: string; decorationId: string }>('DecorationDeletedEvent', (event) => {
        console.log('[Event Flow] DecorationDeletedEvent → AppStore.dispatch + EventBus.publish');
        appStore.dispatch('DELETE_DECORATION', {
            layerId: event.layerId,
            decorationId: event.decorationId
        });
        eventBus.publish('decoration:deleted', event);
    });

    // When a layer is selected, update SelectionStore
    appService.subscribe<{ layerId: string }>('LayerSelectedEvent', (event) => {
        console.log('[Event Flow] LayerSelectedEvent → SelectionStore.setActiveLayer + EventBus.publish');
        context.selectionStore.setActiveLayer(event.layerId);
        eventBus.publish('layer:selected', event);
    });

    // When a decoration is updated, update AppStore
    appService.subscribe<{ layerId: string; decoration: Decoration }>('DecorationUpdatedEvent', (event) => {
        console.log('[Event Flow] DecorationUpdatedEvent → AppStore.dispatch + EventBus.publish');
        appStore.dispatch('UPDATE_DECORATION', {
            layerId: event.layerId,
            decoration: event.decoration
        });
        eventBus.publish('decoration:updated', event);
    });

    // When layer visibility is toggled, update AppStore
    appService.subscribe<{ layerId: string; isVisible: boolean }>('LayerVisibilityToggledEvent', (event) => {
        console.log('[Event Flow] LayerVisibilityToggledEvent → AppStore.dispatch + EventBus.publish');
        appStore.dispatch('TOGGLE_LAYER_VISIBILITY', {
            layerId: event.layerId,
            isVisible: event.isVisible
        });
        eventBus.publish('layer:visibility:toggled', event);
    });

    // When layer color is changed, update AppStore
    appService.subscribe<{ layerId: string; color: string }>('LayerColorChangedEvent', (event) => {
        console.log('[Event Flow] LayerColorChangedEvent → AppStore.dispatch + EventBus.publish');
        appStore.dispatch('SET_LAYER_COLOR', {
            layerId: event.layerId,
            color: event.color
        });
        eventBus.publish('layer:color:changed', event);
    });

    // When decorations are moved between layers, update AppStore
    appService.subscribe<{ decorationIds: string[]; targetLayerId: string; sourceMapping: Record<string, string> }>('DecorationsMovedEvent', (event) => {
        console.log('[Event Flow] DecorationsMovedEvent → AppStore.dispatch + EventBus.publish');
        appStore.dispatch('MOVE_DECORATIONS', {
            decorationIds: event.decorationIds,
            targetLayerId: event.targetLayerId,
            sourceMapping: event.sourceMapping
        });
        eventBus.publish('decorations:moved', event);
    });

    // When decorations are deleted, update AppStore
    appService.subscribe<{ decorationIds: string[]; sourceMapping: Record<string, string> }>('DecorationsDeletedEvent', (event) => {
        console.log('[Event Flow] DecorationsDeletedEvent → AppStore.dispatch + EventBus.publish');
        appStore.dispatch('DELETE_DECORATIONS', {
            decorationIds: event.decorationIds,
            sourceMapping: event.sourceMapping
        });
        eventBus.publish('decorations:deleted', event);
    });

    // When zoom is changed, update ZoomStore
    appService.subscribe<{ newZoom: number }>('ZoomChangedEvent', (event) => {
        console.log('[Event Flow] ZoomChangedEvent → ZoomStore.setZoom + EventBus.publish');
        const currentZoom = context.zoomStore.transform.scaleX;
        context.zoomStore.zoom(event.newZoom / currentZoom);
        eventBus.publish('zoom:changed', event);
    });

    // When pan is changed, update ZoomStore
    appService.subscribe<{ newPan: { x: number; y: number } }>('PanChangedEvent', (event) => {
        console.log('[Event Flow] PanChangedEvent → ZoomStore.setPan + EventBus.publish');
        context.zoomStore.pan(event.newPan.x, event.newPan.y);
        eventBus.publish('pan:changed', event);
    });
}

/**
 * Create a command and execute it through AppService
 * Helper function for executing commands
 * @param {Object} context - Application context
 * @param {string} commandName - Name of the command class
 * @param {Object} commandData - Command data/payload
 * @returns {*} Result from command execution
 */
export function executeCommand(context: ApplicationContext, commandName: string, commandData: Record<string, unknown>): unknown {
    const { appService } = context;

    if (!appService) {
        throw new Error('AppService not initialized. Call deferredInitialize() first.');
    }

    try {
        // Dynamically create command instance from provided data
        // Command classes are loaded on-demand
        // This expects a requireCommand() function to be available in browser context
        if (typeof window !== 'undefined' && window.requireCommand) {
            const CommandClass = window.requireCommand(commandName);
            const command = new CommandClass(commandData);
            return appService.executeCommand(command);
        } else {
            throw new Error('Command loader not available. Use server-side command execution.');
        }
    } catch (error) {
        console.error(`Error executing command ${commandName}:`, error);
        throw error;
    }
}

/**
 * Create a query and execute it through AppService
 * Helper function for executing queries
 * @param {Object} context - Application context
 * @param {string} queryName - Name of the query class
 * @param {Object} queryData - Query data/payload
 * @returns {*} Result from query execution
 */
export function executeQuery(context: ApplicationContext, queryName: string, queryData: Record<string, unknown>): unknown {
    const { appService } = context;

    if (!appService) {
        throw new Error('AppService not initialized. Call deferredInitialize() first.');
    }

    try {
        // Dynamically create query instance from provided data
        // Query classes are loaded on-demand
        // This expects a requireQuery() function to be available in browser context
        if (typeof window !== 'undefined' && window.requireQuery) {
            const QueryClass = window.requireQuery(queryName);
            const query = new QueryClass(queryData);
            return appService.executeQuery(query);
        } else {
            throw new Error('Query loader not available. Use server-side query execution.');
        }
    } catch (error) {
        console.error(`Error executing query ${queryName}:`, error);
        throw error;
    }
}

export default initializeApplication;
