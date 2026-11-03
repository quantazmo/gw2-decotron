/**
 * LayerPanel Component
 * List layers with controls
 * Add/delete/rename layer buttons
 * Visibility toggle per layer
 */

import * as domHelpers from '../domHelpers.js';
import * as eventBinders from '../eventBinders.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { DecorationLayerColorDialog } from './DecorationLayerColorDialog.js';
import type { AppStore } from '../stores/AppStore.js';
import type { SelectionStore } from '../stores/SelectionStore.js';
import type { AppService } from '../../application/AppService.js';
import type { EventBus } from '../EventBus.js';
import type { Layer } from '../../domain/Layer.js';
import type { ContextMenu } from './ContextMenu.js';

class LayerPanel {
    private container: HTMLElement;
    private appStore: AppStore;
    private selectionStore: SelectionStore;
    private appService: AppService;
    private eventBus: EventBus;
    private layerList!: HTMLDivElement;
    private createLayerBtn: HTMLElement | null;
    private deleteLayerBtn: HTMLElement | null;
    private renameInput: HTMLInputElement | null;
    private _contextMenu: ContextMenu | null;
    private _confirmDialog: ConfirmDialog;
    private _colorDialog: DecorationLayerColorDialog;

    constructor(containerElement: HTMLElement, appStore: AppStore, selectionStore: SelectionStore, appService: AppService, eventBus: EventBus) {
        console.log('[LayerPanel] 🚀 LayerPanel constructor called');

        this.container = containerElement;
        this.appStore = appStore;
        this.selectionStore = selectionStore;
        this.appService = appService;
        this.eventBus = eventBus;

        this.createLayerBtn = null;
        this.deleteLayerBtn = null;
        this.renameInput = null;

        /** @type {ContextMenu|null} Shared context menu instance */
        this._contextMenu = null;

        /** @type {ConfirmDialog} Shared dialog for layer confirmations */
        this._confirmDialog = new ConfirmDialog();

        /** @type {DecorationLayerColorDialog} Dialog for changing layer color */
        this._colorDialog = new DecorationLayerColorDialog();

        console.log('[LayerPanel]   ↳ Initializing component...');
        this.initialize();
        console.log('[LayerPanel]   ↳ Subscribing to changes...');
        this.subscribeToChanges();
        console.log('[LayerPanel] ✅ LayerPanel initialized');
    }

    /**
     * Initialize component structure
     */
    initialize(): void {
        // Clear container
        domHelpers.empty(this.container);

        // Create layer list - buttons are in HTML button-container
        this.layerList = domHelpers.createElement('div', { className: 'layer-list' });
        this.container.appendChild(this.layerList);

        // Bind HTML buttons if they exist
        this.bindHTMLButtons();
    }

    /**
     * Bind HTML buttons if they exist
     */
    bindHTMLButtons(): void {
        console.log('[LayerPanel] ⚡ Binding HTML buttons...');
        // Get buttons from HTML
        const addLayerBtn = document.getElementById('add-layer-btn');
        const deleteLayerBtn = document.querySelector<HTMLElement>('[id*="delete"][id*="layer"], [id*="remove"][id*="layer"]');

        if (addLayerBtn) {
            console.log('[LayerPanel]   ↳ Binding add-layer-btn...');
            this.createLayerBtn = addLayerBtn;
            eventBinders.bindCreateLayerButton(
                this.createLayerBtn,
                this.appService,
                this.eventBus
            );
        } else {
            console.warn('[LayerPanel] ⚠️  add-layer-btn not found in DOM');
        }

        if (deleteLayerBtn) {
            console.log('[LayerPanel]   ↳ Binding delete layer button...');
            this.deleteLayerBtn = deleteLayerBtn;
            eventBinders.bindDeleteLayerButton(
                this.deleteLayerBtn,
                this.appService,
                this.selectionStore,
                this.eventBus,
                (layerId) => { void this.deleteLayer(layerId); }
            );
        } else {
            console.warn('[LayerPanel] ⚠️  delete layer button not found in DOM');
        }

        const exportBtn = document.getElementById('export-btn');
        if (exportBtn) {
            eventBinders.bindExportButton(
                exportBtn,
                this.appService,
                this.appStore,
                this.eventBus
            );
        }
    }

    /**
     * Subscribe to store changes
     */
    subscribeToChanges(): void {
        console.log('[LayerPanel] ⚡ Subscribing to store changes...');
        // Listen to app state changes
        console.log('[LayerPanel]   ↳ Subscribing to AppStore...');
        this.appStore.subscribe((state) => {
            console.log('[LayerPanel] 🔄 AppStore changed, rendering layers...');
            this.render(state);
        });

        // Listen to selection changes
        console.log('[LayerPanel]   ↳ Subscribing to SelectionStore...');
        this.selectionStore.subscribe((selectionState) => {
            console.log('[LayerPanel] 🔄 SelectionStore changed, updating active layer:', selectionState.activeLayerId);
            this.updateActiveLayer(selectionState.activeLayerId);
        });
    }

    /**
     * Render layers in the panel
     * @param {Object} state - App state
     */
    render(state: ReturnType<AppStore['getState']>): void {
        console.log('[LayerPanel] ⚡ render() called with state:', {
            layers: state.layers?.length || 0,
            activeLayerId: state.activeLayerId
        });

        const activeLayerId = this.selectionStore.getActiveLayerId();
        eventBinders.updateLayerPanel(
            this.layerList,
            state,
            this.selectionStore,
            (layer, isActive) => this.createLayerElement(layer, isActive)
        );

        console.log('[LayerPanel] ✅ render() complete');
    }

    /**
     * Create a layer element
     * @param {Layer} layer - The layer
     * @param {boolean} isActive - Whether this is the active layer
     * @returns {HTMLElement}
     */
    createLayerElement(layer: Layer, isActive: boolean): HTMLElement {
        const element = domHelpers.createElement('div', {
            className: ['layer-item', isActive ? 'active' : '', !layer.isVisible ? 'layer-hidden' : '']
        });

        element.setAttribute('data-layer-id', layer.id);

        // color swatch button
        const colorSwatch = document.createElement('button');
        colorSwatch.type = 'button';
        colorSwatch.className = 'layer-color-swatch';
        colorSwatch.style.backgroundColor = layer.color || '#00d4ff';
        colorSwatch.setAttribute('title', 'Change layer color');
        colorSwatch.setAttribute('aria-label', `Layer color: ${layer.color || '#00d4ff'}`);

        // Visibility icon (SVG eye)
        const visibilityIcon = document.createElement('span');
        visibilityIcon.className = 'visibility-icon';
        visibilityIcon.setAttribute('data-visible', String(layer.isVisible));
        visibilityIcon.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            </svg>`;

        // Layer name
        const nameSpan = domHelpers.createElement('span', {
            className: 'layer-name',
            textContent: layer.name || `Layer ${layer.id}`
        });

        // Delete button
        const deleteBtn = domHelpers.createElement('button', {
            className: 'delete-layer-btn',
            textContent: '✕',
            attributes: { title: 'Delete layer' }
        });

        element.appendChild(colorSwatch);
        element.appendChild(visibilityIcon);
        element.appendChild(nameSpan);
        element.appendChild(deleteBtn);

        // Bind color swatch click to open the color dialog
        colorSwatch.addEventListener('click', async (e) => {
            e.stopPropagation();
            const chosenColor = await this._colorDialog.show({ currentColor: layer.color || '#00d4ff' });
            if (chosenColor && chosenColor !== layer.color) {
                try {
                    await this.appService.execute({
                        type: 'SetLayerColorCommand',
                        payload: { layerId: layer.id, color: chosenColor }
                    });
                } catch (error) {
                    console.error('[LayerPanel] Error setting layer color:', error);
                }
            }
        });

        // Bind visibility toggle
        visibilityIcon.addEventListener('click', async (e) => {
            e.stopPropagation();

            // Toggle visibility using command
            try {
                await this.appService.execute({
                    type: 'ToggleLayerVisibilityCommand',
                    payload: {
                        layerId: layer.id
                    }
                });
            } catch (error) {
                console.error('[LayerPanel] Error toggling layer visibility:', error);
            }
        });

        // Bind double-click to rename
        nameSpan.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.openRenameMode(element, layer);
        });

        // Bind delete button
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteLayer(layer.id, layer);
        });

        // Context menu
        element.addEventListener('contextmenu', (e) => {
            this._handleLayerContextMenu(layer, e);
        });

        // Drag-and-drop target for decorations
        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            element.classList.add('drop-highlight');
        });

        element.addEventListener('dragleave', (e) => {
            element.classList.remove('drop-highlight');
        });

        element.addEventListener('drop', (e) => {
            e.preventDefault();
            element.classList.remove('drop-highlight');

            const dataTransfer = e.dataTransfer;
            if (!dataTransfer) return;
            const raw = dataTransfer.getData('application/x-decoration-ids');
            if (!raw) return;

            try {
                const decorationIds: unknown = JSON.parse(raw);
                if (!Array.isArray(decorationIds) || decorationIds.length === 0) return;

                this.appService.execute({
                    type: 'MoveDecorationsCommand',
                    payload: { decorationIds, targetLayerId: layer.id }
                });
            } catch (err) {
                console.error('[LayerPanel] Error processing drop:', err);
            }
        });

        return element;
    }

    /**
     * Handle right-click context menu on a layer item.
     * @param {Layer} layer - The layer
     * @param {MouseEvent} event - Mouse event
     */
    _handleLayerContextMenu(layer: Layer, event: MouseEvent): void {
        event.preventDefault();
        if (!this._contextMenu) return;

        // Set this layer as active
        this.selectionStore.setActiveLayer(layer.id);

        // Gather all decoration IDs from this layer
        const decorationIds = layer.getAllDecorations().map(decoration => decoration.uid);

        // Gather all other layers for the "Merge to..." submenu
        const state = this.appStore.getState();
        const otherLayers = (state.layers || []).filter(l => l.id !== layer.id);

        const items = [
            {
                label: `Select All (${decorationIds.length})`,
                disabled: decorationIds.length === 0,
                action: () => {
                    this.selectionStore.selectAll(decorationIds);
                }
            },
            {
                label: 'Merge to...',
                disabled: otherLayers.length === 0,
                submenu: otherLayers.map(targetLayer => ({
                    label: targetLayer.name || `Layer ${targetLayer.id}`,
                    action: () => this._confirmAndMergeLayer(layer, targetLayer)
                }))
            }
        ];

        this._contextMenu.show(event.clientX, event.clientY, items);
    }

    /**
     * Set the shared ContextMenu instance
     * @param {ContextMenu} contextMenu
     */
    setContextMenu(contextMenu: ContextMenu): void {
        this._contextMenu = contextMenu;
    }

    /**
     * Show confirmation dialog and execute the merge layer command.
     * @param {Layer} sourceLayer - The layer to merge from (will be deleted)
     * @param {Layer} targetLayer - The layer to merge into
     */
    async _confirmAndMergeLayer(sourceLayer: Layer, targetLayer: Layer): Promise<void> {
        const decorationCount = sourceLayer.getAllDecorations().length;
        const decorationText = decorationCount === 1
            ? '1 decoration'
            : `${decorationCount} decorations`;

        const confirmed = await this._confirmDialog.show({
            title: 'Merge Layer',
            message: `Move ${decorationText} from "${sourceLayer.name}" into "${targetLayer.name}" and delete "${sourceLayer.name}"?`,
            confirmLabel: 'Merge',
            cancelLabel: 'Cancel'
        });

        if (!confirmed) return;

        try {
            await this.appService.execute({
                type: 'MergeLayerCommand',
                payload: {
                    sourceLayerId: sourceLayer.id,
                    targetLayerId: targetLayer.id
                }
            });
        } catch (error) {
            console.error('[LayerPanel] Error merging layer:', error);
            this.eventBus.publish('ERROR', { message: 'Failed to merge layer' });
        }
    }

    /**
     * Open rename mode for a layer
     * @param {HTMLElement} layerElement - The layer element
     * @param {Layer} layer - The layer
     */
    openRenameMode(layerElement: HTMLElement, layer: Layer): void {
        const nameSpan = layerElement.querySelector<HTMLElement>('.layer-name');
        if (!nameSpan) return;

        // Hide name span
        domHelpers.hide(nameSpan);

        // Create input
        const input = domHelpers.createElement('input', {
            attributes: {
                type: 'text',
                value: layer.name || `Layer ${layer.id}`,
                className: 'layer-name-input'
            }
        });

        layerElement.insertBefore(input, nameSpan);

        // Focus and select all
        domHelpers.focus(input);
        input.select();

        // Bind rename handlers
        const finishRename = () => {
            const newName = input.value.trim();

            if (newName && newName !== layer.name) {
                const command = {
                    type: 'RenameLayerCommand',
                    payload: {
                        layerId: layer.id,
                        newName: newName
                    }
                };

                this.appService.execute(command);
            }

            // Cleanup
            layerElement.removeChild(input);
            domHelpers.show(nameSpan);
        };

        input.addEventListener('blur', finishRename);
        input.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                finishRename();
            } else if (event.key === 'Escape') {
                layerElement.removeChild(input);
                domHelpers.show(nameSpan);
            }
        });
    }

    /**
     * Delete a layer
     * @param {string} layerId - The layer ID to delete
     */
    async deleteLayer(layerId: string, layer?: Layer): Promise<void> {
        const targetLayer = layer ?? this.appStore.getState().layers.find(candidate => candidate.id === layerId);
        const layerName = targetLayer?.name || `Layer ${layerId}`;
        const decorationCount = targetLayer?.getAllDecorations?.().length ?? 0;
        const decorationText = decorationCount === 1
            ? '1 decoration'
            : `${decorationCount} decorations`;

        const confirmed = await this._confirmDialog.show({
            title: 'Delete Layer',
            message: `Delete "${layerName}" and its ${decorationText}?`,
            confirmLabel: 'Delete',
            cancelLabel: 'Cancel'
        });
        if (!confirmed) return;

        try {
            await this.appService.execute({
                type: 'DeleteLayerCommand',
                payload: { layerId }
            });
        } catch (error) {
            console.error('Error deleting layer:', error);
            this.eventBus.publish('ERROR', { message: 'Failed to delete layer' });
        }
    }

    /**
     * Update active layer highlighting
     * @param {string} activeLayerId - The active layer ID
     */
    updateActiveLayer(activeLayerId: string | null): void {
        eventBinders.highlightActiveLayer(this.layerList, activeLayerId);
        this.updateDeleteButtonState();
    }

    /**
     * Update delete button state based on layer selection
     */
    updateDeleteButtonState(): void {
        if (!this.deleteLayerBtn) return; // Button may not exist in HTML

        const state = this.appStore.getState();
        const hasLayers = state.layers && state.layers.length > 0;
        const hasActiveLayer = this.selectionStore.getActiveLayerId() !== null;

        eventBinders.setButtonState(
            this.deleteLayerBtn,
            hasLayers && hasActiveLayer && state.layers.length > 1
        );
    }

    /**
     * Get the container element
     * @returns {HTMLElement}
     */
    getElement(): HTMLElement {
        return this.container;
    }
}

export { LayerPanel };
