import { VALIDATION } from '../../config/constants.js';

/**
 * DecorationInfoDialog Component
 * Modal dialog that displays information about one decoration and allows changing its layer.
 */

let _instanceCount = 0;

interface DecorationInfo {
    name: string;
    id: string;
    uid: string;
    position?: { x: number; y: number; z?: number };
    rotation?: number;
    rotX?: number;
    rotZ?: number;
    scale?: number;
}

interface DecorationLayerOption {
    id: string;
    name: string;
}

type DecorationNumericField = 'positionX' | 'positionY' | 'positionZ' | 'rotX' | 'rotation' | 'rotZ' | 'scale';

interface DecorationEditValues {
    position: { x: number; y: number; z: number };
    rotation: number;
    rotX: number;
    rotZ: number;
    scale: number;
}

export type DecorationLayerSelection =
    | { kind: 'existing'; layerId: string }
    | { kind: 'new' };

export interface DecorationInfoResult {
    layerSelection: DecorationLayerSelection;
    updates: DecorationEditValues;
}

const NEW_LAYER_OPTION_VALUE = '__create_new_layer__';

export class DecorationInfoDialog {
    private _id: string;
    private _resolve: ((result: DecorationInfoResult | null) => void) | null;
    private _dialogEl: HTMLDialogElement;
    private _iconEl!: HTMLImageElement;
    private _titleEl!: HTMLHeadingElement;
    private _bodyEl!: HTMLDivElement;
    private _layerSelect!: HTMLSelectElement;
    private _saveBtn!: HTMLButtonElement;
    private _cancelBtn!: HTMLButtonElement;
    private _decorationId: string | null = null;
    private _numericInputs = new Map<DecorationNumericField, HTMLInputElement>();

    constructor() {
        _instanceCount++;
        this._id = `decoration-info-dialog-${_instanceCount}`;
        this._resolve = null;
        this._dialogEl = this._createDialogElement();
        document.body.appendChild(this._dialogEl);
    }

    show({ decoration, layers = [], selectedLayerId = '', iconUrl }: {
        decoration: DecorationInfo;
        layers?: DecorationLayerOption[];
        selectedLayerId?: string;
        iconUrl?: string;
    }): Promise<DecorationInfoResult | null> {
        this._populate(decoration, layers, selectedLayerId, iconUrl);

        if (typeof this._dialogEl.showModal === 'function') {
            this._dialogEl.showModal();
        } else {
            this._dialogEl.setAttribute('open', '');
        }

        this._saveBtn.focus();

        return new Promise((resolve) => {
            this._resolve = resolve;
        });
    }

    /** @private */
    _populate(decoration: DecorationInfo, layers: DecorationLayerOption[], selectedLayerId: string, iconUrl?: string): void {
        this._decorationId = decoration.id;
        this._iconEl.hidden = !iconUrl;
        this._iconEl.removeAttribute('src');
        if (iconUrl) {
            this._iconEl.src = iconUrl;
            this._iconEl.alt = decoration.name || decoration.id;
        } else {
            this._iconEl.alt = '';
        }
        this._titleEl.textContent = decoration.name || decoration.id;

        while (this._bodyEl.firstChild) {
            this._bodyEl.removeChild(this._bodyEl.firstChild);
        }

        this._layerSelect.replaceChildren();
        for (const layer of layers) {
            const option = document.createElement('option');
            option.value = layer.id;
            option.textContent = layer.name || `Layer ${layer.id}`;
            this._layerSelect.appendChild(option);
        }
        if (selectedLayerId && !layers.some(layer => layer.id === selectedLayerId)) {
            const option = document.createElement('option');
            option.value = selectedLayerId;
            option.textContent = `Layer ${selectedLayerId}`;
            this._layerSelect.appendChild(option);
        }
        const newLayerOption = document.createElement('option');
        newLayerOption.value = NEW_LAYER_OPTION_VALUE;
        newLayerOption.textContent = 'New Layer';
        this._layerSelect.appendChild(newLayerOption);
        this._layerSelect.value = selectedLayerId || layers[0]?.id || NEW_LAYER_OPTION_VALUE;

        const layerRow = document.createElement('div');
        layerRow.className = 'decoration-info-dialog__row';
        const layerLabel = document.createElement('label');
        layerLabel.className = 'decoration-info-dialog__label';
        layerLabel.htmlFor = `${this._id}-layer`;
        layerLabel.textContent = 'Layer';
        this._layerSelect.id = `${this._id}-layer`;
        layerRow.appendChild(layerLabel);
        layerRow.appendChild(this._layerSelect);
        this._bodyEl.appendChild(layerRow);

        this._numericInputs.clear();
        const rows: Array<{ label: string; value: string }> = [
            { label: 'Decoration ID', value: decoration.id }
        ];

        for (const row of rows) {
            const rowEl = document.createElement('div');
            rowEl.className = 'decoration-info-dialog__row';

            const labelEl = document.createElement('span');
            labelEl.className = 'decoration-info-dialog__label';
            labelEl.textContent = row.label;

            const valueEl = document.createElement('span');
            valueEl.className = 'decoration-info-dialog__value';
            valueEl.textContent = row.value;

            rowEl.appendChild(labelEl);
            rowEl.appendChild(valueEl);
            this._bodyEl.appendChild(rowEl);
        }

        this._appendNumberRow('Position X', 'positionX', decoration.position?.x ?? 0, VALIDATION.POSITION_MIN, VALIDATION.POSITION_MAX);
        this._appendNumberRow('Position Y', 'positionY', decoration.position?.y ?? 0, VALIDATION.POSITION_MIN, VALIDATION.POSITION_MAX);
        this._appendNumberRow('Position Z', 'positionZ', decoration.position?.z ?? 0, VALIDATION.POSITION_MIN, VALIDATION.POSITION_MAX);
        this._appendNumberRow('Rotation X (rad)', 'rotX', decoration.rotX ?? 0, 0, 6.283185);
        this._appendNumberRow('Rotation Y (rad)', 'rotation', decoration.rotation ?? 0, 0, 6.283185);
        this._appendNumberRow('Rotation Z (rad)', 'rotZ', decoration.rotZ ?? 0, 0, 6.283185);
        this._appendNumberRow('Scale', 'scale', decoration.scale ?? 1, 0.214286, 2.964286);
    }

    private _appendNumberRow(label: string, field: DecorationNumericField, value: number, min: number, max: number): void {
        const row = document.createElement('div');
        row.className = 'decoration-info-dialog__row';

        const labelEl = document.createElement('label');
        labelEl.className = 'decoration-info-dialog__label';
        labelEl.htmlFor = `${this._id}-${field}`;
        labelEl.textContent = label;

        const input = document.createElement('input');
        input.className = 'decoration-info-dialog__input';
        input.type = 'number';
        input.name = field;
        input.id = `${this._id}-${field}`;
        input.value = String(value);
        input.min = String(min);
        input.max = String(max);
        input.step = '0.000001';
        input.required = true;
        this._numericInputs.set(field, input);

        row.appendChild(labelEl);
        row.appendChild(input);
        this._bodyEl.appendChild(row);
    }

    updateIcon(decorationId: number, iconUrl: string): void {
        if (this._decorationId !== String(decorationId)) return;
        this._iconEl.src = iconUrl;
        this._iconEl.alt = this._titleEl.textContent ?? '';
        this._iconEl.hidden = false;
    }

    /** @private */
    _createDialogElement(): HTMLDialogElement {
        const dialog = document.createElement('dialog');
        dialog.classList.add('decoration-info-dialog');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', `${this._id}-title`);

        this._iconEl = document.createElement('img');
        this._iconEl.className = 'decoration-info-dialog__icon';
        this._iconEl.hidden = true;

        this._titleEl = document.createElement('h2');
        this._titleEl.className = 'decoration-info-dialog__title';
        this._titleEl.id = `${this._id}-title`;

        this._bodyEl = document.createElement('div');
        this._bodyEl.className = 'decoration-info-dialog__body';

        this._layerSelect = document.createElement('select');
        this._layerSelect.className = 'decoration-info-dialog__layer-select';
        this._layerSelect.required = true;

        const actions = document.createElement('div');
        actions.className = 'decoration-info-dialog__actions';

        this._saveBtn = document.createElement('button');
        this._saveBtn.type = 'button';
        this._saveBtn.className = 'decoration-info-dialog__save';
        this._saveBtn.textContent = 'Save';
        this._saveBtn.addEventListener('click', () => this._save());

        this._cancelBtn = document.createElement('button');
        this._cancelBtn.type = 'button';
        this._cancelBtn.className = 'decoration-info-dialog__cancel';
        this._cancelBtn.textContent = 'Cancel';
        this._cancelBtn.addEventListener('click', () => this._close());

        actions.appendChild(this._saveBtn);
        actions.appendChild(this._cancelBtn);

        dialog.appendChild(this._iconEl);
        dialog.appendChild(this._titleEl);
        dialog.appendChild(this._bodyEl);
        dialog.appendChild(actions);

        dialog.addEventListener('cancel', (event) => {
            event.preventDefault();
            this._close();
        });

        return dialog;
    }

    /** @private */
    private _save(): void {
        const invalidInput = [this._layerSelect, ...this._numericInputs.values()].find(input => !input.checkValidity());
        if (invalidInput) {
            invalidInput.reportValidity();
            return;
        }

        const value = (field: DecorationNumericField): number => Number(this._numericInputs.get(field)!.value);
        const layerSelection: DecorationLayerSelection = this._layerSelect.value === NEW_LAYER_OPTION_VALUE
            ? { kind: 'new' }
            : { kind: 'existing', layerId: this._layerSelect.value };
        this._close({
            layerSelection,
            updates: {
                position: { x: value('positionX'), y: value('positionY'), z: value('positionZ') },
                rotX: value('rotX'),
                rotation: value('rotation'),
                rotZ: value('rotZ'),
                scale: value('scale')
            }
        });
    }

    _close(result: DecorationInfoResult | null = null): void {
        if (typeof this._dialogEl.close === 'function') {
            this._dialogEl.close();
        } else {
            this._dialogEl.removeAttribute('open');
        }
        if (this._resolve) {
            this._resolve(result);
            this._resolve = null;
        }
    }
}
