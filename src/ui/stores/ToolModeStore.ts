/**
 * ToolModeStore
 * Tracks the active tool mode (pan, rectangular select, or lasso select).
 * Default mode is 'pan'.
 * Notifies listeners on mode change.
 */
export class ToolModeStore {
    private _mode: 'pan' | 'select' | 'lasso' = 'pan';
    private _listeners: Array<(mode: 'pan' | 'select' | 'lasso') => void> = [];

    constructor() {
        this._mode = 'pan';
        this._listeners = [];
    }

    /**
     * Get the current tool mode.
    * @returns {'pan'|'select'|'lasso'}
     */
    getMode(): 'pan' | 'select' | 'lasso' {
        return this._mode;
    }

    /**
     * Set the tool mode.
     * @param {'pan'|'select'|'lasso'} mode
     */
    setMode(mode: 'pan' | 'select' | 'lasso'): void {
        if (mode !== 'pan' && mode !== 'select' && mode !== 'lasso') {
            throw new Error(`Invalid tool mode: "${mode}". Must be 'pan', 'select', or 'lasso'.`);
        }
        if (this._mode !== mode) {
            this._mode = mode;
            this._notify();
        }
    }

    /**
     * Subscribe to mode changes.
     * @param {Function} listener - Called with the new mode string.
     * @returns {Function} Unsubscribe function.
     */
    subscribe(listener: (mode: 'pan' | 'select' | 'lasso') => void): () => void {
        this._listeners.push(listener);
        return () => {
            this._listeners = this._listeners.filter(l => l !== listener);
        };
    }

    /** @private */
    _notify(): void {
        for (const listener of this._listeners) {
            listener(this._mode);
        }
    }
}
