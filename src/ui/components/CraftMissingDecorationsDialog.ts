/**
 * CraftMissingDecorationsDialog Component
 * Modal dialog that reports the current map name and the decoration count
 * for all currently visible layers.
 * Uses native <dialog> element with a Promise-based API.
 * Craft opens the selected decorations in GW2Efficiency; Cancel dismisses the dialog.
 */
import type { AccountDecorationInventory } from '../../domain/AccountDecorationInventory.js';

interface ReportLayer {
    name: string;
    isVisible?: boolean;
    getAllDecorations?: () => Array<{ id: string | number; name: string }>;
}

let _instanceCount = 0;

export class CraftMissingDecorationsDialog {
    private _resolve: (() => void) | null;
    private _dialogEl: HTMLDialogElement;
    private _id: string;
    private _titleEl!: HTMLHeadingElement;
    private _mapNameEl!: HTMLSpanElement;
    private _listEl!: HTMLDivElement;
    private _emptyMsgEl!: HTMLParagraphElement;
    private _craftBtn!: HTMLButtonElement;
    private _cancelBtn!: HTMLButtonElement;

    constructor() {
        _instanceCount++;
        this._id = `craft-missing-decorations-dialog-${_instanceCount}`;
        this._resolve = null;
        this._dialogEl = this._createDialogElement();
        document.body.appendChild(this._dialogEl);
    }

    /**
     * Show the report dialog.
     *
     * @param {string} mapName   - Display name of the current map
     * @param {Array}  layers    - All layer instances; only visible ones are reported
     * @param {object} [inventory] - Optional AccountDecorationInventory for missing-decoration detection
    * @returns {Promise<void>}  Resolves when the user clicks Craft or Cancel
     */
    show(mapName: string, layers: ReportLayer[], inventory: AccountDecorationInventory | null = null): Promise<void> {
        const visibleLayers = layers.filter(l => l.isVisible !== false);

        // Render map name
        this._mapNameEl.textContent = mapName || '—';

        // Render layer rows
        this._renderLayerList(visibleLayers);

        // Toggle empty-state message
        this._emptyMsgEl.hidden = visibleLayers.length > 0;

        // Render missing decorations section (only when an inventory is provided)
        this._renderMissingSection(visibleLayers, inventory);

        if (typeof this._dialogEl.showModal === 'function') {
            this._dialogEl.showModal();
        } else {
            this._dialogEl.setAttribute('open', '');
        }

        this._cancelBtn.focus();

        return new Promise((resolve) => {
            this._resolve = resolve;
        });
    }

    // ── private ──────────────────────────────────────────────────────────────

    /** @private */
    _createDialogElement(): HTMLDialogElement {
        const dialog = document.createElement('dialog');
        dialog.classList.add('craft-missing-decorations-dialog');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');

        const titleId = `${this._id}-title`;
        dialog.setAttribute('aria-labelledby', titleId);

        // Title
        this._titleEl = document.createElement('h2');
        this._titleEl.classList.add('craft-missing-decorations-dialog__title');
        this._titleEl.id = titleId;
        this._titleEl.textContent = 'Craft Missing Decorations';

        // Map info row
        const mapRow = document.createElement('p');
        mapRow.classList.add('craft-missing-decorations-dialog__map-row');

        const mapLabel = document.createElement('span');
        mapLabel.classList.add('craft-missing-decorations-dialog__map-label');
        mapLabel.textContent = 'Map: ';

        this._mapNameEl = document.createElement('span');
        this._mapNameEl.classList.add('craft-missing-decorations-dialog__map-name');

        mapRow.appendChild(mapLabel);
        mapRow.appendChild(this._mapNameEl);

        // Layer list
        this._listEl = document.createElement('div');
        this._listEl.classList.add('craft-missing-decorations-dialog__layer-list');

        // Empty-state message
        this._emptyMsgEl = document.createElement('p');
        this._emptyMsgEl.classList.add('craft-missing-decorations-dialog__empty-msg');
        this._emptyMsgEl.textContent = 'No visible layers.';
        this._emptyMsgEl.hidden = true;

        // Actions
        const actions = document.createElement('div');
        actions.classList.add('craft-missing-decorations-dialog__actions');

        this._craftBtn = document.createElement('button');
        this._craftBtn.type = 'button';
        this._craftBtn.classList.add('craft-missing-decorations-dialog__craft');
        this._craftBtn.textContent = 'Craft';
        this._craftBtn.disabled = true;
        this._craftBtn.addEventListener('click', () => this._openCraftingCalculator());

        this._cancelBtn = document.createElement('button');
        this._cancelBtn.type = 'button';
        this._cancelBtn.classList.add('craft-missing-decorations-dialog__cancel');
        this._cancelBtn.textContent = 'Cancel';
        this._cancelBtn.addEventListener('click', () => this._close());

        actions.appendChild(this._craftBtn);
        actions.appendChild(this._cancelBtn);

        dialog.appendChild(this._titleEl);
        dialog.appendChild(mapRow);
        dialog.appendChild(this._listEl);
        dialog.appendChild(this._emptyMsgEl);
        dialog.appendChild(actions);

        return dialog;
    }

    /**
     * Render one row per visible layer.
     * @param {Array} visibleLayers
     * @private
     */
    _renderLayerList(visibleLayers: ReportLayer[]): void {
        this._listEl.innerHTML = '';

        for (const layer of visibleLayers) {
            const row = document.createElement('div');
            row.classList.add('craft-missing-decorations-dialog__layer-row');

            const nameSpan = document.createElement('span');
            nameSpan.classList.add('craft-missing-decorations-dialog__layer-name');
            nameSpan.textContent = layer.name;

            const countSpan = document.createElement('span');
            countSpan.classList.add('craft-missing-decorations-dialog__layer-count');
            const count = layer.getAllDecorations ? layer.getAllDecorations().length : 0;
            countSpan.textContent = `${count} decoration${count === 1 ? '' : 's'}`;

            row.appendChild(nameSpan);
            row.appendChild(countSpan);
            this._listEl.appendChild(row);
        }
    }

    /**
        * Render missing decorations based on known account inventory.
     * Only considers decorations from visible layers.
     * @param {Array} visibleLayers
     * @param {object|null} inventory - AccountDecorationInventory or null
     * @private
     */
    _renderMissingSection(visibleLayers: ReportLayer[], inventory: AccountDecorationInventory | null): void {
        this._craftBtn.disabled = true;

        // Remove any existing missing section from a previous render
        const existing = this._dialogEl.querySelector('.craft-missing-decorations-dialog__missing-section');
        if (existing) existing.remove();

        // Count instances per decoration id across all visible layers
        const grouped = new Map<number, { name: string; count: number }>();
        for (const layer of visibleLayers) {
            const decorations = layer.getAllDecorations ? layer.getAllDecorations() : [];
            for (const dec of decorations) {
                const numericId = Number(dec.id);
                if (inventory && inventory.getCount(numericId) === 0) {
                    if (!grouped.has(numericId)) {
                        grouped.set(numericId, { name: dec.name, count: 0 });
                    }
                    const entry = grouped.get(numericId);
                    if (entry) entry.count++;
                }
            }
        }

        if (grouped.size === 0) return;

        // Sort by name
        const missing = Array.from(grouped, ([id, entry]) => ({ id, ...entry }))
            .sort((a, b) => a.name.localeCompare(b.name));

        const section = document.createElement('div');
        section.classList.add('craft-missing-decorations-dialog__missing-section');

        const heading = document.createElement('h3');
        heading.classList.add('craft-missing-decorations-dialog__missing-heading');
        heading.textContent = `Missing Decorations (${missing.length})`;
        section.appendChild(heading);

        const itemCheckboxes: HTMLInputElement[] = [];
        const selectAllLabel = document.createElement('label');
        selectAllLabel.classList.add('craft-missing-decorations-dialog__select-all');

        const selectAllCheckbox = document.createElement('input');
        selectAllCheckbox.type = 'checkbox';
        selectAllCheckbox.checked = true;
        selectAllCheckbox.setAttribute('aria-label', 'Select all missing decorations');

        const selectAllText = document.createElement('span');
        selectAllText.textContent = 'Select all / none';

        selectAllLabel.appendChild(selectAllCheckbox);
        selectAllLabel.appendChild(selectAllText);
        section.appendChild(selectAllLabel);

        const list = document.createElement('div');
        list.classList.add('craft-missing-decorations-dialog__missing-list');

        const updateSelectAllState = (): void => {
            const selectedCount = itemCheckboxes.filter(checkbox => checkbox.checked).length;
            selectAllCheckbox.checked = selectedCount === itemCheckboxes.length;
            selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < itemCheckboxes.length;
            this._craftBtn.disabled = selectedCount === 0;
        };

        selectAllCheckbox.addEventListener('change', () => {
            for (const checkbox of itemCheckboxes) {
                checkbox.checked = selectAllCheckbox.checked;
            }
            updateSelectAllState();
        });

        for (const { id, name, count } of missing) {
            const item = document.createElement('label');
            item.classList.add('craft-missing-decorations-dialog__missing-item');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.classList.add('craft-missing-decorations-dialog__missing-checkbox');
            checkbox.checked = true;
            checkbox.dataset.decorationId = String(id);
            checkbox.dataset.quantity = String(count);
            checkbox.addEventListener('change', updateSelectAllState);
            itemCheckboxes.push(checkbox);

            const nameSpan = document.createElement('span');
            nameSpan.classList.add('craft-missing-decorations-dialog__missing-name');
            nameSpan.textContent = name;

            const countSpan = document.createElement('span');
            countSpan.classList.add('craft-missing-decorations-dialog__missing-count');
            countSpan.textContent = `×${count}`;

            item.appendChild(checkbox);
            item.appendChild(nameSpan);
            item.appendChild(countSpan);
            list.appendChild(item);
        }

        updateSelectAllState();
        section.appendChild(list);

        // Insert before the actions footer
        this._cancelBtn.parentElement?.insertAdjacentElement('beforebegin', section);
    }

    private _openCraftingCalculator(): void {
        const selected = this._dialogEl.querySelectorAll<HTMLInputElement>(
            '.craft-missing-decorations-dialog__missing-checkbox:checked'
        );
        const ingredients = Array.from(selected, checkbox => {
            const decorationId = Number(checkbox.dataset.decorationId);
            const quantity = Number(checkbox.dataset.quantity);
            const itemId = 2_001_000_000_000 + decorationId;
            return `${quantity}-${itemId}`;
        });

        if (ingredients.length === 0) return;

        const url = `https://gw2efficiency.com/crafting/calculator/a~0!b~1!c~0!d~${ingredients.join(';')}!e~0!f~1`;
        window.open(url, '_blank', 'noopener,noreferrer');
        this._close();
    }

    /**
     * Close the dialog and resolve the pending Promise.
     * @private
     */
    _close(): void {
        if (typeof this._dialogEl.close === 'function') {
            this._dialogEl.close();
        } else {
            this._dialogEl.removeAttribute('open');
        }
        if (this._resolve) {
            this._resolve();
            this._resolve = null;
        }
    }
}
