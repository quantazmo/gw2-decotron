import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createZoomHandler } from '../../src/ui/ZoomHandler.js';

function makeMockZoomStore(minZoom = 0.1, maxZoom = 10) {
    let limits = { min: minZoom, max: maxZoom };
    return {
        setZoomLimitsCalls: [],
        setZoomLimits(min, max) { limits = { min, max }; this.setZoomLimitsCalls.push([min, max]); },
        getZoomLimits() { return limits; },
    };
}

function makeSvgElement() {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    return el;
}

describe('createZoomHandler', () => {
    let svgEl;
    let zoomStore;
    let handler;

    beforeEach(() => {
        svgEl = makeSvgElement();
        zoomStore = makeMockZoomStore();
        handler = createZoomHandler(svgEl, zoomStore);
    });

    afterEach(() => {
        handler.destroy();
    });

    describe('initialization', () => {
        it('calls setZoomLimits with defaults', () => {
            expect(zoomStore.setZoomLimitsCalls.length).toBeGreaterThan(0);
        });

        it('sets cursor to grab on SVG', () => {
            expect(svgEl.style.cursor).toBe('grab');
        });

        it('returns a handler with expected methods', () => {
            expect(typeof handler.on).toBe('function');
            expect(typeof handler.getTransform).toBe('function');
            expect(typeof handler.reset).toBe('function');
            expect(typeof handler.setTransform).toBe('function');
            expect(typeof handler.destroy).toBe('function');
        });
    });

    describe('getTransform', () => {
        it('returns initial identity transform', () => {
            expect(handler.getTransform()).toEqual({ k: 1, x: 0, y: 0 });
        });

        it('returns a copy (not reference)', () => {
            const t1 = handler.getTransform();
            const t2 = handler.getTransform();
            expect(t1).not.toBe(t2);
        });
    });

    describe('transform property', () => {
        it('exposes transform with k, x, y', () => {
            const t = handler.transform;
            expect(t.k).toBe(1);
            expect(t.x).toBe(0);
            expect(t.y).toBe(0);
        });

        it('transform has rescaleX method', () => {
            expect(typeof handler.transform.rescaleX).toBe('function');
        });

        it('transform has rescaleY method', () => {
            expect(typeof handler.transform.rescaleY).toBe('function');
        });

        it('rescaleX returns non-function input unchanged', () => {
            expect(handler.transform.rescaleX(null)).toBeNull();
        });

        it('rescaleY returns non-function input unchanged', () => {
            expect(handler.transform.rescaleY(null)).toBeNull();
        });

        it('rescaleX calls copy().domain() on a scale function', () => {
            let copyCalled = false;
            const domainResult = { domain: () => domainResult };
            const mockScale = function () { };
            mockScale.domain = () => [0, 100];
            mockScale.range = () => [0, 800];
            mockScale.copy = () => { copyCalled = true; return domainResult; };
            handler.transform.rescaleX(mockScale);
            expect(copyCalled).toBe(true);
        });

        it('rescaleY calls copy().domain() on a scale function', () => {
            let copyCalled = false;
            const domainResult = { domain: () => domainResult };
            const mockScale = function () { };
            mockScale.domain = () => [0, 100];
            mockScale.range = () => [0, 600];
            mockScale.copy = () => { copyCalled = true; return domainResult; };
            handler.transform.rescaleY(mockScale);
            expect(copyCalled).toBe(true);
        });
    });

    describe('reset', () => {
        it('resets transform to identity', () => {
            handler.setTransform({ k: 2, x: 50, y: 30 });
            handler.reset();
            expect(handler.getTransform()).toEqual({ k: 1, x: 0, y: 0 });
        });

        it('notifies zoom callbacks on reset', () => {
            const cb = vi.fn();
            handler.on('zoom', cb);
            handler.reset();
            expect(cb).toHaveBeenCalled();
        });
    });

    describe('setTransform', () => {
        it('sets transform values', () => {
            handler.setTransform({ k: 3, x: 10, y: 20 });
            expect(handler.getTransform()).toEqual({ k: 3, x: 10, y: 20 });
        });

        it('clamps zoom to store max limits', () => {
            handler.setTransform({ k: 100, x: 0, y: 0 });
            expect(handler.getTransform().k).toBe(30); // ZOOM.MAX_LEVEL
        });

        it('clamps zoom to store min limit', () => {
            handler.setTransform({ k: 0.0001, x: 0, y: 0 });
            expect(handler.getTransform().k).toBe(1.0); // ZOOM.MIN_LEVEL
        });

        it('defaults x and y to 0 if not provided', () => {
            handler.setTransform({ k: 2 });
            expect(handler.getTransform()).toEqual({ k: 2, x: 0, y: 0 });
        });

        it('throws for invalid transform (no k)', () => {
            expect(() => handler.setTransform({ x: 0, y: 0 })).toThrow();
        });

        it('throws for null transform', () => {
            expect(() => handler.setTransform(null)).toThrow();
        });

        it('notifies zoom callbacks', () => {
            const cb = vi.fn();
            handler.on('zoom', cb);
            handler.setTransform({ k: 2, x: 5, y: 5 });
            expect(cb).toHaveBeenCalled();
        });
    });

    describe('on / callbacks', () => {
        it('registers zoom callback', () => {
            const cb = vi.fn();
            handler.on('zoom', cb);
            handler.reset();
            expect(cb).toHaveBeenCalledTimes(1);
        });

        it('does not register duplicate callbacks', () => {
            const cb = vi.fn();
            handler.on('zoom', cb);
            handler.on('zoom', cb);
            handler.reset();
            expect(cb).toHaveBeenCalledTimes(1);
        });

        it('ignores unknown event types', () => {
            expect(() => handler.on('unknown', vi.fn())).not.toThrow();
        });

        it('returns this for chaining', () => {
            expect(handler.on('zoom', vi.fn())).toBe(handler);
        });

        it('calls multiple callbacks', () => {
            const cb1 = vi.fn();
            const cb2 = vi.fn();
            handler.on('zoom', cb1);
            handler.on('zoom', cb2);
            handler.reset();
            expect(cb1).toHaveBeenCalled();
            expect(cb2).toHaveBeenCalled();
        });

        it('catches errors in callbacks without throwing', () => {
            handler.on('zoom', () => { throw new Error('test error'); });
            expect(() => handler.reset()).not.toThrow();
        });
    });

    describe('eventBus integration', () => {
        it('publishes zoom:changed when eventBus provided', () => {
            const publishCalls = [];
            const mockEventBus = { publish: (ev, data) => publishCalls.push({ ev, data }) };
            handler.destroy();
            handler = createZoomHandler(svgEl, zoomStore, { eventBus: mockEventBus });
            handler.reset();
            expect(publishCalls.length).toBeGreaterThan(0);
            expect(publishCalls[0].ev).toBe('zoom:changed');
            expect(publishCalls[0].data).toMatchObject({ scale: 1, translateX: 0, translateY: 0 });
        });
    });

    describe('wheel zoom', () => {
        it('blocks user zoom and pan while interactions are disabled but allows programmatic transforms', () => {
            handler.setTransform({ k: 2, x: 10, y: 20 });
            handler.setInteractionsEnabled(false);

            svgEl.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 400, clientY: 300, bubbles: true, cancelable: true }));
            svgEl.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 }));
            document.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 150, clientY: 130 }));
            expect(handler.getTransform()).toEqual({ k: 2, x: 10, y: 20 });

            handler.setTransform({ k: 3, x: 15, y: 25 });
            expect(handler.getTransform()).toEqual({ k: 3, x: 15, y: 25 });

            handler.setInteractionsEnabled(true);
            expect(svgEl.style.cursor).toBe('grab');
        });

        it('zooms in on negative deltaY', () => {
            const wheelEvt = new WheelEvent('wheel', { deltaY: -100, clientX: 400, clientY: 300, bubbles: true, cancelable: true });
            svgEl.dispatchEvent(wheelEvt);
            expect(handler.getTransform().k).toBeGreaterThan(1);
        });

        it('zooms out on positive deltaY', () => {
            handler.setTransform({ k: 5, x: 0, y: 0 });
            const wheelEvt = new WheelEvent('wheel', { deltaY: 100, clientX: 400, clientY: 300, bubbles: true, cancelable: true });
            svgEl.dispatchEvent(wheelEvt);
            expect(handler.getTransform().k).toBeLessThan(5);
        });

        it('does not exceed maxZoom', () => {
            handler.setTransform({ k: 30, x: 0, y: 0 }); // ZOOM.MAX_LEVEL
            const wheelEvt = new WheelEvent('wheel', { deltaY: -100, clientX: 0, clientY: 0, bubbles: true, cancelable: true });
            svgEl.dispatchEvent(wheelEvt);
            expect(handler.getTransform().k).toBeLessThanOrEqual(30);
        });

        it('does not go below minZoom', () => {
            handler.setTransform({ k: 1.0, x: 0, y: 0 });
            const wheelEvt = new WheelEvent('wheel', { deltaY: 100, clientX: 0, clientY: 0, bubbles: true, cancelable: true });
            svgEl.dispatchEvent(wheelEvt);
            expect(handler.getTransform().k).toBeGreaterThanOrEqual(1.0);
        });
    });

    describe('mouse pan', () => {
        it('starts panning on mousedown (button 0)', () => {
            svgEl.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 }));
            expect(svgEl.style.cursor).toBe('grabbing');
        });

        it('starts panning on mousedown (button 1)', () => {
            svgEl.dispatchEvent(new MouseEvent('mousedown', { button: 1, clientX: 100, clientY: 100 }));
            expect(svgEl.style.cursor).toBe('grabbing');
        });

        it('does not pan on other mouse buttons', () => {
            svgEl.dispatchEvent(new MouseEvent('mousedown', { button: 2, clientX: 100, clientY: 100 }));
            expect(svgEl.style.cursor).toBe('grab');
        });

        it('updates transform on mousemove while panning', () => {
            svgEl.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 }));
            document.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 130 }));
            const t = handler.getTransform();
            expect(t.x).toBe(50);
            expect(t.y).toBe(30);
        });

        it('does not update on mousemove if not panning', () => {
            document.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 130 }));
            expect(handler.getTransform()).toEqual({ k: 1, x: 0, y: 0 });
        });

        it('stops panning on mouseup', () => {
            svgEl.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 }));
            document.dispatchEvent(new MouseEvent('mouseup'));
            expect(svgEl.style.cursor).toBe('grab');
        });

        it('mouseup when not panning does nothing', () => {
            expect(() => document.dispatchEvent(new MouseEvent('mouseup'))).not.toThrow();
        });
    });

    describe('destroy', () => {
        it('removes event listeners and resets cursor', () => {
            handler.destroy();
            expect(svgEl.style.cursor).toBe('');

            // Wheel event should no longer trigger zoom after destroy
            handler.setTransform({ k: 1, x: 0, y: 0 });
            const cb = vi.fn();
            handler.on('zoom', cb);
            svgEl.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 0, clientY: 0 }));
            expect(cb).not.toHaveBeenCalled();
        });

        it('cancels pending animation frame when wheel fires during pan', () => {
            // Start panning (creates pending rAF on first mousemove)
            svgEl.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 }));
            document.dispatchEvent(new MouseEvent('mousemove', { clientX: 120, clientY: 110 }));
            // Now fire wheel — should cancel the pending animation frame
            const wheelEvt = new WheelEvent('wheel', { deltaY: -100, clientX: 400, clientY: 300, bubbles: true, cancelable: true });
            expect(() => svgEl.dispatchEvent(wheelEvt)).not.toThrow();
        });

        it('calls requestAnimationFrame callback on mousemove', () => {
            let rafCallback = null;
            const origRaf = global.requestAnimationFrame;
            global.requestAnimationFrame = (cb) => { rafCallback = cb; return 1; };
            global.cancelAnimationFrame = () => { };

            svgEl.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 }));
            document.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 130 }));

            expect(rafCallback).not.toBeNull();
            const cb = vi.fn();
            handler.on('zoom', cb);
            rafCallback(); // Execute the rAF callback
            expect(cb).toHaveBeenCalled();

            global.requestAnimationFrame = origRaf;
        });

        it('cancels pending animation frame on mouseup during pan', () => {
            let cancelledId = null;
            const origRaf = global.requestAnimationFrame;
            global.requestAnimationFrame = (cb) => 42;
            global.cancelAnimationFrame = (id) => { cancelledId = id; };

            svgEl.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 }));
            document.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 130 }));
            document.dispatchEvent(new MouseEvent('mouseup'));

            expect(cancelledId).toBe(42);
            global.requestAnimationFrame = origRaf;
        });
    });

    describe('custom zoom limits', () => {
        it('uses custom min/max zoom from options', () => {
            handler.destroy();
            const calls = zoomStore.setZoomLimitsCalls.length;
            handler = createZoomHandler(svgEl, zoomStore, { minZoom: 0.5, maxZoom: 5 });
            const lastCall = zoomStore.setZoomLimitsCalls[zoomStore.setZoomLimitsCalls.length - 1];
            expect(lastCall).toEqual([0.5, 5]);
        });
    });
});
