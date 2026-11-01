/**
 * Handler for UpdateDecorationCommand
 */
import { LayerId } from '../../domain/LayerId.js';
import { DecorationUpdatedEvent } from '../../domain/events/DecorationUpdatedEvent.js';
import { HomesteadLayout } from '../../domain/HomesteadLayout.ts';
import { WorldCoordinate, WorldCoordinateLike } from '../../domain/WorldCoordinate.ts';
import { UndoRecord } from '../UndoRecord.js';
import { UndoRedoManager } from '../UndoRedoManager.ts';

export class UpdateDecorationHandler {
    layout: HomesteadLayout;
    undoRedoManager: UndoRedoManager | null;

    /**
     * @param {HomesteadLayout} layout - The layout aggregate root
     */
    constructor(layout: HomesteadLayout, undoRedoManager: UndoRedoManager | null = null) {
        this.layout = layout;
        this.undoRedoManager = undoRedoManager;
    }

    /**
     * Executes the update decoration command
     * @param {UpdateDecorationCommand|Object} command - The command to execute
     * @returns {Object} Result object with the decoration
     */
    execute(command: {
        layerId: string;
        decorationId: string;
        position: WorldCoordinate | WorldCoordinateLike;
        rotation?: number;
        rotX?: number;
        rotZ?: number;
        scale?: number;
        recordUndo?: boolean;
    }): { decoration: import('../../domain/Decoration.ts').Decoration } {
        const layerId = new LayerId(command.layerId);
        const { decorationId, position, rotation, rotX, rotZ, scale } = command;
        if (!this.layout.getLayer(layerId.id)) {
            throw new Error(`HomesteadLayout.updateDecorationInLayer: layer with id "${layerId.id}" not found`);
        }
        const current = this.layout.getDecorationFromLayer(layerId.id, decorationId);
        if (!current) {
            throw new Error(`HomesteadLayout.updateDecorationInLayer: decoration with id "${decorationId}" not found`);
        }

        const previous = {
            position: current.position.toObject(),
            rotation: current.rotation,
            rotX: current.rotX,
            rotZ: current.rotZ,
            scale: current.scale
        };

        // Use aggregate method to update decoration
        const decoration = this.layout.updateDecorationInLayer(
            layerId.id,
            decorationId,
            { position, rotation, rotX, rotZ, scale }
        );

        const positionData = position instanceof WorldCoordinate ? position.toObject() : { ...position };
        const forwardData = { layerId: layerId.id, decorationId, position: positionData, rotation, rotX, rotZ, scale };
        const changed = position.x !== previous.position.x || position.y !== previous.position.y ||
            (position.z ?? previous.position.z) !== previous.position.z ||
            rotation !== previous.rotation || rotX !== previous.rotX || rotZ !== previous.rotZ || scale !== previous.scale;
        if (changed && this.undoRedoManager && command.recordUndo !== false) {
            this.undoRedoManager.push(new UndoRecord({
                label: `Update ${decoration.name}`,
                commandType: 'UpdateDecorationCommand',
                forwardData,
                reverseData: { layerId: layerId.id, decorationId, ...previous }
            }));
        }

        // Emit domain event
        const event = new DecorationUpdatedEvent(
            this.layout.id,
            layerId.id,
            decoration
        );
        this.layout.addEvent(event);

        return {
            decoration: decoration
        };
    }
}

export default UpdateDecorationHandler;
