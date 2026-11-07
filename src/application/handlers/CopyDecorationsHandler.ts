/**
 * Handler for CopyDecorationsCommand.
 * Copies decoration instances into a target layer without moving the originals.
 */
import { Decoration } from '../../domain/Decoration.js';
import { DecorationAddedEvent } from '../../domain/events/DecorationAddedEvent.js';
import { HomesteadLayout } from '../../domain/HomesteadLayout.ts';
import { UndoRecord } from '../UndoRecord.js';
import { UndoRedoManager } from '../UndoRedoManager.ts';

type CopyDecorationsPayload = {
    decorationIds?: string[];
    copies?: Array<{
        decorationId: string;
        position: { x: number; y: number; z?: number; rotation?: number };
        rotation?: number;
        rotX?: number;
        rotZ?: number;
    }>;
    targetLayerId: string;
};
type CopyRequest = {
    decorationId: string;
    position?: { x: number; y: number; z?: number; rotation?: number };
    rotation?: number;
    rotX?: number;
    rotZ?: number;
};

export class CopyDecorationsHandler {
    layout: HomesteadLayout;
    undoRedoManager: UndoRedoManager | null;

    constructor(layout: HomesteadLayout, undoRedoManager: UndoRedoManager | null = null) {
        this.layout = layout;
        this.undoRedoManager = undoRedoManager;
    }

    execute(command: CopyDecorationsPayload): { success: boolean; copied: number; decorationIds: string[] } {
        const { decorationIds = [], copies: requestedCopies, targetLayerId } = command;
        const copyRequests: CopyRequest[] = requestedCopies ?? Array.from(new Set(decorationIds)).map(decorationId => ({ decorationId }));
        if (copyRequests.length === 0) {
            return { success: true, copied: 0, decorationIds: [] };
        }

        const targetLayer = this.layout.getLayer(targetLayerId);
        if (!targetLayer) {
            throw new Error(`CopyDecorationsHandler: target layer "${targetLayerId}" not found`);
        }

        const createdCopies: Decoration[] = [];
        for (const request of copyRequests) {
            const sourceLayer = this.layout.getDecorationLayer(request.decorationId);
            const source = sourceLayer?.getDecoration(request.decorationId);
            if (!source) continue;

            const position = request.position ?? source.position;
            const rotation = request.rotation ?? source.rotation;
            let copy = Decoration.create(source.id, source.name, position, rotation, source.scale);
            copy.rotX = request.rotX ?? source.rotX;
            copy.rotZ = request.rotZ ?? source.rotZ;
            while (this.layout.getAllLayers().some(layer => layer.getDecoration(copy.uid))) {
                copy = Decoration.create(source.id, source.name, position, rotation, source.scale);
                copy.rotX = request.rotX ?? source.rotX;
                copy.rotZ = request.rotZ ?? source.rotZ;
            }

            this.layout.addDecorationToLayer(targetLayerId, copy);
            this.layout.addEvent(new DecorationAddedEvent(this.layout.id, targetLayerId, copy));
            createdCopies.push(copy);
        }

        if (this.undoRedoManager && createdCopies.length > 0) {
            const copiedIds = createdCopies.map(copy => copy.uid);
            this.undoRedoManager.push(new UndoRecord({
                label: `Copy ${createdCopies.length} decoration${createdCopies.length > 1 ? 's' : ''} to ${targetLayer.name}`,
                commandType: 'CopyDecorationsCommand',
                forwardData: { targetLayerId, decorations: createdCopies.map(copy => copy.toDTO()) },
                reverseData: { decorationIds: copiedIds }
            }));
        }

        return { success: true, copied: createdCopies.length, decorationIds: createdCopies.map(copy => copy.uid) };
    }
}

export default CopyDecorationsHandler;