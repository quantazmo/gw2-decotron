import { beforeEach, describe, expect, test } from 'vitest';
import { HomesteadLayout } from '../../src/domain/HomesteadLayout.js';
import { Layer } from '../../src/domain/Layer.js';
import { Decoration } from '../../src/domain/Decoration.js';
import { UpdateDecorationsHandler } from '../../src/application/handlers/UpdateDecorationsHandler.js';
import { UndoRedoManager } from '../../src/application/UndoRedoManager.js';

describe('UpdateDecorationsHandler', () => {
    let layout;
    let handler;
    let undoRedoManager;

    beforeEach(() => {
        layout = new HomesteadLayout('layout', 'Layout');
        const layer = new Layer('layer', 'Layer');
        layer.addDecoration(new Decoration('first', 'First', { x: 1, y: 2, z: 0 }));
        layer.addDecoration(new Decoration('second', 'Second', { x: 3, y: 4, z: 0 }));
        layout.addLayer(layer);
        undoRedoManager = new UndoRedoManager();
        handler = new UpdateDecorationsHandler(layout, undoRedoManager);
    });

    test('updates the full selection and records it as one undoable batch', () => {
        const updates = [
            { layerId: 'layer', decorationId: 'first', position: { x: 11, y: 12, z: 0 } },
            { layerId: 'layer', decorationId: 'second', position: { x: 13, y: 14, z: 0 } }
        ];

        expect(handler.execute({ updates })).toEqual({ updated: 2 });
        expect(layout.getDecorationFromLayer('layer', 'first').position.toObject()).toMatchObject({ x: 11, y: 12 });
        expect(layout.getDecorationFromLayer('layer', 'second').position.toObject()).toMatchObject({ x: 13, y: 14 });
        expect(undoRedoManager._undoStack).toHaveLength(1);
        expect(undoRedoManager.peekUndo().commandType).toBe('UpdateDecorationsCommand');
        expect(undoRedoManager.peekUndo().reverseData.updates).toHaveLength(2);

        const undoRecord = undoRedoManager.undo();
        handler.execute({ ...undoRecord.reverseData, recordUndo: false });
        expect(layout.getDecorationFromLayer('layer', 'first').position.toObject()).toMatchObject({ x: 1, y: 2 });
        expect(layout.getDecorationFromLayer('layer', 'second').position.toObject()).toMatchObject({ x: 3, y: 4 });

        const redoRecord = undoRedoManager.redo();
        handler.execute({ ...redoRecord.forwardData, recordUndo: false });
        expect(layout.getDecorationFromLayer('layer', 'first').position.toObject()).toMatchObject({ x: 11, y: 12 });
        expect(layout.getDecorationFromLayer('layer', 'second').position.toObject()).toMatchObject({ x: 13, y: 14 });
    });

    test('does not create history for a batch with no transform changes', () => {
        handler.execute({
            updates: [{ layerId: 'layer', decorationId: 'first', position: { x: 1, y: 2, z: 0 } }]
        });

        expect(undoRedoManager.canUndo()).toBe(false);
    });
});