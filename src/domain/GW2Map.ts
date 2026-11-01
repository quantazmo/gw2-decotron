/**
 * GW2Map - Domain Entity/Aggregate Root representing a GW2 map
 * Properties: id, name, tiles[], boundary, continent_id, floor
 */
import { MapBoundary } from './MapBoundary.ts';

export type MapTile =
    | { mapCoords: { x: number; y: number }; tileSize: number; tileSizeX?: number; tileSizeY?: number; url: string; mapTile?: { x: number; y: number } }
    | { x: number; y: number; z?: number; mapCoords?: { x: number; y: number }; tileSize?: number; tileSizeX?: number; tileSizeY?: number; url?: string; mapTile?: { x: number; y: number } };

export class GW2Map {
    id: number;
    name: string;
    continent_id: number;
    floor: number;
    tiles: MapTile[];
    boundary: MapBoundary | null;
    rect: { min: { x: number; y: number }; max: { x: number; y: number }; width: number; height: number } | null;

    constructor(id: number, name: string, continentId: number, floor: number = 0) {
        this.validate(id, name, continentId);
        this.id = Number(id);
        this.name = String(name).trim();
        this.continent_id = Number(continentId);
        this.floor = Number(floor);
        this.tiles = []; // Array of tile data
        this.boundary = null; // MapBoundary instance
        this.rect = null; // Map bounds {min: {x, y}, max: {x, y}}
    }

    validate(id: number, name: string, continentId: number): void {
        if (!Number.isInteger(id) || id < 0) {
            throw new Error('GW2Map: id must be a non-negative integer');
        }
        if (typeof name !== 'string') {
            throw new Error('GW2Map: name must be a string');
        }
        if (String(name).trim().length === 0) {
            throw new Error('GW2Map: name cannot be empty');
        }
        if (!Number.isInteger(continentId) || continentId < 0) {
            throw new Error('GW2Map: continentId must be a non-negative integer');
        }
    }

    /**
     * Set the boundary for this map
     */
    setBoundary(boundary: import('./MapBoundary.ts').MapBoundary): void {
        if (!boundary || typeof boundary.contains !== 'function') {
            throw new Error('GW2Map.setBoundary: boundary must be a MapBoundary instance');
        }
        this.boundary = boundary;
    }

    /**
     * Set the tiles for this map
     */
    setTiles(tiles: MapTile[]): void {
        if (!Array.isArray(tiles)) {
            throw new Error('GW2Map.setTiles: tiles must be an array');
        }
        this.tiles = tiles;
    }

    /**
     * Add a tile to the map
     */
    addTile(tile: MapTile): void {
        if (!tile) {
            throw new Error('GW2Map.addTile: tile cannot be null');
        }
        this.tiles.push(tile);
    }

    /**
     * Set the map rectangle bounds
     */
    setRect(min: { x: number; y: number }, max: { x: number; y: number }): void {
        if (!min || !max || typeof min.x !== 'number' || typeof max.x !== 'number') {
            throw new Error('GW2Map.setRect: min and max must have x and y properties');
        }
        this.rect = {
            min: { x: Number(min.x), y: Number(min.y) },
            max: { x: Number(max.x), y: Number(max.y) },
            width: Number(max.x) - Number(min.x),
            height: Number(max.y) - Number(min.y)
        };
    }

    /**
     * Get map rectangle
     */
    getRect() {
        return this.rect;
    }

    /**
     * Check if map has valid boundary
     */
    hasBoundary() {
        return this.boundary !== null;
    }

    /**
     * Check if map has tiles
     */
    hasTiles() {
        return this.tiles.length > 0;
    }

    /**
     * Validate the map state
     */
    validateState() {
        const errors = [];

        try {
            this.validate(this.id, this.name, this.continent_id);
        } catch (error) {
            errors.push((error as Error).message);
        }

        // Note: Tiles are optional - they can be calculated later from floor data
        // if (!this.hasTiles()) {
        //     errors.push('Map has no tiles');
        // }

        if (this.boundary) {
            const boundaryValidation = this.boundary.validateState();
            if (!boundaryValidation.isValid) {
                errors.push(`Boundary: ${boundaryValidation.errors.join(', ')}`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Convert to data transfer object
     */
    toDTO() {
        return {
            id: this.id,
            name: this.name,
            continent_id: this.continent_id,
            floor: this.floor,
            tiles: this.tiles,
            boundary: this.boundary ? this.boundary.toObject() : null,
            rect: this.rect
        };
    }

    /**
     * Create a copy of this map
     */
    clone() {
        const map = new GW2Map(this.id, this.name, this.continent_id, this.floor);
        map.setTiles([...this.tiles]);
        if (this.boundary) {
            map.setBoundary(this.boundary.clone());
        }
        if (this.rect) {
            map.setRect(this.rect.min, this.rect.max);
        }
        return map;
    }

    /**
     * Check if maps are equal
     */
    equals(other: unknown): boolean {
        if (!(other instanceof GW2Map)) {
            return false;
        }
        return this.id === other.id &&
            this.name === other.name &&
            this.continent_id === other.continent_id &&
            this.floor === other.floor;
    }

    toString() {
        return `GW2Map(${this.id}, "${this.name}", continent: ${this.continent_id}, ${this.tiles.length} tiles)`;
    }

    /**
     * Create from DTO
     */
    static fromDTO(dto: Record<string, unknown>): GW2Map {
        const map = new GW2Map(dto.id as number, dto.name as string, dto.continent_id as number, (dto.floor as number) ?? 0);

        if (dto.tiles) {
            map.setTiles(dto.tiles as MapTile[]);
        }

        if (dto.boundary) {
            map.setBoundary(MapBoundary.fromObject(dto.boundary as { points: Array<{ x: number; y: number }> }));
        }

        if (dto.rect) {
            const r = dto.rect as { min: { x: number; y: number }; max: { x: number; y: number } };
            map.setRect(r.min, r.max);
        }

        return map;
    }
}
