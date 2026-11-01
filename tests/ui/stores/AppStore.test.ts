/**
 * Tests for src/ui/stores/AppStore.js
 * Covers: constructor, getState, subscribe, dispatch (all actions), getActiveLayer, getLayer
 */
import { describe, expect, test } from 'vitest';
import { AppState, AppStore } from '../../../src/ui/stores/AppStore.js';
import { Decoration } from '../../../src/domain/Decoration.js';
import { Layer } from '../../../src/domain/Layer.js';
import { MapType } from '../../../src/domain/MapType.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeLayer(id: string, name = `Layer ${id}`, isVisible = true): Layer {
    const decorations = new Map();
    return {
        id,
        name,
        isVisible,
        decorations,
        addDecoration(dec: Decoration) { decorations.set(dec.id, dec); },
        removeDecoration(decId: string) { decorations.delete(decId); },
        getDecoration(decId: string) { return decorations.get(decId) || null; },
    } as Layer;
}

function makeLayout(layers: Layer[] = []) {
    const map = new Map(layers.map(l => [l.id, l]));
    return {
        layers: map,
        map: null,
    };
}

// ─── constructor ─────────────────────────────────────────────────────────────

describe('AppStore – constructor', () => {
    test('initializes with empty state', () => {
        const store = new AppStore();
        const state = store.getState();
        expect(state.layout).toBeNull();
        expect(state.layers).toEqual([]);
        expect(state.activeLayerId).toBeNull();
        expect(state.map).toBeNull();
        expect(state.mapType).toBeNull();
        expect(state.isDirty).toBe(false);
    });

    test('getState returns a frozen snapshot', () => {
        const store = new AppStore();
        const state = store.getState();
        expect(Object.isFrozen(state)).toBe(true);
    });
});

// ─── subscribe / unsubscribe ──────────────────────────────────────────────────

describe('AppStore – subscribe', () => {
    test('listener is called on dispatch', () => {
        const store = new AppStore();
        const calls: AppState[] = [];
        store.subscribe(state => calls.push(state));
        store.dispatch('RESET');
        expect(calls).toHaveLength(1);
    });

    test('returns an unsubscribe function that stops notifications', () => {
        const store = new AppStore();
        const calls: AppState[] = [];
        const unsub = store.subscribe(state => calls.push(state));
        unsub();
        store.dispatch('RESET');
        expect(calls).toHaveLength(0);
    });

    test('multiple listeners are all notified', () => {
        const store = new AppStore();
        const a: AppState[] = [], b: AppState[] = [];
        store.subscribe(s => a.push(s));
        store.subscribe(s => b.push(s));
        store.dispatch('RESET');
        expect(a).toHaveLength(1);
        expect(b).toHaveLength(1);
    });
});

// ─── LOAD_LAYOUT ────────────────────────────────────────────────────────────

describe('AppStore – LOAD_LAYOUT dispatch', () => {
    test('sets layout, layers array, activeLayerId to first layer, clears dirty', () => {
        const store = new AppStore();
        const layer1 = makeLayer('l1', 'Layer 1');
        const layer2 = makeLayer('l2', 'Layer 2');
        const layout = makeLayout([layer1, layer2]);

        store.dispatch('LOAD_LAYOUT', layout);
        const state = store.getState();

        expect(state.layout).toBe(layout);
        expect(state.layers).toHaveLength(2);
        expect(state.activeLayerId).toBe('l1');
        expect(state.isDirty).toBe(false);
    });

    test('sets map from layout.map when present', () => {
        const store = new AppStore();
        const fakeMap = { id: 'map1' };
        const layer = makeLayer('l1');
        const layout = { ...makeLayout([layer]), map: fakeMap };

        store.dispatch('LOAD_LAYOUT', layout);
        expect(store.getState().map).toBe(fakeMap);
    });

    test('sets mapType to GuildHall when loading a guild hall map', () => {
        const store = new AppStore();
        const layout = { ...makeLayout(), map: { id: 1121 } };

        store.dispatch('LOAD_LAYOUT', layout);
        expect(store.getState().mapType).toBe(MapType.GuildHall);
    });

    test('sets mapType to Homestead when loading a homestead map', () => {
        const store = new AppStore();
        const layout = { ...makeLayout(), map: { id: 1558 } };

        store.dispatch('LOAD_LAYOUT', layout);
        expect(store.getState().mapType).toBe(MapType.Homestead);
    });

    test('handles layout with no layers – activeLayerId is null', () => {
        const store = new AppStore();
        const layout = makeLayout([]);

        store.dispatch('LOAD_LAYOUT', layout);
        expect(store.getState().activeLayerId).toBeNull();
        expect(store.getState().layers).toHaveLength(0);
    });
});

// ─── CREATE_LAYER ─────────────────────────────────────────────────────────────

describe('AppStore – CREATE_LAYER dispatch', () => {
    test('appends layer and sets it active', () => {
        const store = new AppStore();
        const existing = makeLayer('l1');
        store.dispatch('LOAD_LAYOUT', makeLayout([existing]));

        const newLayer = makeLayer('l2', 'New Layer');
        store.dispatch('CREATE_LAYER', newLayer);

        const state = store.getState();
        expect(state.layers).toHaveLength(2);
        expect(state.activeLayerId).toBe('l2');
        expect(state.isDirty).toBe(true);
    });

    test('does nothing if no layout is loaded', () => {
        const store = new AppStore();
        const calls = [];
        store.subscribe(s => calls.push(s));
        store.dispatch('CREATE_LAYER', makeLayer('l1'));
        // dispatch fired but state layers should remain empty
        expect(store.getState().layers).toHaveLength(0);
    });
});

// ─── LOAD_ADDITIONAL_LAYOUT ─────────────────────────────────────────────────

describe('AppStore – LOAD_ADDITIONAL_LAYOUT dispatch', () => {
    test('appends the new layer and marks dirty', () => {
        const store = new AppStore();
        store.dispatch('LOAD_LAYOUT', makeLayout([makeLayer('l1')]));

        const extraLayer = makeLayer('l2', 'Extra');
        store.dispatch('LOAD_ADDITIONAL_LAYOUT', extraLayer);

        const state = store.getState();
        expect(state.layers).toHaveLength(2);
        expect(state.activeLayerId).toBe('l2');
        expect(state.isDirty).toBe(true);
    });

    test('does nothing if no layout is loaded', () => {
        const store = new AppStore();
        store.dispatch('LOAD_ADDITIONAL_LAYOUT', makeLayer('l1'));
        expect(store.getState().layers).toHaveLength(0);
    });
});

// ─── MAP_SWITCHED ─────────────────────────────────────────────────────────────

describe('AppStore – MAP_SWITCHED dispatch', () => {
    test('reloads state from new layout', () => {
        const store = new AppStore();
        const layer1 = makeLayer('l1');
        store.dispatch('LOAD_LAYOUT', makeLayout([layer1]));

        const newLayer = makeLayer('l2');
        const newLayout = { ...makeLayout([newLayer]), map: { id: 1121 } };
        store.dispatch('MAP_SWITCHED', { layout: newLayout });

        const state = store.getState();
        expect(state.layers).toHaveLength(1);
        expect(state.activeLayerId).toBe('l2');
        expect(state.isDirty).toBe(false);
        expect(state.mapType).toBe(MapType.GuildHall);
    });

    test('handles null payload gracefully', () => {
        const store = new AppStore();
        store.dispatch('LOAD_LAYOUT', makeLayout([makeLayer('l1')]));
        // should not throw
        store.dispatch('MAP_SWITCHED', null);
    });
});

// ─── DELETE_LAYER ─────────────────────────────────────────────────────────────

describe('AppStore – DELETE_LAYER dispatch', () => {
    test('removes the specified layer', () => {
        const store = new AppStore();
        store.dispatch('LOAD_LAYOUT', makeLayout([makeLayer('l1'), makeLayer('l2')]));

        store.dispatch('DELETE_LAYER', 'l1');

        const state = store.getState();
        expect(state.layers).toHaveLength(1);
        expect(state.layers[0].id).toBe('l2');
        expect(state.isDirty).toBe(true);
    });

    test('updates activeLayerId when active layer is deleted', () => {
        const store = new AppStore();
        store.dispatch('LOAD_LAYOUT', makeLayout([makeLayer('l1'), makeLayer('l2')]));
        // l1 is active after load
        store.dispatch('DELETE_LAYER', 'l1');
        expect(store.getState().activeLayerId).toBe('l2');
    });

    test('sets activeLayerId to null when last layer is deleted', () => {
        const store = new AppStore();
        store.dispatch('LOAD_LAYOUT', makeLayout([makeLayer('l1')]));
        store.dispatch('DELETE_LAYER', 'l1');
        expect(store.getState().activeLayerId).toBeNull();
    });

    test('keeps activeLayerId when a different layer is deleted', () => {
        const store = new AppStore();
        store.dispatch('LOAD_LAYOUT', makeLayout([makeLayer('l1'), makeLayer('l2')]));
        // l1 is active
        store.dispatch('DELETE_LAYER', 'l2');
        expect(store.getState().activeLayerId).toBe('l1');
    });
});

// ─── RENAME_LAYER ─────────────────────────────────────────────────────────────

describe('AppStore – RENAME_LAYER dispatch', () => {
    test('updates the layer name in place', () => {
        const store = new AppStore();
        store.dispatch('LOAD_LAYOUT', makeLayout([makeLayer('l1', 'Old Name')]));

        store.dispatch('RENAME_LAYER', { layerId: 'l1', newName: 'New Name' });

        const layer = store.getState().layers.find(l => l.id === 'l1');
        expect(layer!.name).toBe('New Name');
        expect(store.getState().isDirty).toBe(true);
    });

    test('does nothing for unknown layerId', () => {
        const store = new AppStore();
        store.dispatch('LOAD_LAYOUT', makeLayout([makeLayer('l1')]));
        store.dispatch('RENAME_LAYER', { layerId: 'unknown', newName: 'X' });
        expect(store.getState().isDirty).toBe(false);
    });
});

// ─── UPDATE_LAYER_VISIBILITY ───────────────────────────────────────────────────

describe('AppStore – UPDATE_LAYER_VISIBILITY dispatch', () => {
    test('sets visibility on the named layer', () => {
        const store = new AppStore();
        store.dispatch('LOAD_LAYOUT', makeLayout([makeLayer('l1')]));

        store.dispatch('UPDATE_LAYER_VISIBILITY', { layerId: 'l1', isVisible: false });

        const layer = store.getState().layers.find(l => l.id === 'l1');
        expect(layer!.isVisible).toBe(false);
        expect(store.getState().isDirty).toBe(true);
    });
});

// ─── SET_ACTIVE_LAYER ─────────────────────────────────────────────────────────

describe('AppStore – SET_ACTIVE_LAYER dispatch', () => {
    test('updates activeLayerId', () => {
        const store = new AppStore();
        store.dispatch('LOAD_LAYOUT', makeLayout([makeLayer('l1'), makeLayer('l2')]));

        store.dispatch('SET_ACTIVE_LAYER', 'l2');
        expect(store.getState().activeLayerId).toBe('l2');
    });
});

// ─── ADD_DECORATION ───────────────────────────────────────────────────────────

describe('AppStore – ADD_DECORATION dispatch', () => {
    test('adds the decoration to the target layer', () => {
        const store = new AppStore();
        const layer = makeLayer('l1');
        store.dispatch('LOAD_LAYOUT', makeLayout([layer]));

        const dec = { id: 'd1', name: 'Deco' };
        store.dispatch('ADD_DECORATION', { layerId: 'l1', decoration: dec });

        expect(layer.decorations.has('d1')).toBe(true);
        expect(store.getState().isDirty).toBe(true);
    });

    test('does nothing for unknown layerId', () => {
        const store = new AppStore();
        store.dispatch('LOAD_LAYOUT', makeLayout([makeLayer('l1')]));
        // should not throw
        store.dispatch('ADD_DECORATION', { layerId: 'unknown', decoration: { id: 'd1' } });
    });
});

// ─── DELETE_DECORATION ────────────────────────────────────────────────────────

describe('AppStore – DELETE_DECORATION dispatch', () => {
    test('removes the decoration from the target layer', () => {
        const store = new AppStore();
        const layer = makeLayer('l1');
        const dec = { id: 'd1' } as Decoration;
        layer.addDecoration(dec);
        store.dispatch('LOAD_LAYOUT', makeLayout([layer]));

        store.dispatch('DELETE_DECORATION', { layerId: 'l1', decorationId: 'd1' });

        expect(layer.decorations.has('d1')).toBe(false);
        expect(store.getState().isDirty).toBe(true);
    });
});

// ─── UPDATE_DECORATION ────────────────────────────────────────────────────────

describe('AppStore – UPDATE_DECORATION dispatch', () => {
    // test('updates x and y on an existing decoration', () => {
    //     const store = new AppStore();
    //     const layer = makeLayer('l1');
    //     const dec = { id: 'd1', x: 0, y: 0 } as Decoration;
    //     layer.addDecoration(dec);
    //     store.dispatch('LOAD_LAYOUT', makeLayout([layer]));

    //     store.dispatch('UPDATE_DECORATION', { layerId: 'l1', decoration: { id: 'd1', x: 10, y: 20 } });

    //     expect(dec.x).toBe(10);
    //     expect(dec.y).toBe(20);
    //     expect(store.getState().isDirty).toBe(true);
    // });

    test('does nothing when decoration not found in layer', () => {
        const store = new AppStore();
        store.dispatch('LOAD_LAYOUT', makeLayout([makeLayer('l1')]));
        // should not throw
        store.dispatch('UPDATE_DECORATION', { layerId: 'l1', decoration: { id: 'ghost', x: 1, y: 1 } });
    });
});

// ─── TOGGLE_LAYER_VISIBILITY ──────────────────────────────────────────────────

describe('AppStore – TOGGLE_LAYER_VISIBILITY dispatch', () => {
    test('updates isVisible on the target layer', () => {
        const store = new AppStore();
        const layer = makeLayer('l1', 'L1', true);
        store.dispatch('LOAD_LAYOUT', makeLayout([layer]));

        store.dispatch('TOGGLE_LAYER_VISIBILITY', { layerId: 'l1', isVisible: false });

        expect(layer.isVisible).toBe(false);
        expect(store.getState().isDirty).toBe(true);
    });
});

// ─── MOVE_DECORATIONS ─────────────────────────────────────────────────────────

describe('AppStore – MOVE_DECORATIONS dispatch', () => {
    test('refreshes layers from layout and marks dirty', () => {
        const store = new AppStore();
        const layer = makeLayer('l1');
        const layout = makeLayout([layer]);
        store.dispatch('LOAD_LAYOUT', layout);

        // Add a second layer directly to the layout to simulate domain update
        const newLayer = makeLayer('l2', 'Added via domain');
        layout.layers.set('l2', newLayer);

        store.dispatch('MOVE_DECORATIONS', {});

        expect(store.getState().layers).toHaveLength(2);
        expect(store.getState().isDirty).toBe(true);
    });

    test('still marks dirty when no layout', () => {
        const store = new AppStore();
        store.dispatch('MOVE_DECORATIONS', {});
        expect(store.getState().isDirty).toBe(true);
    });
});

// ─── DELETE_DECORATIONS ───────────────────────────────────────────────────────

describe('AppStore – DELETE_DECORATIONS dispatch', () => {
    test('refreshes layers from layout and marks dirty', () => {
        const store = new AppStore();
        const layer = makeLayer('l1');
        const layout = makeLayout([layer]);
        store.dispatch('LOAD_LAYOUT', layout);

        store.dispatch('DELETE_DECORATIONS', {});

        expect(store.getState().isDirty).toBe(true);
    });
});

// ─── SET_DIRTY ────────────────────────────────────────────────────────────────

describe('AppStore – SET_DIRTY dispatch', () => {
    test('sets isDirty to the given value', () => {
        const store = new AppStore();
        store.dispatch('LOAD_LAYOUT', makeLayout([makeLayer('l1')]));
        store.dispatch('SET_DIRTY', false);
        expect(store.getState().isDirty).toBe(false);

        store.dispatch('SET_DIRTY', true);
        expect(store.getState().isDirty).toBe(true);
    });
});

// ─── RESET ────────────────────────────────────────────────────────────────────

describe('AppStore – RESET dispatch', () => {
    test('clears all state back to initial values', () => {
        const store = new AppStore();
        store.dispatch('LOAD_LAYOUT', makeLayout([makeLayer('l1')]));
        store.dispatch('RESET');

        const state = store.getState();
        expect(state.layout).toBeNull();
        expect(state.layers).toHaveLength(0);
        expect(state.activeLayerId).toBeNull();
        expect(state.map).toBeNull();
        expect(state.mapType).toBeNull();
        expect(state.isDirty).toBe(false);
    });
});

// ─── getActiveLayer ───────────────────────────────────────────────────────────

describe('AppStore – getActiveLayer', () => {
    test('returns null when no layers loaded', () => {
        const store = new AppStore();
        expect(store.getActiveLayer()).toBeNull();
    });

    test('returns the active layer object', () => {
        const store = new AppStore();
        const layer = makeLayer('l1');
        store.dispatch('LOAD_LAYOUT', makeLayout([layer]));
        expect(store.getActiveLayer()).toBe(layer);
    });

    test('returns null when activeLayerId does not match any layer', () => {
        const store = new AppStore();
        store.dispatch('LOAD_LAYOUT', makeLayout([makeLayer('l1')]));
        store.dispatch('SET_ACTIVE_LAYER', 'nonexistent');
        expect(store.getActiveLayer()).toBeNull();
    });
});

// ─── getLayer ─────────────────────────────────────────────────────────────────

describe('AppStore – getLayer', () => {
    test('returns layer by id', () => {
        const store = new AppStore();
        const layer = makeLayer('l1');
        store.dispatch('LOAD_LAYOUT', makeLayout([layer]));
        expect(store.getLayer('l1')).toBe(layer);
    });

    test('returns null for unknown id', () => {
        const store = new AppStore();
        expect(store.getLayer('ghost')).toBeNull();
    });
});
