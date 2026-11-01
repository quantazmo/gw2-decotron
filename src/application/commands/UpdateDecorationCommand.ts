/**
 * Command to update a decoration's transform
 */
import { WorldCoordinate, WorldCoordinateLike } from '../../domain/WorldCoordinate.ts';

export class UpdateDecorationCommand {
    layerId: string;
    decorationId: string;
    position: WorldCoordinate | WorldCoordinateLike;
    rotation?: number;
    rotX?: number;
    rotZ?: number;
    scale?: number;

    constructor(layerId: string, decorationId: string, position: WorldCoordinate | WorldCoordinateLike, rotation?: number, rotX?: number, rotZ?: number, scale?: number) {
        this.layerId = layerId;
        this.decorationId = decorationId;
        this.position = position;
        this.rotation = rotation;
        this.rotX = rotX;
        this.rotZ = rotZ;
        this.scale = scale;
    }
}

export default UpdateDecorationCommand;
