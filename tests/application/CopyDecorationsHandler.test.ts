import { describe, expect, test } from 'vitest';
import { CopyDecorationsHandler } from '../../src/application/handlers/CopyDecorationsHandler.js';
import { Decoration } from '../../src/domain/Decoration.js';
import { HomesteadLayout } from '../../src/domain/HomesteadLayout.js';
import { Layer } from '../../src/domain/Layer.js';
import { WorldCoordinate } from '../../src/domain/WorldCoordinate.js';

describe('CopyDecorationsHandler', () => {
    test('copies selected decorations with unique UIDs and preserves their properties', () => {
        const layout = new HomesteadLayout('layout-1', 'Layout');
        const sourceLayer = new Layer('source', 'Source');
        const targetLayer = new Layer('target', 'Target');
        const source = Decoration.create('oak', 'Oak', new WorldCoordinate(10, 20, 3), 45, 2);
        source.rotX = 12;
        source.rotZ = 23;
        sourceLayer.addDecoration(source);
        layout.addLayer(sourceLayer);
        layout.addLayer(targetLayer);

        const result = new CopyDecorationsHandler(layout).execute({
            decorationIds: [source.uid],
            targetLayerId: targetLayer.id
        });

        const copy = targetLayer.getDecoration(result.decorationIds[0])!;
        expect(result).toMatchObject({ success: true, copied: 1 });
        expect(copy.uid).not.toBe(source.uid);
        expect(copy.id).toBe(source.id);
        expect(copy.name).toBe(source.name);
        expect(copy.position.toObject()).toEqual(source.position.toObject());
        expect(copy.rotation).toBe(source.rotation);
        expect(copy.scale).toBe(source.scale);
        expect(copy.rotX).toBe(source.rotX);
        expect(copy.rotZ).toBe(source.rotZ);
        expect(sourceLayer.getDecoration(source.uid)).toBe(source);
        expect(layout.pendingEvents.at(-1)?.constructor.name).toBe('DecorationAddedEvent');
    });

    test('skips missing decorations and rejects an unknown target layer', () => {
        const layout = new HomesteadLayout('layout-1', 'Layout');
        layout.addLayer(new Layer('target', 'Target'));
        const handler = new CopyDecorationsHandler(layout);

        expect(handler.execute({ decorationIds: ['missing'], targetLayerId: 'target' }).copied).toBe(0);
        expect(() => handler.execute({ decorationIds: ['missing'], targetLayerId: 'unknown' }))
            .toThrow('target layer "unknown" not found');
    });
});