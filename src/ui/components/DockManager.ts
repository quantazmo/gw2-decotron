/**
 * DockManager
 * Top-level orchestrator for the panel layout system.
 * Subscribes to LayoutStore and re-renders the layout tree as nested flexbox containers:
 *   SplitNode    → flex container (.split-node) with ratio-based children
 *   PanelNode    → DockRegion wrapper (.panel-wrapper)
 *   TabGroupNode → TabbedContainer (.tabbed-container) with clickable tabs
 */

import { DockRegion } from './DockRegion.js';
import { TabbedContainer } from './TabbedContainer.js';
import { StackedContainer } from './StackedContainer.js';
import { RibbonToolbar } from './RibbonToolbar.js';
import { CreatePanel, type ExtendPatternValues } from './CreatePanel.js';
import { DockLayoutConfiguration, replaceNode, createTabGroupNode, createSplitNode, createPanelNode, findNode } from '../../domain/DockLayoutConfiguration.js';
import { ResizeDockCommand } from '../../application/commands/ResizeDockCommand.js';
import { LAYOUT, PANEL_IDS } from '../../config/constants.js';
import type { DockLayoutNode, DockNodePath, PanelNode, SplitNode, TabGroupNode } from '../../domain/DockLayoutConfiguration.js';
import type { AppService } from '../../application/AppService.js';
import type { AppStore } from '../stores/AppStore.js';
import type { ZoomStore } from '../stores/ZoomStore.js';
import type { EventBus } from '../EventBus.js';
import type { UndoRedoManager } from '../../application/UndoRedoManager.js';
import type { ToolModeStore } from '../stores/ToolModeStore.js';
import type { SelectionStore } from '../stores/SelectionStore.js';
import type { DockPanelLayoutStore } from '../stores/DockPanelLayoutStore.js';

/** Minimum interval (ms) between resize re-renders to avoid layout thrashing. */
const RESIZE_DEBOUNCE_MS = 150;
const CREATE_PANEL_WIDTH_KEY = 'gw2-decoration-editor-create-panel-width';

const PANEL_LABELS: Record<string, string> = {
    map: 'Map',
    layers: 'Layers',
    decorationList: 'Decoration List',
    create: 'Create'
};

export class DockManager {
    private rootElement: HTMLElement;
    private layoutStore: DockPanelLayoutStore;
    private panelContentMap: Record<string, HTMLElement>;
    private _appService: AppService | null;
    private _eventBus: EventBus | null;
    private _appStore: AppStore | null;
    private _zoomStore: ZoomStore | null;
    private _undoRedoManager: UndoRedoManager | null;
    private _toolModeStore: ToolModeStore | null;
    private _selectionStore: SelectionStore | null;
    private _unsubscribe: (() => void) | null;
    private _treeContainer: HTMLDivElement | null;
    private _ribbon: RibbonToolbar | null;
    private _resizeHandler: (() => void) | null;
    private _resizeTimer: ReturnType<typeof setTimeout> | null;
    private _currentMapName: string | null;
    private _moveModeActive: boolean;
    private _extendPatternActive: boolean;
    private _fillPatternActive: boolean;
    private _createPanel: CreatePanel;
    private _createMapRatio: number | null;
    private _unsubscribeMoveMode: (() => void) | null;

    /**
     * @param {HTMLElement} rootElement     Container div (#dock-manager-root)
     * @param {LayoutStore} layoutStore     LayoutStore instance
     * @param {Object} panelContentMap      Map of panelId → HTMLElement content sources
     *   e.g. { map: el, layers: el, decorationList: el }
     * @param {object} [appService]         AppService for dispatching commands (optional)
    * @param {object} [eventBus]           EventBus for tab activation events (optional)
     * @param {object} [appStore]           AppStore for ribbon toolbar state (optional)
     * @param {object} [zoomStore]          ZoomStore for ribbon zoom actions (optional)
     * @param {object} [undoRedoManager]    UndoRedoManager for ribbon undo/redo (optional)
     * @param {object} [toolModeStore]      ToolModeStore for ribbon tool mode buttons (optional)
     */
    constructor(
        rootElement: HTMLElement,
        layoutStore: DockPanelLayoutStore,
        panelContentMap: Record<string, HTMLElement>,
        appService: AppService | null = null,
        eventBus: EventBus | null = null,
        appStore: AppStore | null = null,
        zoomStore: ZoomStore | null = null,
        undoRedoManager: UndoRedoManager | null = null,
        toolModeStore: ToolModeStore | null = null,
        selectionStore: SelectionStore | null = null
    ) {
        this.rootElement = rootElement;
        this.layoutStore = layoutStore;
        this.panelContentMap = panelContentMap || {};
        this._appService = appService;
        this._eventBus = eventBus;
        this._appStore = appStore;
        this._zoomStore = zoomStore;
        this._undoRedoManager = undoRedoManager;
        this._toolModeStore = toolModeStore;
        this._selectionStore = selectionStore;
        this._unsubscribe = null;
        this._treeContainer = null;
        this._ribbon = null;
        this._resizeHandler = null;
        this._resizeTimer = null;
        this._currentMapName = null;
        this._moveModeActive = false;
        this._extendPatternActive = false;
        this._fillPatternActive = false;
        this._createPanel = new CreatePanel(eventBus, appStore, selectionStore);
        this._createMapRatio = null;
        this._unsubscribeMoveMode = null;
    }

    /**
     * Mount DockManager: subscribe to store and render initial layout.
    * Also initialises RibbonToolbar if the appropriate dependencies were provided.
     */
    mount(): void {
        // Create a stable sub-container for the layout tree so that the ribbon
        // toolbar and reset button persist across re-renders.
        this._treeContainer = document.createElement('div');
        this._treeContainer.className = 'dock-layout-tree';
        this._createPanel.setRootElement(this._treeContainer);
        this.rootElement.appendChild(this._treeContainer);

        this._unsubscribe = this.layoutStore.subscribe(() => this._render());
        this._render();

        if (this._eventBus) {
            const unsubs = [
                this._eventBus.subscribe('move:selected-start-requested', () => {
                    this._moveModeActive = true;
                    this._setMoveSelectedHintVisible(true);
                    const state = this._appStore?.getState();
                    const targetLayerId = state?.activeLayerId ?? state?.layers?.[0]?.id ?? '__new__';
                    this._createPanel.startMove(targetLayerId);
                    this._eventBus?.publish('move:selected-copy-target-changed', targetLayerId);
                    this._render();
                }),
                this._eventBus.subscribe('move:selected-save-requested', () => {
                    this._moveModeActive = false;
                    this._setMoveSelectedHintVisible(false);
                    this._render();
                }),
                this._eventBus.subscribe('move:selected-cancel-requested', () => {
                    this._moveModeActive = false;
                    this._setMoveSelectedHintVisible(false);
                    this._render();
                }),
                this._eventBus.subscribe<{ x: number; y: number; z: number }>('move:selected-position-changed', position => {
                    this._createPanel.setMovePosition(position);
                }),
                this._eventBus.subscribe('extend:pattern-start-requested', () => {
                    this._extendPatternActive = true;
                    this._moveModeActive = false;
                    this._render();
                }),
                this._eventBus.subscribe<{ start: ExtendPatternValues; step: ExtendPatternValues }>('extend:pattern-seed-values-changed', values => {
                    this._createPanel.setExtendValues(values);
                }),
                this._eventBus.subscribe('extend:pattern-completed', () => {
                    this._extendPatternActive = false;
                    this._render();
                }),
                this._eventBus.subscribe('extend:pattern-cancel-requested', () => {
                    this._extendPatternActive = false;
                    this._render();
                }),
                this._eventBus.subscribe('fill:pattern-start-requested', () => {
                    this._fillPatternActive = true;
                    this._moveModeActive = false;
                    this._extendPatternActive = false;
                    this._render();
                }),
                this._eventBus.subscribe<{ start: ExtendPatternValues; end: ExtendPatternValues }>('fill:pattern-seed-values-changed', values => {
                    this._createPanel.setFillValues(values);
                }),
                this._eventBus.subscribe('fill:pattern-completed', () => {
                    this._fillPatternActive = false;
                    this._render();
                }),
                this._eventBus.subscribe('fill:pattern-cancel-requested', () => {
                    this._fillPatternActive = false;
                    this._render();
                })
            ];
            this._unsubscribeMoveMode = () => unsubs.forEach(unsubscribe => unsubscribe());
        }

        // Add RibbonToolbar above the layout tree
        if (this._appService && this._appStore && this._zoomStore) {
            const ribbon = new RibbonToolbar(
                this._appService, this._appStore, this._zoomStore, this._eventBus, this._undoRedoManager, this._toolModeStore, this._selectionStore
            );
            this._ribbon = ribbon;
            this.rootElement.insertBefore(ribbon.getElement(), this._treeContainer);
            this.rootElement.classList.add('has-ribbon');
        }

        // Subscribe to tab activation events and update the layout tree activeIndex
        if (this._eventBus) {
            this._eventBus.subscribe('layout:tab-activated', (data: { panels: string[]; activeIndex: number }) => {
                const { panels, activeIndex } = data;
                this._onTabActivated(panels, activeIndex);
            });
        }

        // Subscribe to AppStore to track the loaded map name for the map panel title
        if (this._appStore) {
            this._appStore.subscribe((state) => {
                const mapName = state.map?.name || null;
                if (mapName !== this._currentMapName) {
                    this._currentMapName = mapName;
                    const titleEl = this._treeContainer && this._treeContainer.querySelector('[data-panel-id="map"] .dock-region-title-text');
                    if (titleEl) {
                        titleEl.textContent = mapName ? `Map — ${mapName}` : 'Map';
                    }
                }
            });
        }

        // Listen for browser window resize to re-enforce minimum panel sizes
        this._resizeHandler = () => this._onWindowResize();
        window.addEventListener('resize', this._resizeHandler);
    }

    /**
     * Unmount DockManager: unsubscribe from store and clean up ribbon.
     */
    unmount(): void {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        this._unsubscribeMoveMode?.();
        this._unsubscribeMoveMode = null;
        if (this._ribbon) {
            this._ribbon.unmount();
            this._ribbon = null;
        }
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
        if (this._resizeTimer) {
            clearTimeout(this._resizeTimer);
            this._resizeTimer = null;
        }
    }

    private _setMoveSelectedHintVisible(visible: boolean): void {
        const hint = this.panelContentMap.map?.querySelector<HTMLElement>('.move-selected-hint');
        if (hint) hint.hidden = !visible;
    }

    /**
     * Re-render the layout tree inside _treeContainer.
     * Only the tree container is cleared; ribbon and reset button persist.
     * @private
     */
    _render(): void {
        const container = this._treeContainer || this.rootElement;
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

        const layout = this.layoutStore.getState();
        const rendered = this._moveModeActive || this._extendPatternActive || this._fillPatternActive
            ? this._renderMoveMode(layout.tree)
            : this._renderNode(layout.tree, []);
        container.appendChild(rendered);
    }

    _renderMoveMode(tree: DockLayoutNode): HTMLElement {
        const split = findNode(tree, node => node.type === 'split' &&
            findNode(node, child => child.type === 'panel' && child.panelId === PANEL_IDS.MAP) !== null);
        const splitNode = split?.node.type === 'split' ? split.node : null;
        if (this._createMapRatio === null) {
            const storedWidth = Number(localStorage.getItem(CREATE_PANEL_WIDTH_KEY));
            const mapRatio = splitNode
                ? (findNode(splitNode.first, node => node.type === 'panel' && node.panelId === PANEL_IDS.MAP) ? splitNode.ratio : 1 - splitNode.ratio)
                : 0.8125;
            this._createMapRatio = Number.isFinite(storedWidth) && storedWidth >= 0.1 && storedWidth <= 0.5
                ? 1 - storedWidth
                : mapRatio;
        }

        const mapNode = createPanelNode(PANEL_IDS.MAP);
        const createNode = createPanelNode('create');
        const mapFirst = !splitNode || !!findNode(splitNode.first, node => node.type === 'panel' && node.panelId === PANEL_IDS.MAP);
        const map = this._renderNode(mapNode, []);
        const create = this._renderPanelNode(createNode);
        const ratio = mapFirst ? this._createMapRatio : 1 - this._createMapRatio;
        const customSplit = createSplitNode('vertical', ratio, mapFirst ? mapNode : createNode, mapFirst ? createNode : mapNode);
        const first = mapFirst ? map : create;
        const second = mapFirst ? create : map;
        const divider = new StackedContainer(customSplit, first, second, newRatio => {
            this._createMapRatio = mapFirst ? newRatio : 1 - newRatio;
            localStorage.setItem(CREATE_PANEL_WIDTH_KEY, String(1 - this._createMapRatio));
            this._render();
        }, mapFirst ? { minRatio: LAYOUT.MAP_MIN_RATIO } : { maxRatio: 1 - LAYOUT.MAP_MIN_RATIO });
        return divider.getElement();
    }

    /**
     * Recursively render a LayoutNode into a DOM element.
     * @param {object}   node
     * @param {string[]} path  Path from tree root to this node (array of 'first'|'second')
     * @returns {HTMLElement}
     * @private
     */
    _renderNode(node: DockLayoutNode, path: DockNodePath): HTMLElement {
        if (node.type === 'panel') {
            return this._renderPanelNode(node);
        }
        if (node.type === 'split') {
            return this._renderSplitNode(node, path);
        }
        if (node.type === 'tabgroup') {
            return this._renderTabGroupNode(node);
        }

        // Fallback for unknown node types
        const fallback = document.createElement('div');
        fallback.className = 'panel-wrapper';
        return fallback;
    }

    /** @private */
    _renderPanelNode(node: PanelNode): HTMLElement {
        const createMode = this._extendPatternActive ? 'extend' : this._fillPatternActive ? 'fill' : 'move';
        const contentEl = node.panelId === 'create' ? this._createPanel.render(createMode) : this.panelContentMap[node.panelId] || null;
        const baseLabel = PANEL_LABELS[node.panelId] || node.panelId;
        const label = (node.panelId === 'map' && this._currentMapName)
            ? `${baseLabel} — ${this._currentMapName}`
            : baseLabel;
        let panelLabel = label;
        switch (true) {
            case node.panelId === 'create' && this._extendPatternActive:
                panelLabel = 'Extend Decoration Pattern';
                break;
            case node.panelId === 'create' && this._fillPatternActive:
                panelLabel = 'Fill Decoration Pattern';
                break;
            case node.panelId === 'create' && this._moveModeActive:
                panelLabel = 'Copy/Move Decorations';
                break;
        }
        const region = new DockRegion(node.panelId, contentEl, panelLabel);

        const wrapper = document.createElement('div');
        wrapper.className = 'panel-wrapper';
        wrapper.dataset.panelId = node.panelId;
        wrapper.appendChild(region.getElement());
        return wrapper;
    }

    /** @private */
    _renderSplitNode(node: SplitNode, path: DockNodePath): HTMLElement {
        const firstEl = this._renderNode(node.first, [...path, 'first']);
        const secondEl = this._renderNode(node.second, [...path, 'second']);

        // Detect which child contains the map to compute appropriate ratio constraints.
        // This enforces the MAP_MIN_RATIO constraint both visually (DividerResizer clamping)
        // and structurally (ResizeDockCommand handler).
        const mapInFirst = findNode(node.first, n => n.type === 'panel' && n.panelId === PANEL_IDS.MAP) !== null;
        const mapInSecond = !mapInFirst &&
            findNode(node.second, n => n.type === 'panel' && n.panelId === PANEL_IDS.MAP) !== null;

        const dividerOptions: { minRatio?: number; maxRatio?: number } = {};
        if (mapInFirst) {
            dividerOptions.minRatio = Math.max(LAYOUT.SPLIT_RATIO_MIN, LAYOUT.MAP_MIN_RATIO);
        } else if (mapInSecond) {
            dividerOptions.maxRatio = Math.min(LAYOUT.SPLIT_RATIO_MAX, 1 - LAYOUT.MAP_MIN_RATIO);
        }

        const appService = this._appService;
        const onRatioChange = appService
            ? (newRatio: number) => { void appService.execute(new ResizeDockCommand(path, newRatio)); }
            : (newRatio: number) => this._onDividerMoved(node, newRatio);

        const stacked = new StackedContainer(node, firstEl, secondEl, onRatioChange, dividerOptions);
        return stacked.getElement();
    }

    /** @private */
    _renderTabGroupNode(node: TabGroupNode): HTMLElement {
        const container = new TabbedContainer(node, this.panelContentMap, this._eventBus);

        const wrapper = document.createElement('div');
        wrapper.className = 'panel-wrapper tab-group-wrapper';
        wrapper.appendChild(container.getElement());
        return wrapper;
    }

    /**
     * Handle browser window resize.
     * Debounces rapid resize events, then re-enforces minimum panel sizes by
     * checking every panel wrapper in the rendered tree. If any panel is below
     * the minimum threshold, the layout is re-rendered so flexbox can
     * redistribute space.
     * @private
     */
    _onWindowResize(): void {
        if (this._resizeTimer) clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => {
            this._resizeTimer = null;
            this._enforceMinimumSizes();
        }, RESIZE_DEBOUNCE_MS);
    }

    /**
     * Walk all rendered panel wrappers and collapse any that fall below the
     * minimum dimensions. "Collapse" means hiding the content area while
     * keeping the title bar visible so the panel can be identified and
     * re-expanded when space allows.
     * @private
     */
    _enforceMinimumSizes(): void {
        const container = this._treeContainer || this.rootElement;
        const panels = container.querySelectorAll('.panel-wrapper');

        panels.forEach(panel => {
            const rect = panel.getBoundingClientRect();
            const tooNarrow = rect.width > 0 && rect.width < LAYOUT.MIN_PANEL_WIDTH;
            const tooShort = rect.height > 0 && rect.height < LAYOUT.MIN_PANEL_HEIGHT;

            const contentArea =
                panel.querySelector<HTMLElement>('.dock-region-content') ||
                panel.querySelector<HTMLElement>('.tab-content-area');

            if (contentArea) {
                if (tooNarrow || tooShort) {
                    panel.classList.add('panel-collapsed');
                    contentArea.style.display = 'none';
                } else {
                    panel.classList.remove('panel-collapsed');
                    contentArea.style.display = '';
                }
            }
        });
    }

    /**
     * Handle a tab-activated event: update the activeIndex on the matching TabGroupNode
     * in the layout tree and commit to LayoutStore.
     *
     * @param {string[]} panels      Ordered panel IDs on the tab group that was clicked
     * @param {number}   activeIndex New active index
     * @private
     */
    _onTabActivated(panels: string[], activeIndex: number): void {
        const layout = this.layoutStore.getState();
        const newTree = replaceNode(
            layout.tree,
            node => node.type === 'tabgroup' &&
                node.panels.length === panels.length &&
                node.panels.every((p, i) => p === panels[i]),
            createTabGroupNode(panels, activeIndex)
        );
        const newLayout = new DockLayoutConfiguration(newTree ?? layout.tree, layout.version);
        this.layoutStore.setState(newLayout);
    }

    /**
     * Handle a divider drag: update the ratio on the matching SplitNode in the
     * layout tree and commit to LayoutStore.
     *
     * @param {object} splitNode  The SplitNode reference captured at render time
     * @param {number} newRatio   New ratio value (already clamped by DividerResizer)
     * @private
     */
    _onDividerMoved(splitNode: SplitNode, newRatio: number): void {
        const layout = this.layoutStore.getState();
        const newTree = replaceNode(
            layout.tree,
            node => node === splitNode,
            createSplitNode(splitNode.direction, newRatio, splitNode.first, splitNode.second)
        );
        const newLayout = new DockLayoutConfiguration(newTree ?? layout.tree, layout.version);
        this.layoutStore.setState(newLayout);
    }
}
