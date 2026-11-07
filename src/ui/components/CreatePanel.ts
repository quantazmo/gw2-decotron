import type { AppStore } from '../stores/AppStore.js';
import type { SelectionStore } from '../stores/SelectionStore.js';
import type { EventBus } from '../EventBus.js';

export type ExtendPatternValues = {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
};

export type CreatePanelMode = 'move' | 'extend' | 'fill';

export class CreatePanel {
    private eventBus: EventBus | null;
    private appStore: AppStore | null;
    private selectionStore: SelectionStore | null;
    private rootElement: HTMLElement | null = null;
    private _extendPatternActive = false;
    private _fillPatternActive = false;
    private moveSelectedPosition: { x: number; y: number; z: number } | null = null;
    private moveAsCopy = false;
    private moveCopyTargetLayerId: string | null = null;
    private fillPatternStart: ExtendPatternValues = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
    private fillPatternEnd: ExtendPatternValues = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };

    constructor(eventBus: EventBus | null, appStore: AppStore | null, selectionStore: SelectionStore | null) {
        this.eventBus = eventBus;
        this.appStore = appStore;
        this.selectionStore = selectionStore;
    }

    setRootElement(element: HTMLElement): void {
        this.rootElement = element;
    }

    startMove(targetLayerId: string): void {
        this.moveSelectedPosition = null;
        this.moveAsCopy = false;
        this.moveCopyTargetLayerId = targetLayerId;
    }

    setMode(mode: CreatePanelMode): void {
        this._extendPatternActive = mode === 'extend';
        this._fillPatternActive = mode === 'fill';
    }

    render(mode: CreatePanelMode): HTMLElement {
        this.setMode(mode);
        return this._createPanelContent();
    }

    setMovePosition(position: { x: number; y: number; z: number }): void {
        this.moveSelectedPosition = { ...position };
        this._syncMovePositionInputs();
    }

    setExtendValues(values: { start: ExtendPatternValues; step: ExtendPatternValues }): void {
        this._syncExtendPatternInputs(values);
    }

    setFillValues(values: { start: ExtendPatternValues; end: ExtendPatternValues }): void {
        this._syncFillPatternInputs(values);
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
            input.value = this.moveSelectedPosition ? String(this.moveSelectedPosition[axis]) : '';
            input.addEventListener('input', () => {
                const values = Array.from(fields.querySelectorAll<HTMLInputElement>('.move-position-input'));
                if (values.length !== 3 || values.some(field => !Number.isFinite(field.valueAsNumber))) return;
                const position = {
                    x: fields.querySelector<HTMLInputElement>('[data-axis="x"]')!.valueAsNumber,
                    y: fields.querySelector<HTMLInputElement>('[data-axis="y"]')!.valueAsNumber,
                    z: fields.querySelector<HTMLInputElement>('[data-axis="z"]')!.valueAsNumber
                };
                this.eventBus?.publish('move:selected-position-requested', position);
            });
            label.append(caption, input);
            fields.appendChild(label);
        });
        const copyLabel = document.createElement('label');
        copyLabel.className = 'move-as-copy-control';
        const copyInput = document.createElement('input');
        copyInput.type = 'checkbox';
        copyInput.className = 'move-as-copy-input';
        copyInput.checked = this.moveAsCopy;
        copyInput.addEventListener('change', () => {
            this.moveAsCopy = copyInput.checked;
            targetControl.hidden = !copyInput.checked;
            this.eventBus?.publish('move:selected-copy-changed', copyInput.checked);
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
        const state = this.appStore?.getState();
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
        targetSelect.value = this.moveCopyTargetLayerId ?? state?.activeLayerId ?? state?.layers?.[0]?.id ?? '__new__';
        this.moveCopyTargetLayerId = targetSelect.value;
        targetSelect.addEventListener('change', () => {
            this.moveCopyTargetLayerId = targetSelect.value;
            this.eventBus?.publish('move:selected-copy-target-changed', targetSelect.value);
        });
        targetControl.append(targetCaption, targetSelect);
        const actions = document.createElement('div');
        actions.className = 'create-panel-actions';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'create-panel-cancel';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => this.eventBus?.publish('move:selected-cancel-requested'));
        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'create-panel-save';
        save.textContent = 'Save';
        save.addEventListener('click', () => this.eventBus?.publish('move:selected-save-requested'));
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
        swapStartButton.hidden = (this.selectionStore?.getSelectedIds().length ?? 0) < 2;
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
            this.eventBus?.publish('extend:pattern-options-changed', {
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
            this.eventBus?.publish('extend:pattern-save-requested', {
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
        cancel.addEventListener('click', () => this.eventBus?.publish('extend:pattern-cancel-requested'));
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
                    startInput.value = String(this.fillPatternStart[group][axis]);
                    stepInput.value = divisor ? String((this.fillPatternEnd[group][axis] - this.fillPatternStart[group][axis]) / divisor) : '';
                }
            }
        };
        const publishPreviewUpdate = () => {
            const count = Number(countInput.value);
            if (!Number.isInteger(count) || count < 1) return;
            updateFields();
            this.eventBus?.publish('fill:pattern-options-changed', { count });
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
            this.eventBus?.publish('fill:pattern-save-requested', { count });
        });
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'create-panel-cancel';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => this.eventBus?.publish('fill:pattern-cancel-requested'));
        actions.append(save, cancel);
        content.append(methodLabel, countLabel, fields, actions);
        return content;
    }

    _syncFillPatternInputs(values: { start: ExtendPatternValues; end: ExtendPatternValues }): void {
        const fields = this.rootElement?.querySelector('.extend-pattern-field-grid');
        const countInput = this.rootElement?.querySelector<HTMLInputElement>('.fill-pattern-count-input');
        if (!fields || !countInput) return;
        const count = Number(countInput.value);
        const divisor = Number.isInteger(count) && count > 0 ? count + 1 : 0;
        this.fillPatternStart = values.start;
        this.fillPatternEnd = values.end;
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
        const fields = this.rootElement?.querySelector('.extend-pattern-field-grid');
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
        if (!this.moveSelectedPosition) return;
        this.rootElement?.querySelectorAll<HTMLInputElement>('.move-position-input').forEach(input => {
            const axis = input.dataset.axis as 'x' | 'y' | 'z' | undefined;
            if (axis) input.value = String(this.moveSelectedPosition![axis]);
        });
    }
}
