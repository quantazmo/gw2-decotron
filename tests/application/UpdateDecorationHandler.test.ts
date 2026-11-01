/**
 * Tests for UpdateDecorationHandler
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { UpdateDecorationHandler } from '../../src/application/handlers/UpdateDecorationHandler.js';
import { UpdateDecorationCommand } from '../../src/application/commands/UpdateDecorationCommand.js';
import { HomesteadLayout } from '../../src/domain/HomesteadLayout.js';
import { Decoration } from '../../src/domain/Decoration.js';
import { Layer } from '../../src/domain/Layer.js';
import { UndoRedoManager } from '../../src/application/UndoRedoManager.js';

describe('UpdateDecorationHandler', () => {
    let layout;
    let handler;
    let layer;
    let decoration;

    beforeEach(() => {
        // Create layout and add a layer with a decoration
        layout = new HomesteadLayout('test-layout', 'Test Layout');
        layer = new Layer('test-layer', 'Test Layer');
        layout.addLayer(layer);
        decoration = new Decoration('decoration-1', 'Test Decoration', { x: 100, y: 200 });
        layer.addDecoration(decoration);

        handler = new UpdateDecorationHandler(layout);
    });

    test('should update decoration position', () => {
        const command = new UpdateDecorationCommand(
            layer.id,
            decoration.id,
            { x: 300, y: 400 }
        );

        const result = handler.execute(command);

        expect(result.decoration.position.x).toBe(300);
        expect(result.decoration.position.y).toBe(400);
    });

    test('should update all decoration transform fields', () => {
        const command = {
            layerId: layer.id,
            decorationId: decoration.uid,
            position: { x: 300, y: 400, z: 0 },
            rotation: 1.2,
            rotX: 0.3,
            rotZ: 0.6,
            scale: 2.5
        };

        const result = handler.execute(command);

        expect(result.decoration.position.toObject()).toMatchObject({ x: 300, y: 400, z: 0 });
        expect(result.decoration.rotation).toBe(1.2);
        expect(result.decoration.rotX).toBe(0.3);
        expect(result.decoration.rotZ).toBe(0.6);
        expect(result.decoration.scale).toBe(2.5);
    });

    test('should record complete before and after transforms for undo and redo', () => {
        decoration.rotX = 0.15;
        decoration.rotZ = 0.45;
        const undoRedoManager = new UndoRedoManager();
        const undoableHandler = new UpdateDecorationHandler(layout, undoRedoManager);

        undoableHandler.execute({
            layerId: layer.id,
            decorationId: decoration.uid,
            position: { x: 300, y: 400, z: 0 },
            rotation: 1.2,
            rotX: 0.3,
            rotZ: 0.6,
            scale: 2.5
        });

        const record = undoRedoManager.peekUndo()!;
        expect(record.commandType).toBe('UpdateDecorationCommand');
        expect(record.reverseData).toMatchObject({
            position: { x: 100, y: 200, z: 0, rotation: 0 },
            rotation: 0,
            rotX: 0.15,
            rotZ: 0.45,
            scale: 1
        });
        expect(record.forwardData).toMatchObject({
            position: { x: 300, y: 400, z: 0 },
            rotation: 1.2,
            rotX: 0.3,
            rotZ: 0.6,
            scale: 2.5
        });
    });

    test('should emit DecorationUpdatedEvent', () => {
        const command = new UpdateDecorationCommand(
            layer.id,
            decoration.id,
            { x: 300, y: 400 }
        );

        handler.execute(command);

        const events = layout.getPendingEvents();
        expect(events).toHaveLength(1);
        expect(events[0].constructor.name).toBe('DecorationUpdatedEvent');
        expect(events[0].layerId).toBe(layer.id);
        expect(events[0].decoration.id).toBe(decoration.id);
    });

    test('should throw error when layer does not exist', () => {
        const command = new UpdateDecorationCommand(
            'nonexistent-layer',
            decoration.id,
            { x: 300, y: 400 }
        );

        expect(() => handler.execute(command)).toThrow('HomesteadLayout.updateDecorationInLayer: layer with id "nonexistent-layer" not found');
    });

    test('should throw error when decoration does not exist', () => {
        const command = new UpdateDecorationCommand(
            layer.id,
            'nonexistent-decoration',
            { x: 300, y: 400 }
        );

        expect(() => handler.execute(command)).toThrow('HomesteadLayout.updateDecorationInLayer: decoration with id "nonexistent-decoration" not found');
    });
});
