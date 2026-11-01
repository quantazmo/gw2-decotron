/**
 * HomesteadLayout - Root Aggregate representing a complete homestead layout
 * Properties: id, map (GW2Map), layers (Layer[])
 * Business rules: must have at least one layer, must have map loaded
 */
import { Layer } from './Layer.ts';
import { GW2Map } from './GW2Map.ts';
import { WorldCoordinate } from './WorldCoordinate.ts';
import { Decoration } from './Decoration.ts';

class HomesteadLayout {
    id: string;
    name: string;
    map: GW2Map | null;
    layers: Map<string, Layer>;
    activeLayerId: string | null;
    createdAt: Date;
    updatedAt: Date;
    pendingEvents: unknown[];

    constructor(id: string | number, name: string = 'Untitled Layout') {
        this.validate(id, name);
        this.id = String(id).trim();
        this.name = String(name).trim();
        this.map = null; // GW2Map instance
        this.layers = new Map(); // Map<layerId, Layer>
        this.activeLayerId = null;
        this.createdAt = new Date();
        this.updatedAt = new Date();
        this.pendingEvents = []; // Domain events pending publication
    }

    validate(id: string | number, name: string): void {
        if (typeof id !== 'string' && typeof id !== 'number') {
            throw new Error('HomesteadLayout: id must be a string or number');
        }
        if (String(id).trim().length === 0) {
            throw new Error('HomesteadLayout: id cannot be empty');
        }
        if (typeof name !== 'string') {
            throw new Error('HomesteadLayout: name must be a string');
        }
    }

    /**
     * Set the map for this layout
     */
    setMap(map: GW2Map): void {
        if (!map || typeof map.validateState !== 'function') {
            throw new Error('HomesteadLayout.setMap: map must be a GW2Map instance');
        }
        const validation = map.validateState();
        if (!validation.isValid) {
            throw new Error(`HomesteadLayout.setMap: invalid map - ${validation.errors.join(', ')}`);
        }
        this.map = map;
        this.updatedAt = new Date();
    }

    /**
     * Check if map is loaded
     */
    hasMapLoaded(): boolean {
        return this.map !== null;
    }

    /**
     * Add a layer to the layout
     */
    addLayer(layer: Layer): void {
        if (!layer || typeof layer.id !== 'string') {
            throw new Error('HomesteadLayout.addLayer: layer must have an id');
        }
        if (this.layers.has(layer.id)) {
            throw new Error(`HomesteadLayout.addLayer: layer with id "${layer.id}" already exists`);
        }
        this.layers.set(layer.id, layer);
        // If this is the first layer, make it active
        if (this.layers.size === 1) {
            this.activeLayerId = layer.id;
        }
        this.updatedAt = new Date();
    }

    /**
     * Remove a layer from the layout
     */
    removeLayer(layerId: string): void {
        if (!this.layers.has(layerId)) {
            throw new Error(`HomesteadLayout.removeLayer: layer with id "${layerId}" not found`);
        }
        this.layers.delete(layerId);
        // If we deleted the active layer, switch to first available
        if (this.activeLayerId === layerId) {
            const firstLayerId = this.layers.keys().next().value;
            this.activeLayerId = firstLayerId || null;
        }
        this.updatedAt = new Date();
    }

    /**
     * Get a layer by id
     */
    getLayer(layerId: string): Layer | null {
        return this.layers.get(layerId) || null;
    }

    /**
     * Get all layers as array
     */
    getAllLayers() {
        return Array.from(this.layers.values());
    }

    /**
     * Get the active layer
     */
    getActiveLayer() {
        if (!this.activeLayerId) {
            return null;
        }
        return this.layers.get(this.activeLayerId);
    }

    /**
     * Set the active layer
     */
    setActiveLayer(layerId: string): void {
        if (!this.layers.has(layerId)) {
            throw new Error(`HomesteadLayout.setActiveLayer: layer with id "${layerId}" not found`);
        }
        this.activeLayerId = layerId;
        this.updatedAt = new Date();
    }

    /**
     * Rename a layer (aggregate method)
     */
    renameLayer(layerId: string, newName: string): void {
        const layer = this.getLayer(layerId);
        if (!layer) {
            throw new Error(`HomesteadLayout.renameLayer: layer with id "${layerId}" not found`);
        }
        if (typeof newName !== 'string' || newName.trim().length === 0) {
            throw new Error('HomesteadLayout.renameLayer: newName must be a non-empty string');
        }
        layer.name = newName.trim();
        this.updatedAt = new Date();
    }

    /**
     * Toggle layer visibility (aggregate method)
     */
    toggleLayerVisibility(layerId: string): void {
        const layer = this.getLayer(layerId);
        if (!layer) {
            throw new Error(`HomesteadLayout.toggleLayerVisibility: layer with id "${layerId}" not found`);
        }
        layer.isVisible = !layer.isVisible;
        this.updatedAt = new Date();
    }

    /**
     * Add decoration to a layer (aggregate method)
     */
    addDecorationToLayer(layerId: string, decoration: Decoration): void {
        const layer = this.getLayer(layerId);
        if (!layer) {
            throw new Error(`HomesteadLayout.addDecorationToLayer: layer with id "${layerId}" not found`);
        }
        if (!decoration || typeof decoration.id !== 'string') {
            throw new Error('HomesteadLayout.addDecorationToLayer: decoration must have an id');
        }
        layer.addDecoration(decoration);
        this.updatedAt = new Date();
    }

    /**
     * Remove decoration from a layer (aggregate method)
     */
    removeDecorationFromLayer(layerId: string, decorationId: string): void {
        const layer = this.getLayer(layerId);
        if (!layer) {
            throw new Error(`HomesteadLayout.removeDecorationFromLayer: layer with id "${layerId}" not found`);
        }
        layer.removeDecoration(decorationId);
        this.updatedAt = new Date();
    }

    /**
     * Update decoration in a layer (aggregate method)
     */
    updateDecorationInLayer(layerId: string, decorationId: string, updates: { position?: WorldCoordinate | { x: number; y: number; z?: number; rotation?: number }; rotation?: number; rotX?: number; rotZ?: number; scale?: number }): Decoration {
        const layer = this.getLayer(layerId);
        if (!layer) {
            throw new Error(`HomesteadLayout.updateDecorationInLayer: layer with id "${layerId}" not found`);
        }
        const decoration = layer.getDecoration(decorationId);
        if (!decoration) {
            throw new Error(`HomesteadLayout.updateDecorationInLayer: decoration with id "${decorationId}" not found`);
        }

        // Apply updates
        if (updates.position) {
            // Create new WorldCoordinate (value objects should be immutable)
            if (updates.position instanceof WorldCoordinate) {
                decoration.position = updates.position;
            } else {
                // Convert plain object to WorldCoordinate
                decoration.position = new WorldCoordinate(
                    updates.position.x,
                    updates.position.y,
                    updates.position.z ?? decoration.position.z,
                    updates.position.rotation ?? decoration.position.rotation
                );
            }
        }
        if (updates.rotation !== undefined) {
            decoration.rotation = updates.rotation;
        }
        if (updates.rotX !== undefined) {
            decoration.rotX = updates.rotX;
        }
        if (updates.rotZ !== undefined) {
            decoration.rotZ = updates.rotZ;
        }
        if (updates.scale !== undefined) {
            decoration.scale = updates.scale;
        }
        this.updatedAt = new Date();
        return decoration;
    }

    /**
     * Get decoration from a layer (aggregate method)
     */
    getDecorationFromLayer(layerId: string, decorationId: string): Decoration | null {
        const layer = this.getLayer(layerId);
        if (!layer) {
            return null;
        }
        return layer.getDecoration(decorationId);
    }

    /**
     * Get all decorations count across all layers
     */
    getTotalDecorationCount() {
        let count = 0;
        for (const layer of this.layers.values()) {
            count += layer.decorations.size;
        }
        return count;
    }

    /**
     * Get layer count
     */
    getLayerCount() {
        return this.layers.size;
    }

    /**
     * Validate map is loaded
     */
    validateMapLoaded() {
        if (!this.hasMapLoaded()) {
            return {
                isValid: false,
                errors: ['No map is currently loaded']
            };
        }
        return { isValid: true, errors: [] };
    }

    /**
     * Validate the entire layout state
     */
    validateState() {
        const errors = [];

        try {
            this.validate(this.id, this.name);
        } catch (error) {
            errors.push((error as Error).message);
        }

        if (!this.hasMapLoaded()) {
            errors.push('Layout has no map loaded');
        } else {
            const mapValidation = this.map!.validateState();
            if (!mapValidation.isValid) {
                errors.push(`Map: ${mapValidation.errors.join(', ')}`);
            }
        }

        if (this.layers.size === 0) {
            errors.push('Layout must have at least one layer');
        }

        // Validate all layers
        for (const layer of this.layers.values()) {
            const layerValidation = layer.validateState();
            if (!layerValidation.isValid) {
                errors.push(`Layer "${layer.id}": ${layerValidation.errors.join(', ')}`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Move decorations from their current layers to a target layer.
     * Skips decorations already in the target layer and IDs not found in any layer.
     * @param {string[]} decorationIds - IDs of decorations to move
     * @param {string} targetLayerId - ID of the target layer
     * @returns {{ moved: Map<string, string>, skipped: string[] }} moved maps decorationId → sourceLayerId; skipped lists IDs not moved
     */
    moveDecorations(decorationIds: string[], targetLayerId: string): { moved: Map<string, string>; skipped: string[] } {
        const targetLayer = this.getLayer(targetLayerId);
        if (!targetLayer) {
            throw new Error(`HomesteadLayout.moveDecorations: target layer "${targetLayerId}" not found`);
        }
        if (!Array.isArray(decorationIds)) {
            throw new Error('HomesteadLayout.moveDecorations: decorationIds must be an array');
        }

        const moved = new Map(); // decorationId → sourceLayerId
        const skipped = [];

        for (const decorationId of decorationIds) {
            const sourceLayer = this._findLayerContaining(decorationId);
            if (!sourceLayer) {
                skipped.push(decorationId);
                continue;
            }
            if (sourceLayer.id === targetLayerId) {
                skipped.push(decorationId);
                continue;
            }
            const decoration = sourceLayer.getDecoration(decorationId)!;
            sourceLayer.removeDecoration(decorationId);
            targetLayer.addDecoration(decoration);
            moved.set(decorationId, sourceLayer.id);
        }

        if (moved.size > 0) {
            this.updatedAt = new Date();
        }
        return { moved, skipped };
    }

    /**
     * Remove decorations across all layers.
     * Returns full decoration data for undo support.
     * @param {string[]} decorationIds - IDs of decorations to remove
     * @returns {{ removed: Map<string, { sourceLayerId: string, decoration: object }> }}
     */
    removeDecorations(decorationIds: string[]): { removed: Map<string, { sourceLayerId: string; decoration: Decoration }> } {
        if (!Array.isArray(decorationIds)) {
            throw new Error('HomesteadLayout.removeDecorations: decorationIds must be an array');
        }

        const removed = new Map<string, { sourceLayerId: string; decoration: Decoration }>();

        for (const decorationId of decorationIds) {
            const sourceLayer = this._findLayerContaining(decorationId);
            if (!sourceLayer) {
                continue;
            }
            const decoration = sourceLayer.getDecoration(decorationId);
            if (!decoration) {
                continue;
            }
            sourceLayer.removeDecoration(decorationId);
            removed.set(decorationId, { sourceLayerId: sourceLayer.id, decoration });
        }

        if (removed.size > 0) {
            this.updatedAt = new Date();
        }
        return { removed };
    }

    /**
     * Find which layer contains a given decoration.
     * @param {string} decorationId
     * @returns {Layer|null}
     */
    getDecorationLayer(decorationId: string): Layer | null {
        return this._findLayerContaining(decorationId);
    }

    /**
     * Get IDs of all decorations in visible layers.
     * @returns {string[]}
     */
    getAllVisibleDecorationIds() {
        const ids = [];
        for (const layer of this.layers.values()) {
            if (layer.isVisible) {
                for (const decorationId of layer.decorations.keys()) {
                    ids.push(decorationId);
                }
            }
        }
        return ids;
    }

    /**
     * Remove all layers and reset activeLayerId.
     * Used for map switching.
     */
    clearAllLayers() {
        this.layers.clear();
        this.activeLayerId = null;
        this.updatedAt = new Date();
    }

    /**
     * Find the layer containing a decoration (internal helper).
     * @private
     * @param {string} decorationId
     * @returns {Layer|null}
     */
    _findLayerContaining(decorationId: string): Layer | null {
        for (const layer of this.layers.values()) {
            if (layer.getDecoration(decorationId)) {
                return layer;
            }
        }
        return null;
    }

    /**
     * Convert to data transfer object
     */
    toDTO() {
        return {
            id: this.id,
            name: this.name,
            map: this.map ? this.map.toDTO() : null,
            layers: this.getAllLayers().map(l => l.toDTO()),
            activeLayerId: this.activeLayerId,
            createdAt: this.createdAt.toISOString(),
            updatedAt: this.updatedAt.toISOString()
        };
    }

    /**
     * Create a copy of this layout
     */
    clone() {
        const layout = new HomesteadLayout(this.id, this.name);

        if (this.map) {
            layout.setMap(this.map.clone());
        }

        for (const layer of this.layers.values()) {
            layout.addLayer(layer.clone());
        }

        if (this.activeLayerId) {
            layout.setActiveLayer(this.activeLayerId);
        }

        return layout;
    }

    /**
     * Check if layouts are equal
     */
    equals(other: unknown): boolean {
        if (!(other instanceof HomesteadLayout)) {
            return false;
        }

        if (this.id !== other.id || this.name !== other.name) {
            return false;
        }

        const thisMapMatch = (!this.map && !other.map) || (this.map && other.map && this.map.equals(other.map));
        if (!thisMapMatch) {
            return false;
        }

        if (this.layers.size !== other.layers.size) {
            return false;
        }

        for (const [id, layer] of this.layers) {
            const otherLayer = other.layers.get(id);
            if (!otherLayer || !layer.equals(otherLayer)) {
                return false;
            }
        }

        return true;
    }

    toString() {
        return `HomesteadLayout(${this.id}, "${this.name}", ${this.layers.size} layers)`;
    }

    /**
     * Add a domain event to pending events
     * @param {DomainEvent} event
     */
    addEvent(event: unknown): void {
        this.pendingEvents.push(event);
    }

    /**
     * Get all pending domain events
     * @returns {DomainEvent[]}
     */
    getPendingEvents() {
        return [...this.pendingEvents];
    }

    /**
     * Clear all pending domain events
     */
    clearPendingEvents() {
        this.pendingEvents = [];
    }

    /**
     * Create from DTO
     */
    static fromDTO(dto: Record<string, unknown>): HomesteadLayout {
        const layout = new HomesteadLayout(dto.id as string | number, dto.name as string);

        if (dto.map) {
            layout.setMap(GW2Map.fromDTO(dto.map as Record<string, unknown>));
        }

        for (const layerDto of ((dto.layers as unknown[]) || [])) {
            layout.addLayer(Layer.fromDTO(layerDto as Record<string, unknown>));
        }

        if (dto.activeLayerId) {
            layout.setActiveLayer(dto.activeLayerId as string);
        }

        if (dto.createdAt) {
            layout.createdAt = new Date(dto.createdAt as string);
        }
        if (dto.updatedAt) {
            layout.updatedAt = new Date(dto.updatedAt as string);
        }

        return layout;
    }
}

export { HomesteadLayout };
