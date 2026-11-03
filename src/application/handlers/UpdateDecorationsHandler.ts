/**
 * Handler for updating multiple decoration transforms as one undoable action.
 */
import { DecorationUpdatedEvent } from '../../domain/events/DecorationUpdatedEvent.js';
import { HomesteadLayout } from '../../domain/HomesteadLayout.ts';
import { UndoRecord } from '../UndoRecord.js';
import { UndoRedoManager } from '../UndoRedoManager.ts';

type DecorationUpdate = {
    layerId: string;
    decorationId: string;
    position: { x: number; y: number; z?: number; rotation?: number };
    rotation?: number;
    rotX?: number;
    rotZ?: number;
    scale?: number;
};

export class UpdateDecorationsHandler {
    layout: HomesteadLayout;
    undoRedoManager: UndoRedoManager | null;

    constructor(layout: HomesteadLayout, undoRedoManager: UndoRedoManager | null = null) {
        this.layout = layout;
        this.undoRedoManager = undoRedoManager;
    }

    execute(command: { updates: DecorationUpdate[]; recordUndo?: boolean }): { updated: number } {
        const { updates, recordUndo = true } = command;
        if (!Array.isArray(updates)) {
            throw new Error('UpdateDecorationsHandler: updates must be an array');
        }

        const previousUpdates = updates.map(update => {
            const decoration = this.layout.getDecorationFromLayer(update.layerId, update.decorationId);
            if (!decoration) {
                throw new Error(`HomesteadLayout.updateDecorationInLayer: decoration with id "${update.decorationId}" not found`);
            }
            return {
                layerId: update.layerId,
                decorationId: update.decorationId,
                position: decoration.position.toObject(),
                rotation: decoration.rotation,
                rotX: decoration.rotX,
                rotZ: decoration.rotZ,
                scale: decoration.scale
            };
        });

        const changes = updates
            .map((update, index) => ({ update, previous: previousUpdates[index] }))
            .filter(({ update, previous }) =>
                update.position.x !== previous.position.x ||
                update.position.y !== previous.position.y ||
                (update.position.z ?? previous.position.z) !== previous.position.z ||
                (update.rotation !== undefined && update.rotation !== previous.rotation) ||
                (update.rotX !== undefined && update.rotX !== previous.rotX) ||
                (update.rotZ !== undefined && update.rotZ !== previous.rotZ) ||
                (update.scale !== undefined && update.scale !== previous.scale)
            );

        changes.forEach(({ update }) => {
            const decoration = this.layout.updateDecorationInLayer(
                update.layerId,
                update.decorationId,
                {
                    position: update.position,
                    rotation: update.rotation,
                    rotX: update.rotX,
                    rotZ: update.rotZ,
                    scale: update.scale
                }
            );
            this.layout.addEvent(new DecorationUpdatedEvent(this.layout.id, update.layerId, decoration));
        });

        if (changes.length > 0 && this.undoRedoManager && recordUndo) {
            this.undoRedoManager.push(new UndoRecord({
                label: `Move ${changes.length} decoration${changes.length === 1 ? '' : 's'}`,
                commandType: 'UpdateDecorationsCommand',
                forwardData: { updates: changes.map(({ update }) => update) },
                reverseData: { updates: changes.map(({ previous }) => previous) }
            }));
        }

        return { updated: changes.length };
    }
}

export default UpdateDecorationsHandler;