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

type ExtendPatternValues = {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
};

const PANEL_LABELS: Record<string, string> = {
    map: 'Map',
    layers: 'Layers',
    decorationList: 'Decoration List',
    create: 'Move Selected'
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
    private _createMapRatio: number | null;
    private _unsubscribeMoveMode: (() => void) | null;
    private _moveSelectedPosition: { x: number; y: number; z: number } | null;
    private _moveAsCopy: boolean;
    private _moveCopyTargetLayerId: string | null;
    private _fillPatternStart: ExtendPatternValues;
    private _fillPatternEnd: ExtendPatternValues;

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
        this._createMapRatio = null;
        this._unsubscribeMoveMode = null;
        this._moveSelectedPosition = null;
        this._moveAsCopy = false;
        this._moveCopyTargetLayerId = null;
        this._fillPatternStart = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
        this._fillPatternEnd = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
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
        this.rootElement.appendChild(this._treeContainer);

        this._unsubscribe = this.layoutStore.subscribe(() => this._render());
        this._render();

        if (this._eventBus) {
            const unsubs = [
                this._eventBus.subscribe('move:selected-start-requested', () => {
                    this._moveModeActive = true;
                    this._setMoveSelectedHintVisible(true);
                    this._moveSelectedPosition = null;
                    this._moveAsCopy = false;
                    const state = this._appStore?.getState();
                    this._moveCopyTargetLayerId = state?.activeLayerId ?? state?.layers?.[0]?.id ?? '__new__';
                    this._eventBus?.publish('move:selected-copy-target-changed', this._moveCopyTargetLayerId);
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
                    this._moveSelectedPosition = { ...position };
                    this._syncMovePositionInputs();
                }),
                this._eventBus.subscribe<boolean>('move:selected-copy-changed', enabled => {
                    this._moveAsCopy = enabled;
                }),
                this._eventBus.subscribe('extend:pattern-start-requested', () => {
                    this._extendPatternActive = true;
                    this._moveModeActive = false;
                    this._render();
                }),
                this._eventBus.subscribe<{ start: ExtendPatternValues; step: ExtendPatternValues }>('extend:pattern-seed-values-changed', values => {
                    this._syncExtendPatternInputs(values);
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
                    this._syncFillPatternInputs(values);
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
        const contentEl = node.panelId === 'create' ? this._createPanelContent() : this.panelContentMap[node.panelId] || null;
        const baseLabel = PANEL_LABELS[node.panelId] || node.panelId;
        const label = (node.panelId === 'map' && this._currentMapName)
            ? `${baseLabel} — ${this._currentMapName}`
            : baseLabel;
        const panelLabel = node.panelId === 'create' && this._extendPatternActive
            ? 'Extend Decoration Pattern'
            : node.panelId === 'create' && this._fillPatternActive
                ? 'Fill Decoration Pattern'
                : label;
        const region = new DockRegion(node.panelId, contentEl, panelLabel);

        const wrapper = document.createElement('div');
        wrapper.className = 'panel-wrapper';
        wrapper.dataset.panelId = node.panelId;
        wrapper.appendChild(region.getElement());
        return wrapper;
    }

    _createPanelContent(): HTMLElement {
        if (this._extendPatternActive) return this._createExtendPatternPanelContent();
        if (this._fillPatternActive) return this._createFillPatternPanelContent();
        const content = document.createElement('div');
        content.className = 'create-panel-content';
        const message = document.createElement('p');
        message.className = 'create-panel-hint';
        message.textContent = 'Pan the map or enter an offset for the selected decorations.';
        const fields = document.createElement('div');
        fields.className = 'move-position-fields';
        (['x', 'y', 'z'] as const).forEach(axis => {
            const label = document.createElement('label');
            label.className = 'move-position-field';
            const caption = document.createElement('span');
            caption.textContent = axis.toUpperCase();
            const input = document.createElement('input');
            input.type = 'number';
            input.step = 'any';
            input.className = 'move-position-input';
            input.dataset.axis = axis;
            input.setAttribute('aria-label', `${axis.toUpperCase()} offset`);
            input.value = this._moveSelectedPosition ? String(this._moveSelectedPosition[axis]) : '';
            input.addEventListener('input', () => {
                const values = Array.from(fields.querySelectorAll<HTMLInputElement>('.move-position-input'));
                if (values.length !== 3 || values.some(field => !Number.isFinite(field.valueAsNumber))) return;
                const position = {
                    x: fields.querySelector<HTMLInputElement>('[data-axis="x"]')!.valueAsNumber,
                    y: fields.querySelector<HTMLInputElement>('[data-axis="y"]')!.valueAsNumber,
                    z: fields.querySelector<HTMLInputElement>('[data-axis="z"]')!.valueAsNumber
                };
                this._eventBus?.publish('move:selected-position-requested', position);
            });
            label.append(caption, input);
            fields.appendChild(label);
        });
        const copyLabel = document.createElement('label');
        copyLabel.className = 'move-as-copy-control';
        const copyInput = document.createElement('input');
        copyInput.type = 'checkbox';
        copyInput.className = 'move-as-copy-input';
        copyInput.checked = this._moveAsCopy;
        copyInput.addEventListener('change', () => {
            this._moveAsCopy = copyInput.checked;
            targetControl.hidden = !copyInput.checked;
            this._eventBus?.publish('move:selected-copy-changed', copyInput.checked);
        });
        const copyText = document.createElement('span');
        copyText.textContent = 'Move as Copy';
        copyLabel.append(copyInput, copyText);
        const targetControl = document.createElement('label');
        targetControl.className = 'move-copy-target-control';
        targetControl.hidden = !copyInput.checked;
        const targetCaption = document.createElement('span');
        targetCaption.textContent = 'Target Layer';
        const targetSelect = document.createElement('select');
        targetSelect.className = 'move-copy-target-select';
        targetSelect.setAttribute('aria-label', 'Target layer for copied decorations');
        const state = this._appStore?.getState();
        (state?.layers ?? []).forEach(layer => {
            const option = document.createElement('option');
            option.value = layer.id;
            option.textContent = layer.name || `Layer ${layer.id}`;
            targetSelect.appendChild(option);
        });
        const newLayerOption = document.createElement('option');
        newLayerOption.value = '__new__';
        newLayerOption.textContent = 'New Layer';
        targetSelect.appendChild(newLayerOption);
        targetSelect.value = this._moveCopyTargetLayerId ?? state?.activeLayerId ?? state?.layers?.[0]?.id ?? '__new__';
        this._moveCopyTargetLayerId = targetSelect.value;
        targetSelect.addEventListener('change', () => {
            this._moveCopyTargetLayerId = targetSelect.value;
            this._eventBus?.publish('move:selected-copy-target-changed', targetSelect.value);
        });
        targetControl.append(targetCaption, targetSelect);
        const actions = document.createElement('div');
        actions.className = 'create-panel-actions';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'create-panel-cancel';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => this._eventBus?.publish('move:selected-cancel-requested'));
        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'create-panel-save';
        save.textContent = 'Save';
        save.addEventListener('click', () => this._eventBus?.publish('move:selected-save-requested'));
        actions.append(save, cancel);
        content.append(message, fields, copyLabel, targetControl, actions);
        return content;
    }

    _createExtendPatternPanelContent(): HTMLElement {
        const content = document.createElement('div');
        content.className = 'create-panel-content extend-pattern-panel-content';

        const methodLabel = document.createElement('label');
        methodLabel.className = 'extend-pattern-method-field';
        const methodCaption = document.createElement('span');
        methodCaption.textContent = 'Method';
        const methodSelect = document.createElement('select');
        methodSelect.className = 'extend-pattern-method-select';
        methodSelect.setAttribute('aria-label', 'Method');
        const linearOption = document.createElement('option');
        linearOption.value = 'linear';
        linearOption.textContent = 'Linear';
        methodSelect.appendChild(linearOption);
        methodLabel.append(methodCaption, methodSelect);

        const countLabel = document.createElement('label');
        countLabel.className = 'extend-pattern-count-field';
        const countCaption = document.createElement('span');
        countCaption.textContent = 'Count';
        const countInput = document.createElement('input');
        countInput.type = 'number';
        countInput.min = '1';
        countInput.step = '1';
        countInput.value = '1';
        countInput.className = 'extend-pattern-count-input';
        countInput.setAttribute('aria-label', 'Count');
        countLabel.append(countCaption, countInput);

        const swapStartButton = document.createElement('button');
        swapStartButton.type = 'button';
        swapStartButton.className = 'extend-pattern-swap-start-button';
        swapStartButton.textContent = 'Swap Start Decoration';
        swapStartButton.setAttribute('aria-pressed', 'false');
        swapStartButton.hidden = (this._selectionStore?.getSelectedIds().length ?? 0) < 2;
        let swapDirection = false;

        const fields = document.createElement('div');
        fields.className = 'extend-pattern-field-grid';
        const blankHeader = document.createElement('span');
        blankHeader.className = 'extend-pattern-grid-header';
        const startHeader = document.createElement('span');
        startHeader.className = 'extend-pattern-grid-header';
        startHeader.textContent = 'Start';
        const offsetHeader = document.createElement('span');
        offsetHeader.className = 'extend-pattern-grid-header';
        offsetHeader.textContent = 'Offset';
        fields.append(blankHeader, startHeader, offsetHeader);

        const fieldRows = [
            { label: 'Position X', group: 'position', axis: 'x' },
            { label: 'Position Y', group: 'position', axis: 'y' },
            { label: 'Position Z', group: 'position', axis: 'z' },
            { label: 'Rotation X', group: 'rotation', axis: 'x' },
            { label: 'Rotation Y', group: 'rotation', axis: 'y' },
            { label: 'Rotation Z', group: 'rotation', axis: 'z' }
        ] as const;
        for (const row of fieldRows) {
            const rowLabel = document.createElement('span');
            rowLabel.className = 'extend-pattern-field-label';
            rowLabel.textContent = row.label;
            fields.appendChild(rowLabel);
            for (const role of ['start', 'step'] as const) {
                const input = document.createElement('input');
                input.type = 'number';
                input.step = 'any';
                input.className = 'extend-pattern-value-input';
                input.dataset.role = role;
                input.dataset.group = row.group;
                input.dataset.axis = row.axis;
                input.setAttribute('aria-label', `${role === 'step' ? 'Offset' : 'Start'} ${row.label.toLowerCase()}`);
                input.readOnly = role === 'start';
                input.value = '0';
                fields.appendChild(input);
            }
        }

        const readValues = (role: 'start' | 'step'): ExtendPatternValues => {
            const read = (group: 'position' | 'rotation', axis: 'x' | 'y' | 'z') =>
                fields.querySelector<HTMLInputElement>(`[data-role="${role}"][data-group="${group}"][data-axis="${axis}"]`)!.valueAsNumber;
            return {
                position: { x: read('position', 'x'), y: read('position', 'y'), z: read('position', 'z') },
                rotation: { x: read('rotation', 'x'), y: read('rotation', 'y'), z: read('rotation', 'z') }
            };
        };
        const writeValues = (role: 'start' | 'step', values: ExtendPatternValues): void => {
            for (const group of ['position', 'rotation'] as const) {
                for (const axis of ['x', 'y', 'z'] as const) {
                    const input = fields.querySelector<HTMLInputElement>(`[data-role="${role}"][data-group="${group}"][data-axis="${axis}"]`)!;
                    input.value = String(values[group][axis]);
                }
            }
        };

        const publishPreviewUpdate = () => {
            const count = Number(countInput.value);
            if (!Number.isInteger(count) || count < 1) return;
            const start = readValues('start');
            const step = readValues('step');
            const numbers = [...Object.values(start.position), ...Object.values(start.rotation), ...Object.values(step.position), ...Object.values(step.rotation)];
            if (numbers.some(value => !Number.isFinite(value))) return;
            this._eventBus?.publish('extend:pattern-options-changed', {
                method: methodSelect.value,
                count,
                swapDirection,
                start,
                step
            });
        };
        fields.addEventListener('input', publishPreviewUpdate);
        countInput.addEventListener('input', publishPreviewUpdate);
        swapStartButton.addEventListener('click', () => {
            const start = readValues('start');
            const step = readValues('step');
            for (const group of ['position', 'rotation'] as const) {
                for (const axis of ['x', 'y', 'z'] as const) {
                    start[group][axis] += step[group][axis];
                    const currentStep = step[group][axis];
                    step[group][axis] = -currentStep;
                }
            }
            writeValues('start', start);
            writeValues('step', step);
            swapDirection = !swapDirection;
            swapStartButton.setAttribute('aria-pressed', String(swapDirection));
            publishPreviewUpdate();
        });
        methodSelect.addEventListener('change', publishPreviewUpdate);

        const actions = document.createElement('div');
        actions.className = 'create-panel-actions';
        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'create-panel-save';
        save.textContent = 'Save';
        save.addEventListener('click', () => {
            const count = Number(countInput.value);
            if (!Number.isInteger(count) || count < 1) {
                countInput.value = '1';
                countInput.focus();
                return;
            }
            const start = readValues('start');
            const step = readValues('step');
            const numbers = [...Object.values(start.position), ...Object.values(start.rotation), ...Object.values(step.position), ...Object.values(step.rotation)];
            if (numbers.some(value => !Number.isFinite(value))) return;
            this._eventBus?.publish('extend:pattern-save-requested', {
                method: methodSelect.value,
                count,
                swapDirection,
                start,
                step
            });
        });
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'create-panel-cancel';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => this._eventBus?.publish('extend:pattern-cancel-requested'));
        actions.append(save, cancel);
        content.append(methodLabel, countLabel, fields, swapStartButton, actions);
        return content;
    }

    _createFillPatternPanelContent(): HTMLElement {
        const content = document.createElement('div');
        content.className = 'create-panel-content extend-pattern-panel-content';

        const methodLabel = document.createElement('label');
        methodLabel.className = 'extend-pattern-method-field fill-pattern-method-field';
        const methodCaption = document.createElement('span');
        methodCaption.textContent = 'Method';
        const methodSelect = document.createElement('select');
        methodSelect.className = 'extend-pattern-method-select fill-pattern-method-select';
        methodSelect.setAttribute('aria-label', 'Method');
        const linearOption = document.createElement('option');
        linearOption.value = 'linear';
        linearOption.textContent = 'Linear';
        methodSelect.appendChild(linearOption);
        methodLabel.append(methodCaption, methodSelect);

        const countLabel = document.createElement('label');
        countLabel.className = 'extend-pattern-count-field';
        const countCaption = document.createElement('span');
        countCaption.textContent = 'Count';
        const countInput = document.createElement('input');
        countInput.type = 'number';
        countInput.min = '1';
        countInput.step = '1';
        countInput.value = '1';
        countInput.className = 'extend-pattern-count-input fill-pattern-count-input';
        countInput.setAttribute('aria-label', 'Count');
        countLabel.append(countCaption, countInput);

        const fields = document.createElement('div');
        fields.className = 'extend-pattern-field-grid';
        const blankHeader = document.createElement('span');
        blankHeader.className = 'extend-pattern-grid-header';
        const startHeader = document.createElement('span');
        startHeader.className = 'extend-pattern-grid-header';
        startHeader.textContent = 'Start';
        const offsetHeader = document.createElement('span');
        offsetHeader.className = 'extend-pattern-grid-header';
        offsetHeader.textContent = 'Offset';
        fields.append(blankHeader, startHeader, offsetHeader);

        const fieldRows = [
            { label: 'Position X', group: 'position', axis: 'x' },
            { label: 'Position Y', group: 'position', axis: 'y' },
            { label: 'Position Z', group: 'position', axis: 'z' },
            { label: 'Rotation X', group: 'rotation', axis: 'x' },
            { label: 'Rotation Y', group: 'rotation', axis: 'y' },
            { label: 'Rotation Z', group: 'rotation', axis: 'z' }
        ] as const;
        for (const row of fieldRows) {
            const rowLabel = document.createElement('span');
            rowLabel.className = 'extend-pattern-field-label';
            rowLabel.textContent = row.label;
            fields.appendChild(rowLabel);
            for (const role of ['start', 'step'] as const) {
                const input = document.createElement('input');
                input.type = 'number';
                input.step = 'any';
                input.className = 'extend-pattern-value-input';
                input.dataset.role = role;
                input.dataset.group = row.group;
                input.dataset.axis = row.axis;
                input.setAttribute('aria-label', `${role === 'step' ? 'Offset' : 'Start'} ${row.label.toLowerCase()}`);
                input.readOnly = true;
                input.value = '0';
                fields.appendChild(input);
            }
        }

        const updateFields = () => {
            const count = Number(countInput.value);
            const divisor = Number.isInteger(count) && count > 0 ? count + 1 : 0;
            for (const group of ['position', 'rotation'] as const) {
                for (const axis of ['x', 'y', 'z'] as const) {
                    const startInput = fields.querySelector<HTMLInputElement>(`[data-role="start"][data-group="${group}"][data-axis="${axis}"]`)!;
                    const stepInput = fields.querySelector<HTMLInputElement>(`[data-role="step"][data-group="${group}"][data-axis="${axis}"]`)!;
                    startInput.value = String(this._fillPatternStart[group][axis]);
                    stepInput.value = divisor ? String((this._fillPatternEnd[group][axis] - this._fillPatternStart[group][axis]) / divisor) : '';
                }
            }
        };
        const publishPreviewUpdate = () => {
            const count = Number(countInput.value);
            if (!Number.isInteger(count) || count < 1) return;
            updateFields();
            this._eventBus?.publish('fill:pattern-options-changed', { count });
        };
        countInput.addEventListener('input', publishPreviewUpdate);

        const actions = document.createElement('div');
        actions.className = 'create-panel-actions';
        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'create-panel-save';
        save.textContent = 'Save';
        save.addEventListener('click', () => {
            const count = Number(countInput.value);
            if (!Number.isInteger(count) || count < 1) {
                countInput.value = '1';
                updateFields();
                countInput.focus();
                return;
            }
            this._eventBus?.publish('fill:pattern-save-requested', { count });
        });
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'create-panel-cancel';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => this._eventBus?.publish('fill:pattern-cancel-requested'));
        actions.append(save, cancel);
        content.append(methodLabel, countLabel, fields, actions);
        return content;
    }

    _syncFillPatternInputs(values: { start: ExtendPatternValues; end: ExtendPatternValues }): void {
        const fields = this._treeContainer?.querySelector('.extend-pattern-field-grid');
        const countInput = this._treeContainer?.querySelector<HTMLInputElement>('.fill-pattern-count-input');
        if (!fields || !countInput) return;
        const count = Number(countInput.value);
        const divisor = Number.isInteger(count) && count > 0 ? count + 1 : 0;
        this._fillPatternStart = values.start;
        this._fillPatternEnd = values.end;
        for (const group of ['position', 'rotation'] as const) {
            for (const axis of ['x', 'y', 'z'] as const) {
                const startInput = fields.querySelector<HTMLInputElement>(`[data-role="start"][data-group="${group}"][data-axis="${axis}"]`);
                const stepInput = fields.querySelector<HTMLInputElement>(`[data-role="step"][data-group="${group}"][data-axis="${axis}"]`);
                if (startInput) startInput.value = String(values.start[group][axis]);
                if (stepInput) stepInput.value = divisor ? String((values.end[group][axis] - values.start[group][axis]) / divisor) : '';
            }
        }
    }

    _syncExtendPatternInputs(values: { start: ExtendPatternValues; step: ExtendPatternValues }): void {
        const fields = this._treeContainer?.querySelector('.extend-pattern-field-grid');
        if (!fields) return;
        for (const role of ['start', 'step'] as const) {
            for (const group of ['position', 'rotation'] as const) {
                for (const axis of ['x', 'y', 'z'] as const) {
                    const input = fields.querySelector<HTMLInputElement>(`[data-role="${role}"][data-group="${group}"][data-axis="${axis}"]`);
                    if (input) input.value = String(values[role][group][axis]);
                }
            }
        }
    }

    _syncMovePositionInputs(): void {
        if (!this._moveSelectedPosition) return;
        this._treeContainer?.querySelectorAll<HTMLInputElement>('.move-position-input').forEach(input => {
            const axis = input.dataset.axis as 'x' | 'y' | 'z' | undefined;
            if (axis) input.value = String(this._moveSelectedPosition![axis]);
        });
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
