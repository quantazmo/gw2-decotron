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
    decorationIds: string[];
    targetLayerId: string;
};

export class CopyDecorationsHandler {
    layout: HomesteadLayout;
    undoRedoManager: UndoRedoManager | null;

    constructor(layout: HomesteadLayout, undoRedoManager: UndoRedoManager | null = null) {
        this.layout = layout;
        this.undoRedoManager = undoRedoManager;
    }

    execute(command: CopyDecorationsPayload): { success: boolean; copied: number; decorationIds: string[] } {
        const { decorationIds, targetLayerId } = command;
        if (!Array.isArray(decorationIds) || decorationIds.length === 0) {
            return { success: true, copied: 0, decorationIds: [] };
        }

        const targetLayer = this.layout.getLayer(targetLayerId);
        if (!targetLayer) {
            throw new Error(`CopyDecorationsHandler: target layer "${targetLayerId}" not found`);
        }

        const copies: Decoration[] = [];
        for (const decorationId of new Set(decorationIds)) {
            const sourceLayer = this.layout.getDecorationLayer(decorationId);
            const source = sourceLayer?.getDecoration(decorationId);
            if (!source) continue;

            let copy = Decoration.create(source.id, source.name, source.position, source.rotation, source.scale);
            copy.rotX = source.rotX;
            copy.rotZ = source.rotZ;
            while (this.layout.getAllLayers().some(layer => layer.getDecoration(copy.uid))) {
                copy = Decoration.create(source.id, source.name, source.position, source.rotation, source.scale);
                copy.rotX = source.rotX;
                copy.rotZ = source.rotZ;
            }

            this.layout.addDecorationToLayer(targetLayerId, copy);
            this.layout.addEvent(new DecorationAddedEvent(this.layout.id, targetLayerId, copy));
            copies.push(copy);
        }

        if (this.undoRedoManager && copies.length > 0) {
            const copiedIds = copies.map(copy => copy.uid);
            this.undoRedoManager.push(new UndoRecord({
                label: `Copy ${copies.length} decoration${copies.length > 1 ? 's' : ''} to ${targetLayer.name}`,
                commandType: 'CopyDecorationsCommand',
                forwardData: { targetLayerId, decorations: copies.map(copy => copy.toDTO()) },
                reverseData: { decorationIds: copiedIds }
            }));
        }

        return { success: true, copied: copies.length, decorationIds: copies.map(copy => copy.uid) };
    }
}

export default CopyDecorationsHandler;