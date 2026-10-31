/**
 * DecorationListPanel Component
 * Flat scrollable list of decorations from visible layers,
 * grouped by layer with sticky headers showing layer name + count.
 * Subscribes to AppStore and SelectionStore.
 * Supports click/Ctrl+Click/Shift+Click selection.
 */

import AppService from '../../application/AppService.js';
import { Decoration } from '../../domain/Decoration.js';
import { AccountDecorationInventory } from '../../domain/AccountDecorationInventory.js';
import { Layer } from '../../domain/Layer.js';
import type { Gw2ApiAdapter } from '../../infrastructure/adapters/Gw2ApiAdapter.js';
import { addClass, addInputElement, createElement, empty } from '../domHelpers.js';
import { EventBus } from '../EventBus.js';
import { AppState, AppStore } from '../stores/AppStore.js';
import { SelectionStore } from '../stores/SelectionStore.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import ContextMenu from './ContextMenu.js';
import { DecorationInfoDialog } from './DecorationInfoDialog.js';

type SortMode = 'oldest' | 'newest' | 'az' | 'za';

class DecorationListPanel {
    container: HTMLElement;
    appStore: AppStore;
    selectionStore: SelectionStore;
    eventBus: EventBus;
    appService?: AppService;
    private _accountInventory: AccountDecorationInventory | null;
    private _apiAdapter?: Pick<Gw2ApiAdapter, 'getHomesteadDecorations'>;
    private _decorationIcons: Map<number, string> = new Map();
    private _requestedDecorationIds: Set<number> = new Set();

    /** Anchor decoration ID for Shift+Click range */
    _anchorId?: string;
    /** Flat ordered list of visible decoration IDs */
    _orderedIds: string[] = [];
    /** Shared context menu instance */
    _contextMenu: ContextMenu = new ContextMenu();
    /** Dialog for merge confirmation */
    _confirmDialog: ConfirmDialog = new ConfirmDialog('layerMerge');
    /** Shared decoration info dialog instance */
    _decorationInfoDialog: DecorationInfoDialog = new DecorationInfoDialog();
    /** Layer IDs that are currently collapsed */
    _collapsedLayers: Set<string> = new Set();
    /** Current search filter text */
    _searchText: string = '';
    /** Search bar container element */
    _searchBar?: HTMLElement;
    /** Scrollable list container */
    _listContainer?: HTMLElement;
    /** Current sort mode: 'oldest' | 'newest' | 'az' | 'za' */
    _sortMode: SortMode = 'oldest';
    /** Listen for toggle events dispatched by DockRegion's search button */
    _searchToggleHandler: EventListener = () => this._toggleSearch();
    /** Listen for sort events dispatched by DockRegion's sort button */
    _sortHandler!: EventListener;


    constructor(containerElement: HTMLElement, appStore: AppStore, selectionStore: SelectionStore, eventBus: EventBus, appService?: AppService, accountInventory: AccountDecorationInventory | null = null, apiAdapter?: Pick<Gw2ApiAdapter, 'getHomesteadDecorations'>) {
        this.container = containerElement;
        this.appStore = appStore;
        this.selectionStore = selectionStore;
        this.eventBus = eventBus;
        this.appService = appService || undefined;
        this._accountInventory = accountInventory;
        this._apiAdapter = apiAdapter;

        this.initialize();
        this.subscribeToChanges();
    }

    initialize(): void {
        addClass(this.container, 'decoration-list-panel');

        // Search bar (hidden by default)
        this._searchBar = this._createSearchBar();
        this.container.appendChild(this._searchBar);

        this._listContainer = createElement('div', {
            className: 'decoration-list__scroll-container',
            parent: this.container
        });

        document.addEventListener('decoration-list:toggle-search', this._searchToggleHandler);

        this._sortHandler = (event) => {
            const { mode } = (event as CustomEvent<{ mode: SortMode }>).detail;
            this._sortMode = mode;
            this.render(this.appStore.getState());
        };
        document.addEventListener('decoration-list:set-sort', this._sortHandler);

        this.render(this.appStore.getState());
    }

    subscribeToChanges() {
        this.appStore.subscribe((state) => {
            this.render(state);
        });

        this.selectionStore.subscribe(() => {
            this._updateSelectionHighlights();
        });
    }

    /**
     * Render the decoration list from current state
     * @param {Object} state - AppStore state with layers array
     */
    render(state: AppState): void {
        empty(this._listContainer!);
        this._orderedIds = [];

        const layers = state.layers || [];
        const searchFragments = this._getSearchFragments();
        const requiredCounts = new Map<number, number>();
        const visibleDecorations: Decoration[] = [];

        for (const layer of layers) {
            if (!layer.isVisible) continue;
            for (const decoration of this._getLayerDecorations(layer)) {
                visibleDecorations.push(decoration);
                const decorationId = Number(decoration.id);
                if (Number.isSafeInteger(decorationId)) {
                    requiredCounts.set(decorationId, (requiredCounts.get(decorationId) ?? 0) + 1);
                }
            }
        }

        this._loadDecorationIcons(visibleDecorations);

        for (const layer of layers) {
            if (!layer.isVisible) continue;

            const decorations = this._getLayerDecorations(layer);

            const filteredDecorations = this._filterDecorations(decorations, searchFragments);
            const sortedDecorations = this._sortDecorations(filteredDecorations);

            if (sortedDecorations.length === 0) continue;

            // Layer group header
            const layerId = layer.id;
            const isCollapsed = this._collapsedLayers.has(layer.id);
            const header = createElement('div', {
                className: 'decoration-list__layer-header',
                attributes: {
                    'data-layer-id': layer.id
                },
                parent: this._listContainer,
                events: {
                    click: () => {
                        if (this._collapsedLayers.has(layerId)) {
                            this._collapsedLayers.delete(layerId);
                        } else {
                            this._collapsedLayers.add(layerId);
                        }
                        this.render(this.appStore.getState());
                    },
                    contextmenu: (e: PointerEvent) => {
                        this._handleLayerHeaderContextMenu(layer, e);
                    }
                }
            });

            createElement('span', {
                className: 'decoration-list__layer-chevron',
                textContent: isCollapsed ? '▶' : '▼',
                parent: header
            });

            createElement('span', {
                className: 'decoration-list__layer-name',
                textContent: layer.name || `Layer ${layer.id}`,
                parent: header
            });

            createElement('span', {
                className: 'decoration-list__layer-count',
                textContent: `${sortedDecorations.length}`,
                parent: header
            });

            // Decoration items wrapper
            const itemsWrapper = createElement('div', {
                className: 'decoration-list__layer-items' + (isCollapsed ? ' collapsed' : ''),
                parent: this._listContainer
            });

            // Decoration items
            if (!isCollapsed) {
                for (const decoration of sortedDecorations) {
                    this._orderedIds.push(decoration.uid);
                    const item = this._createDecorationItem(decoration, layer.id, requiredCounts);
                    itemsWrapper.appendChild(item);
                }
            }
        }

        this._updateSelectionHighlights();
    }

    private _getLayerDecorations(layer: Layer): Decoration[] {
        if (typeof layer.getAllDecorations === 'function') return layer.getAllDecorations();
        if (Array.isArray(layer.decorations)) return layer.decorations;
        if (layer.decorations instanceof Map) return Array.from(layer.decorations.values());
        return [];
    }

    setAccountInventory(inventory: AccountDecorationInventory | null): void {
        this._accountInventory = inventory;
        this.render(this.appStore.getState());
    }

    /**
     * Sort a list of decorations according to the current sort mode.
     */
    private _sortDecorations(decorations: Decoration[]): Decoration[] {
        switch (this._sortMode) {
            case 'newest':
                return [...decorations].reverse();
            case 'az':
                return [...decorations].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            case 'za':
                return [...decorations].sort((a, b) => (b.name || '').localeCompare(a.name || ''));
            default: // 'oldest'
                return decorations;
        }
    }

    /**
     * Normalize a string for searching: lowercase and remove non-alpha characters.
     */
    private _normalizeForSearch(str: string): string {
        return str.toLowerCase().replace(/[^a-z]/g, '');
    }

    /**
     * Parse the current search text into normalized fragments.
     */
    private _getSearchFragments(): string[] {
        if (!this._searchText) return [];
        return this._searchText
            .split(/\s+/)
            .map(f => this._normalizeForSearch(f))
            .filter(f => f.length > 0);
    }

    /**
     * Filter a list of decorations by search fragments.
     * A decoration matches if its normalized name contains every fragment.
     */
    private _filterDecorations(decorations: Decoration[], fragments: string[]): Decoration[] {
        if (fragments.length === 0) return decorations;
        return decorations.filter(d => {
            const normalizedName = this._normalizeForSearch(d.name || d.id || '');
            return fragments.every(f => normalizedName.includes(f));
        });
    }

    /**
     * Create the search bar element.
     */
    private _createSearchBar(): HTMLElement {
        const bar = createElement('div', {
            className: 'decoration-search-bar'
        });
        addInputElement(bar, 'Filter decorations', 200, (value?: string) => {
            this._searchText = value ?? '';
            this.render(this.appStore.getState());
        });

        return bar;
    }

    /**
     * Toggle the search bar visibility.
     */
    private _toggleSearch(): void {
        if (!this._searchBar) return;
        const isVisible = this._searchBar.classList.contains('visible');
        if (isVisible) {
            this._searchBar.classList.remove('visible');
            this._searchText = '';
            this.render(this.appStore.getState());
        } else {
            const input = this._searchBar.querySelector('input');
            if (input) {
                input.value = '';
                this._searchBar.classList.add('visible');
                input.focus();
            }
        }
    }

    /**
     * Create a single decoration list item element
     */
    private _createDecorationItem(decoration: Decoration, layerId: string, requiredCounts: Map<number, number>): HTMLElement {
        const item = createElement('div', {
            className: 'decoration-list__item',
            attributes: {
                'data-decoration-id': decoration.uid,
                'data-layer-id': layerId,
                'draggable': 'true'
            }
        });

        const iconSlot = createElement('span', {
            className: 'decoration-list__item-icon-slot',
            attributes: { 'aria-hidden': 'true' },
            parent: item
        });
        const iconUrl = this._decorationIcons.get(Number(decoration.id));
        if (iconUrl) {
            createElement('img', {
                className: 'decoration-list__item-icon',
                attributes: { src: iconUrl, alt: '', loading: 'lazy' },
                parent: iconSlot
            });
        }

        const nameSpan = createElement('span', {
            className: 'decoration-list__item-name',
            textContent: decoration.name || decoration.id,
            parent: item
        });

        const decorationId = Number(decoration.id);
        const requiredCount = requiredCounts.get(decorationId) ?? 0;
        if (this._accountInventory && this._accountInventory.getCount(decorationId) >= requiredCount) {
            createElement('span', {
                className: 'decoration-list__availability-check',
                textContent: '✓',
                attributes: {
                    'aria-label': 'You have this decoration',
                    'title': 'You have this decoration'
                },
                parent: item
            });
        }

        // Click handler for selection
        item.addEventListener('click', (e) => {
            this._decorationClick(decoration.uid, e);
        });

        // Drag start — carry selected decoration IDs
        item.addEventListener('dragstart', (e) => {
            this._decorationDragStart(decoration.uid, e);
        });

        // Context menu handler
        item.addEventListener('contextmenu', (e) => {
            this._decorationContextMenu(decoration.uid, layerId, e);
        });

        // Double-click: open decoration info dialog
        item.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this._decorationDoubleClick(decoration, layerId);
        });

        return item;
    }

    private _loadDecorationIcons(decorations: Decoration[]): void {
        if (!this._apiAdapter) return;

        const ids = [...new Set(decorations
            .map(decoration => Number(decoration.id))
            .filter(id => Number.isSafeInteger(id) && !this._requestedDecorationIds.has(id)))];
        if (ids.length === 0) return;

        ids.forEach(id => this._requestedDecorationIds.add(id));
        void this._apiAdapter.getHomesteadDecorations(ids, 'en').then(results => {
            for (const decoration of results ?? []) {
                if (decoration.icon) this._decorationIcons.set(decoration.id, decoration.icon);
            }
            this.render(this.appStore.getState());
        }).catch(() => {
            ids.forEach(id => this._requestedDecorationIds.delete(id));
        });
    }

    /**
     * Handle click on a decoration item
     */
    private _decorationClick(decorationId: string, event: MouseEvent): void {
        if (event.shiftKey && this._anchorId) {
            // Shift+Click: range selection
            this.selectionStore.selectRange(this._anchorId, decorationId, this._orderedIds);
        } else if (event.ctrlKey || event.metaKey) {
            // Ctrl+Click: toggle selection
            this.selectionStore.toggleDecoration(decorationId);
            // Don't update anchor on toggle
        } else {
            // Plain click: single select
            this.selectionStore.selectDecoration(decorationId);
            this._anchorId = decorationId;
        }
    }

    /**
     * Update selection highlight CSS classes on items
     */
    private _updateSelectionHighlights(): void {
        const items = this._listContainer!.querySelectorAll('.decoration-list__item');
        items.forEach(item => {
            const id = item.getAttribute('data-decoration-id');
            if (!id) return;
            if (this.selectionStore.isSelected(id)) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

    /**
     * Get the flat ordered list of visible decoration IDs
     */
    getOrderedIds(): string[] {
        return [...this._orderedIds];
    }

    getElement(): HTMLElement {
        return this.container;
    }

    /**
     * Handle drag start on a decoration item.
     * If the dragged item is selected, drag all selected IDs.
     * If not selected, select it first then drag.
     */
    private _decorationDragStart(decorationId: string, event: DragEvent): void {
        // If the dragged item is not already selected, select it
        if (!this.selectionStore.isSelected(decorationId)) {
            this.selectionStore.selectDecoration(decorationId);
        }

        const selectedIds = this.selectionStore.getSelectedIds();
        if (event.dataTransfer) {
            event.dataTransfer.setData('application/x-decoration-ids', JSON.stringify(selectedIds));
            event.dataTransfer.effectAllowed = 'move';
        }
        // Custom drag image showing count
        const count = selectedIds.length;
        if (count > 1) {
            const dragImage = createElement('div', {
                className: 'decoration-drag-image',
                textContent: `${count} decorations`,
                parent: document.body
            });
            dragImage.style.position = 'absolute';
            dragImage.style.top = '-9999px';
            if (event.dataTransfer) event.dataTransfer.setDragImage(dragImage, 0, 0);
            // Clean up after drag
            setTimeout(() => dragImage.remove(), 0);
        }
    }

    /**
     * Handle right-click context menu on a layer group header.
     * Mirrors the context menu from LayerPanel: Select All + Merge to...
     */
    _handleLayerHeaderContextMenu(layer: Layer, event: MouseEvent): void {
        event.preventDefault();
        if (!this._contextMenu) return;

        this.selectionStore.setActiveLayer(layer.id);

        let decorationIds: string[] = [];
        if (typeof layer.getAllDecorations === 'function') {
            decorationIds = layer.getAllDecorations().map(d => d.uid);
        } else if (layer.decorations instanceof Map) {
            decorationIds = Array.from(layer.decorations.values()).map(d => d.uid);
        }

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
     * Show confirmation dialog and execute the merge layer command.
     * @param sourceLayer - The layer to merge from (will be deleted)
     * @param targetLayer - The layer to merge into
     */
    async _confirmAndMergeLayer(sourceLayer: Layer, targetLayer: Layer): Promise<void> {
        const decorationCount = typeof sourceLayer.getAllDecorations === 'function'
            ? sourceLayer.getAllDecorations().length
            : 0;
        const decorationText = decorationCount === 1 ? '1 decoration' : `${decorationCount} decorations`;

        const confirmed = await this._confirmDialog.show({
            title: 'Merge Layer',
            message: `Move ${decorationText} from "${sourceLayer.name}" into "${targetLayer.name}" and delete "${sourceLayer.name}"?`,
            confirmLabel: 'Merge',
            cancelLabel: 'Cancel'
        });

        if (!confirmed) return;

        try {
            await this.appService!.execute({
                type: 'MergeLayerCommand',
                payload: {
                    sourceLayerId: sourceLayer.id,
                    targetLayerId: targetLayer.id
                }
            });
        } catch (error) {
            console.error('[DecorationListPanel] Error merging layer:', error);
            this.eventBus.publish('ERROR', { message: 'Failed to merge layer' });
        }
    }

    /**
     * Handle right-click context menu on a decoration item.
     */
    private _decorationContextMenu(decorationId: string, layerId: string, event: MouseEvent): void {
        event.preventDefault();
        if (!this._contextMenu || !this.appService) return;

        // If right-clicked item is not selected, select it first
        if (!this.selectionStore.isSelected(decorationId)) {
            this.selectionStore.selectDecoration(decorationId);
        }

        const selectedIds = this.selectionStore.getSelectedIds();
        const count = selectedIds.length;
        const state = this.appStore.getState();
        const layers = state.layers || [];

        // Collect all visible decorations (flat list), then apply search filter
        const allVisibleDecorations = [];
        for (const layer of layers) {
            if (!layer.isVisible) continue;
            let decs: Decoration[] = [];
            if (typeof layer.getAllDecorations === 'function') {
                decs = layer.getAllDecorations();
            } else if (Array.isArray(layer.decorations)) {
                decs = layer.decorations;
            } else if (layer.decorations instanceof Map) {
                decs = Array.from(layer.decorations.values());
            }
            allVisibleDecorations.push(...decs);
        }

        const searchFragments = this._getSearchFragments();
        const filteredVisibleDecorations = this._filterDecorations(allVisibleDecorations, searchFragments);

        // Find the type id of the right-clicked decoration
        const clickedDec = filteredVisibleDecorations.find(d => d.uid === decorationId);
        const clickedTypeId = clickedDec ? clickedDec.id : null;

        // Build "Move to Layer" submenu
        const moveSubmenu = layers
            .filter(l => l.id !== layerId)
            .map(l => ({
                label: l.name || `Layer ${l.id}`,
                action: () => {
                    this.appService!.execute({
                        type: 'MoveDecorationsCommand',
                        payload: { decorationIds: selectedIds, targetLayerId: l.id }
                    });
                }
            }));

        // Collect decoration IDs in the same layer as the right-clicked item, respecting search filter
        const clickedLayer = layers.find(l => l.id === layerId);
        let layerDecorationIds: string[] = [];
        if (clickedLayer) {
            let layerDecorations: Decoration[] = [];
            if (typeof clickedLayer.getAllDecorations === 'function') {
                layerDecorations = clickedLayer.getAllDecorations();
            } else if (clickedLayer.decorations instanceof Map) {
                layerDecorations = Array.from(clickedLayer.decorations.values());
            } else if (Array.isArray(clickedLayer.decorations)) {
                layerDecorations = clickedLayer.decorations;
            }
            layerDecorationIds = this._filterDecorations(layerDecorations, searchFragments).map(d => d.uid);
        }

        const items = [];

        // "Select all in layer"
        items.push({
            label: `Select All in Layer (${layerDecorationIds.length})`,
            disabled: layerDecorationIds.length === 0,
            action: () => {
                this.selectionStore.selectAll(layerDecorationIds);
            }
        });

        // "Select all of same type" — only when a type id is known and there are matches
        if (clickedTypeId !== null) {
            const sameTypeUids = filteredVisibleDecorations
                .filter(d => d.id === clickedTypeId)
                .map(d => d.uid);
            if (sameTypeUids.length > 1) {
                items.push({
                    label: `Select All of Same Type (${sameTypeUids.length})`,
                    action: () => {
                        this.selectionStore.selectAll(sameTypeUids);
                    }
                });
            }
        }

        if (moveSubmenu.length > 0) {
            items.push({ label: 'Move to Layer', submenu: moveSubmenu });
        }
        items.push({
            label: `Delete ${count} Decoration${count > 1 ? 's' : ''}`,
            action: () => {
                this.eventBus.publish('confirm:deleteDecorations', { decorationIds: selectedIds });
            }
        });

        this._contextMenu.show(event.clientX, event.clientY, items);
    }

    /**
     * Open the decoration info dialog for a decoration.
     * Resolves the layer name from the current store state.
     */
    private _decorationDoubleClick(decoration: Decoration, layerId: string): void {
        const state = this.appStore.getState();
        const layers = state.layers || [];
        const layer = layers.find(l => l.id === layerId);
        const layerName = layer ? (layer.name || `Layer ${layer.id}`) : undefined;
        this._decorationInfoDialog.show({ decoration, layerName });
    }
}

export { DecorationListPanel };
