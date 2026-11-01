import { LoadFromUrlDialog } from './LoadFromUrlDialog.js';
import { CraftMissingDecorationsDialog } from './CraftMissingDecorationsDialog.js';
import { MapType } from '../../domain/MapType.js';
import { AppService } from '../../application/AppService.ts';
import { AppStore } from '../stores/AppStore.ts';
import { ZoomStore } from '../stores/ZoomStore.ts';
import { EventBus } from '../EventBus.ts';
import { UndoRedoManager } from '../../application/UndoRedoManager.ts';
import { ToolModeStore } from '../stores/ToolModeStore.ts';

type RibbonWindow = Window & {
    openFileDialog?: () => void;
    completeLayoutLoadingWorkflow?: (xmlContent: string, fileName: string) => Promise<void>;
};
/**
 * RibbonToolbar
 * Fixed top-of-viewport ribbon toolbar organised into command groups:
 *   File   — Load, Export
 *   View   — Zoom In, Zoom Out, Fit
 *   Edit   — Undo, Redo
 *
 * Buttons dispatch via AppService.execute or call ZoomStore directly.
 * Undo/Redo buttons reflect UndoRedoManager state.
 * Export button reflects context-sensitive disabled state.
 * Tools group allows switching between Map Pan and Multi Select tool modes.
 */

export class RibbonToolbar {
    private _appService: AppService;
    private _appStore: AppStore | null;
    private _zoomStore: ZoomStore;
    private _eventBus: EventBus | null;
    private _undoRedoManager: UndoRedoManager | null;
    private _toolModeStore: ToolModeStore | null;
    private _element: HTMLElement | null;
    private _exportBtn: HTMLButtonElement | null;
    private _undoBtn: HTMLButtonElement | null;
    private _redoBtn: HTMLButtonElement | null;
    private _panBtn: HTMLButtonElement | null;
    private _selectBtn: HTMLButtonElement | null;
    private _reportBtn: HTMLButtonElement | null;
    private _loadFromUrlDialog: LoadFromUrlDialog | null;
    private _craftMissingDecorationsDialog: CraftMissingDecorationsDialog | null;
    private _unsubscribers: Array<() => void>;

    /**
     * @param {object}  appService       AppService for executing commands
     * @param {object}  appStore         AppStore (reads layout state for Export disabled)
     * @param {object}  zoomStore        ZoomStore for zoom actions
     * @param {object}  [eventBus]       EventBus used to subscribe to appstate:changed
     * @param {object}  [undoRedoManager] UndoRedoManager for undo/redo actions
     * @param {object}  [toolModeStore]  ToolModeStore for tool mode switching
     */
    constructor(appService: AppService, appStore: AppStore | null, zoomStore: ZoomStore, eventBus: EventBus | null = null, undoRedoManager: UndoRedoManager | null = null, toolModeStore: ToolModeStore | null = null) {
        this._appService = appService;
        this._appStore = appStore;
        this._zoomStore = zoomStore;
        this._eventBus = eventBus;
        this._undoRedoManager = undoRedoManager;
        this._toolModeStore = toolModeStore;

        this._element = null;
        this._exportBtn = null;
        this._undoBtn = null;
        this._redoBtn = null;
        this._panBtn = null;
        this._selectBtn = null;
        this._reportBtn = null;
        this._loadFromUrlDialog = null;
        this._craftMissingDecorationsDialog = null;

        /** @type {Function[]} cleanup callbacks */
        this._unsubscribers = [];
    }

    /** @returns {HTMLElement} */
    getElement(): HTMLElement {
        if (!this._element) {
            this._build();
        }
        return this._element!;
    }

    /** Detach all subscriptions. Call when removing the toolbar. */
    unmount(): void {
        this._unsubscribers.forEach(u => typeof u === 'function' && u());
        this._unsubscribers = [];
    }

    // ── build ───────────────────────────────────────────────────────────────

    _build(): void {
        const toolbar = document.createElement('div');
        toolbar.className = 'ribbon-toolbar';
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', 'Application toolbar');

        toolbar.appendChild(this._createGroup('File', [
            this._makeBtn('Load from file', 'ribbon-load', () => this._onLoad()),
            this._makeBtn('Load from URL', 'ribbon-load-url', () => this._onLoadFromUrl()),
            this._makeBtn('Export', 'ribbon-export', () => this._onExport(),
                btn => { this._exportBtn = btn; }),
            this._makeBtn('Settings', 'ribbon-settings', () => this._onSettings()),
        ]));

        toolbar.appendChild(this._createGroup('View', [
            this._makeBtn('Zoom In', 'ribbon-zoom-in', () => this._onZoomIn()),
            this._makeBtn('Zoom Out', 'ribbon-zoom-out', () => this._onZoomOut()),
            this._makeBtn('Fit', 'ribbon-fit', () => this._onFit()),
        ]));

        toolbar.appendChild(this._createGroup('Edit', [
            this._makeBtn('Undo', 'ribbon-undo', () => this._onUndo(),
                btn => { this._undoBtn = btn; }),
            this._makeBtn('Redo', 'ribbon-redo', () => this._onRedo(),
                btn => { this._redoBtn = btn; }),
        ]));

        toolbar.appendChild(this._createGroup('Tools', [
            this._makeToggleBtn('Map Pan', 'tool-pan', () => this._onToolMode('pan'),
                btn => { this._panBtn = btn; }),
            this._makeToggleBtn('Multi Select', 'tool-select', () => this._onToolMode('select'),
                btn => { this._selectBtn = btn; }),
        ]));

        toolbar.appendChild(this._createGroup('Crafting', [
            this._makeBtn('Craft Missing Decorations', 'ribbon-decoration-report', () => this._onReport(),
                btn => { this._reportBtn = btn; }),
        ]));

        toolbar.appendChild(this._createGroup('Links', [
            this._makeLink('View on GitHub', 'ribbon-github', 'https://github.com/quantazmo/gw2-deco'),
        ]));

        this._element = toolbar;

        // Set initial disabled states before subscribing
        this._updateState();

        // Keep disabled states in sync with app state
        if (this._eventBus) {
            const unsub = this._eventBus.subscribe('appstate:changed', () => this._updateState());
            this._unsubscribers.push(unsub);
        }

        // Keep undo/redo states in sync with UndoRedoManager
        if (this._undoRedoManager) {
            const unsub = this._undoRedoManager.subscribe(() => this._updateState());
            this._unsubscribers.push(unsub);
        }

        // Keep tool mode buttons in sync with ToolModeStore
        if (this._toolModeStore) {
            const unsub = this._toolModeStore.subscribe(() => this._updateState());
            this._unsubscribers.push(unsub);
        }
    }

    /**
     * Create a ribbon group element with a button row and a label below.
     * @param {string}        groupName  Display name (e.g. 'File')
     * @param {HTMLElement[]} buttons    Button elements to include
     * @returns {HTMLElement}
     */
    _createGroup(groupName: string, buttons: HTMLElement[]): HTMLElement {
        const group = document.createElement('div');
        group.className = 'ribbon-group';
        group.dataset.group = groupName.toLowerCase();

        const row = document.createElement('div');
        row.className = 'ribbon-button-row';
        buttons.forEach(btn => row.appendChild(btn));

        const label = document.createElement('span');
        label.className = 'ribbon-group-label';
        label.textContent = groupName;

        group.appendChild(row);
        group.appendChild(label);
        return group;
    }

    /**
     * Returns an inline SVG string for the given action key.
     * @param {string} action  data-action value
     * @returns {string}
     */
    _getIcon(action: string): string {
        const icons: Record<string, string> = {
            'ribbon-load': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
            'ribbon-load-url': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
            'ribbon-export': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
            'ribbon-settings': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
            'ribbon-zoom-in': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
            'ribbon-zoom-out': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
            'ribbon-fit': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
            'ribbon-undo': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`,
            'ribbon-redo': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>`,
            'tool-pan': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>`,
            'tool-select': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="1" stroke-dasharray="4 2"/></svg>`,
            'ribbon-decoration-report': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
            'ribbon-github': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`,
        };
        return icons[action] ?? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>`;
    }

    /**
     * Create a single ribbon button.
     * @param {string}    label        Button text (used as tooltip and aria-label)
     * @param {string}    action       data-action attribute value
     * @param {Function}  onClick      Click handler
     * @param {Function}  [refCb]      Optional callback that receives the button element for ref storage
     * @returns {HTMLButtonElement}
     */
    _makeBtn(label: string, action: string, onClick: () => void, refCb: ((button: HTMLButtonElement) => void) | null = null): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className = 'ribbon-btn';
        btn.type = 'button';
        btn.title = label;
        btn.setAttribute('aria-label', label);
        btn.innerHTML = this._getIcon(action);
        btn.dataset.action = action;
        btn.addEventListener('click', onClick);
        if (refCb) refCb(btn);
        return btn;
    }

    _makeLink(label: string, action: string, href: string): HTMLAnchorElement {
        const link = document.createElement('a');
        link.className = 'ribbon-btn';
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.title = label;
        link.setAttribute('aria-label', label);
        link.innerHTML = this._getIcon(action);
        link.dataset.action = action;
        return link;
    }

    /**
     * Create a toggle ribbon button (aria-pressed reflects active state).
     * @param {string}    label
     * @param {string}    action
     * @param {Function}  onClick
     * @param {Function}  [refCb]
     * @returns {HTMLButtonElement}
     */
    _makeToggleBtn(label: string, action: string, onClick: () => void, refCb: ((button: HTMLButtonElement) => void) | null = null): HTMLButtonElement {
        const btn = this._makeBtn(label, action, onClick, refCb);
        btn.setAttribute('aria-pressed', 'false');
        return btn;
    }

    // ── state ───────────────────────────────────────────────────────────────

    _updateState(): void {
        const state = this._appStore?.getState();
        const hasLayout = !!state?.layout;
        const isGuildHall = state?.mapType === MapType.GuildHall;

        if (this._exportBtn) {
            this._exportBtn.disabled = !hasLayout;
        }
        if (this._undoBtn) {
            this._undoBtn.disabled = this._undoRedoManager
                ? !this._undoRedoManager.canUndo()
                : true;
            const nextUndo = this._undoRedoManager?.peekUndo();
            if (nextUndo) {
                this._undoBtn.title = `Undo ${nextUndo.label}`;
            } else {
                this._undoBtn.title = 'Undo';
            }
        }
        if (this._redoBtn) {
            this._redoBtn.disabled = this._undoRedoManager
                ? !this._undoRedoManager.canRedo()
                : true;
            const nextRedo = this._undoRedoManager?.peekRedo();
            if (nextRedo) {
                this._redoBtn.title = `Redo ${nextRedo.label}`;
            } else {
                this._redoBtn.title = 'Redo';
            }
        }

        // Sync tool mode toggle buttons
        const currentMode = this._toolModeStore ? this._toolModeStore.getMode() : 'pan';
        if (this._panBtn) {
            this._panBtn.setAttribute('aria-pressed', currentMode === 'pan' ? 'true' : 'false');
        }
        if (this._selectBtn) {
            this._selectBtn.setAttribute('aria-pressed', currentMode === 'select' ? 'true' : 'false');
        }
        if (this._reportBtn) {
            this._reportBtn.disabled = !hasLayout || isGuildHall;
        }
    }

    // ── handlers ────────────────────────────────────────────────────────────

    _onLoad(): void {
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.click();
        } else if ((window as RibbonWindow).openFileDialog) {
            (window as RibbonWindow).openFileDialog?.();
        }
    }

    async _onLoadFromUrl(): Promise<void> {
        if (!this._loadFromUrlDialog) {
            this._loadFromUrlDialog = new LoadFromUrlDialog();
        }

        const url = await this._loadFromUrlDialog.show();
        if (typeof url !== 'string' || !url) return;

        // Basic URL validation — must start with http:// or https:// or be a relative path (samples)
        const isAbsolute = /^https?:\/\//i.test(url);
        const isRelative = url.startsWith('/');
        if (!isAbsolute && !isRelative) {
            alert('Invalid URL. Please enter a URL starting with http:// or https://');
            return;
        }

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Server returned ${response.status} ${response.statusText}`);
            }
            const xmlContent = await response.text();
            const fileName = url.split('/').pop()?.split('?')[0] || 'layout.xml';

            await this._loadXmlContent(xmlContent, fileName);
        } catch (error) {
            console.error('[RibbonToolbar] Failed to load layout from URL:', error);
            alert(`Failed to load layout from URL:\n${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Load XML content applying switch-map logic: if layers already exist and the new
     * layout targets a different map, publish confirm:mapSwitch so the shared
     * confirmation dialog can gate the operation (same flow as FileDropZone).
     * @private
     */
    async _loadXmlContent(xmlContent: string, fileName: string): Promise<void> {
        const hasExistingLayers = this._appService?.layout &&
            this._appService.layout.getLayerCount() > 0;

        if (hasExistingLayers) {
            const result = await this._appService.execute({
                type: 'LoadAdditionalLayoutCommand',
                payload: { xmlContent, fileName }
            });

            if (result && typeof result === 'object' && 'requiresConfirmation' in result && result.requiresConfirmation === true &&
                'currentMapName' in result && typeof result.currentMapName === 'string' &&
                'newMapName' in result && typeof result.newMapName === 'string') {
                this._eventBus?.publish('confirm:mapSwitch', {
                    currentMapName: result.currentMapName,
                    newMapName: result.newMapName,
                    xmlContent,
                    fileName
                });
            }
        } else if ((window as RibbonWindow).completeLayoutLoadingWorkflow) {
            await (window as RibbonWindow).completeLayoutLoadingWorkflow!(xmlContent, fileName);
        } else {
            console.warn('[RibbonToolbar] completeLayoutLoadingWorkflow not available, using fallback');
            await this._appService?.execute({
                type: 'LoadLayoutCommand',
                payload: { xmlContent, fileName }
            });
        }
    }

    _onSettings(): void {
        if (this._eventBus) {
            this._eventBus.publish('ribbon:settings-requested');
        }
    }

    _onExport(): void {
        if (!this._appStore) return;
        const layout = this._appStore.getState().layout;
        if (!layout) return;

        // Publish event so other app code can handle the actual serialisation
        if (this._eventBus) {
            this._eventBus.publish('ribbon:export-requested', { layout });
        }
    }

    _onZoomIn(): void { this._eventBus?.publish('zoom:in-requested'); }
    _onZoomOut(): void { this._eventBus?.publish('zoom:out-requested'); }
    _onFit(): void { this._eventBus?.publish('zoom:fit-requested'); }
    _onUndo(): void {
        if (this._undoRedoManager && this._undoRedoManager.canUndo()) {
            if (this._eventBus) {
                this._eventBus.publish('undo:requested');
            }
        }
    }
    _onRedo(): void {
        if (this._undoRedoManager && this._undoRedoManager.canRedo()) {
            if (this._eventBus) {
                this._eventBus.publish('redo:requested');
            }
        }
    }

    _onReport(): void {
        if (!this._appStore) return;
        const layout = this._appStore.getState().layout;
        if (!layout) return;

        if (this._eventBus) {
            this._eventBus.publish('ribbon:report-requested', { layout });
        }
    }

    _onToolMode(mode: 'pan' | 'select'): void {
        if (this._toolModeStore) {
            this._toolModeStore.setMode(mode);
        }
    }
}
