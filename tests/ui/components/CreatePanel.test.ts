import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { CreatePanel } from '../../../src/ui/components/CreatePanel.js';
import { EventBus } from '../../../src/ui/EventBus.js';
import type { AppStore } from '../../../src/ui/stores/AppStore.js';
import type { SelectionStore } from '../../../src/ui/stores/SelectionStore.js';

describe('CreatePanel', () => {
    let rootElement: HTMLDivElement;
    let eventBus: EventBus;

    beforeEach(() => {
        rootElement = document.createElement('div');
        document.body.appendChild(rootElement);
        eventBus = new EventBus();
        eventBus.debugEnabled = false;
    });

    afterEach(() => {
        document.body.removeChild(rootElement);
        eventBus.clearAll();
    });

    test('renders move controls, synchronizes position and publishes move actions', () => {
        const appStore = {
            getState: () => ({
                activeLayerId: 'layer-2',
                layers: [{ id: 'layer-1', name: 'Garden' }, { id: 'layer-2', name: 'Workshop' }]
            })
        } as unknown as AppStore;
        const panel = new CreatePanel(eventBus, appStore, null);
        panel.setRootElement(rootElement);
        panel.startMove('layer-2');
        rootElement.appendChild(panel.render('move'));

        const positionInputs = Array.from(rootElement.querySelectorAll<HTMLInputElement>('.move-position-input'));
        expect(positionInputs.map(input => input.dataset.axis)).toEqual(['x', 'y', 'z']);
        expect(Array.from(rootElement.querySelectorAll('.create-panel-actions button')).map(button => button.textContent)).toEqual(['Save', 'Cancel']);
        const copyInput = rootElement.querySelector<HTMLInputElement>('.move-as-copy-input')!;
        const targetControl = rootElement.querySelector<HTMLElement>('.move-copy-target-control')!;
        const targetSelect = rootElement.querySelector<HTMLSelectElement>('.move-copy-target-select')!;
        expect(targetSelect.value).toBe('layer-2');
        expect(Array.from(targetSelect.options).map(option => option.textContent)).toEqual(['Garden', 'Workshop', 'New Layer']);

        panel.setMovePosition({ x: 10, y: 20, z: 30 });
        expect(positionInputs.map(input => input.value)).toEqual(['10', '20', '30']);

        let requestedPosition: unknown;
        let requestedCopy: unknown;
        let requestedTarget: unknown;
        eventBus.subscribe('move:selected-position-requested', value => { requestedPosition = value; });
        eventBus.subscribe('move:selected-copy-changed', value => { requestedCopy = value; });
        eventBus.subscribe('move:selected-copy-target-changed', value => { requestedTarget = value; });
        positionInputs[0].value = '42';
        positionInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        expect(requestedPosition).toEqual({ x: 42, y: 20, z: 30 });
        copyInput.checked = true;
        copyInput.dispatchEvent(new Event('change', { bubbles: true }));
        expect(requestedCopy).toBe(true);
        expect(targetControl.hidden).toBe(false);
        targetSelect.value = 'layer-1';
        targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
        expect(requestedTarget).toBe('layer-1');

        const actions: string[] = [];
        eventBus.subscribe('move:selected-save-requested', () => actions.push('save'));
        eventBus.subscribe('move:selected-cancel-requested', () => actions.push('cancel'));
        rootElement.querySelector<HTMLButtonElement>('.create-panel-save')!.click();
        rootElement.querySelector<HTMLButtonElement>('.create-panel-cancel')!.click();
        expect(actions).toEqual(['save', 'cancel']);
    });

    test('renders editable Extend offsets and publishes preview, swap, save, and cancel requests', () => {
        const selectionStore = { getSelectedIds: () => ['seed-a', 'seed-b'] } as unknown as SelectionStore;
        const panel = new CreatePanel(eventBus, null, selectionStore);
        panel.setRootElement(rootElement);
        rootElement.appendChild(panel.render('extend'));

        const countInput = rootElement.querySelector<HTMLInputElement>('.extend-pattern-count-input')!;
        const swapStartButton = rootElement.querySelector<HTMLButtonElement>('.extend-pattern-swap-start-button')!;
        const methodSelect = rootElement.querySelector<HTMLSelectElement>('.extend-pattern-method-select')!;
        expect(countInput.value).toBe('1');
        expect(countInput.min).toBe('1');
        expect(swapStartButton.hidden).toBe(false);
        expect(methodSelect.value).toBe('linear');
        const startX = rootElement.querySelector<HTMLInputElement>('[data-role="start"][data-group="position"][data-axis="x"]')!;
        const stepX = rootElement.querySelector<HTMLInputElement>('[data-role="step"][data-group="position"][data-axis="x"]')!;
        expect(startX.readOnly).toBe(true);
        expect(stepX.readOnly).toBe(false);
        panel.setExtendValues({
            start: { position: { x: 10, y: 20, z: 30 }, rotation: { x: 1, y: 2, z: 3 } },
            step: { position: { x: 4, y: 5, z: 6 }, rotation: { x: 0.1, y: 0.2, z: 0.3 } }
        });
        expect(startX.value).toBe('10');
        expect(stepX.value).toBe('4');

        const optionUpdates: Array<{ method: string; count: number; swapDirection: boolean; start: { position: { x: number } }; step: { position: { x: number } } }> = [];
        eventBus.subscribe('extend:pattern-options-changed', options => optionUpdates.push(options as typeof optionUpdates[number]));
        countInput.value = '3';
        countInput.dispatchEvent(new Event('input', { bubbles: true }));
        swapStartButton.click();
        expect(optionUpdates.map(({ count, swapDirection }) => ({ count, swapDirection }))).toEqual([
            { count: 3, swapDirection: false },
            { count: 3, swapDirection: true }
        ]);
        expect(optionUpdates[1].start.position.x).toBe(14);
        expect(optionUpdates[1].step.position.x).toBe(-4);
        expect(swapStartButton.getAttribute('aria-pressed')).toBe('true');

        let saveRequest: unknown;
        let cancelRequested = false;
        eventBus.subscribe('extend:pattern-save-requested', options => { saveRequest = options; });
        eventBus.subscribe('extend:pattern-cancel-requested', () => { cancelRequested = true; });
        countInput.value = '4';
        rootElement.querySelector<HTMLButtonElement>('.create-panel-save')!.click();
        rootElement.querySelector<HTMLButtonElement>('.create-panel-cancel')!.click();
        expect(saveRequest).toMatchObject({ method: 'linear', count: 4, swapDirection: true, step: { position: { x: -4 } } });
        expect(cancelRequested).toBe(true);
    });

    test('renders read-only Fill values, updates offsets from count, and publishes save requests', () => {
        const panel = new CreatePanel(eventBus, null, null);
        panel.setRootElement(rootElement);
        rootElement.appendChild(panel.render('fill'));

        const methodSelect = rootElement.querySelector<HTMLSelectElement>('.fill-pattern-method-select')!;
        const countInput = rootElement.querySelector<HTMLInputElement>('.fill-pattern-count-input')!;
        expect(methodSelect.value).toBe('linear');
        expect(methodSelect.options[0].textContent).toBe('Linear');
        const startX = rootElement.querySelector<HTMLInputElement>('[data-role="start"][data-group="position"][data-axis="x"]')!;
        const offsetX = rootElement.querySelector<HTMLInputElement>('[data-role="step"][data-group="position"][data-axis="x"]')!;
        expect(startX.readOnly).toBe(true);
        expect(offsetX.readOnly).toBe(true);
        panel.setFillValues({
            start: { position: { x: 10, y: 20, z: 30 }, rotation: { x: 1, y: 2, z: 3 } },
            end: { position: { x: 30, y: 60, z: 70 }, rotation: { x: 5, y: 10, z: 15 } }
        });
        expect(startX.value).toBe('10');
        expect(offsetX.value).toBe('10');

        const optionUpdates: Array<{ count: number }> = [];
        let saveRequest: unknown;
        eventBus.subscribe('fill:pattern-options-changed', options => optionUpdates.push(options as { count: number }));
        eventBus.subscribe('fill:pattern-save-requested', options => { saveRequest = options; });
        countInput.value = '3';
        countInput.dispatchEvent(new Event('input', { bubbles: true }));
        expect(offsetX.value).toBe('5');
        expect(optionUpdates).toEqual([{ count: 3 }]);
        rootElement.querySelector<HTMLButtonElement>('.create-panel-save')!.click();
        expect(saveRequest).toEqual({ count: 3 });
    });
});