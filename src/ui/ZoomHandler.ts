/**
 * ZoomHandler - Manages zoom/pan interactions using native events
 * Integrates with ZoomStore for state management
 */
import { ZOOM } from '../config/constants.js';
import { ZoomScale, ZoomStore } from './stores/ZoomStore.ts';

type PanZoomTransform = { k: number; x: number; y: number };
type ZoomCallbackTransform = PanZoomTransform & {
    rescaleX(baseScale: ZoomScale): ZoomScale;
    rescaleY(baseScale: ZoomScale): ZoomScale;
};
type ZoomHandlerOptions = {
    minZoom?: number;
    maxZoom?: number;
    eventBus?: { publish(eventType: string, data: unknown): void } | null;
};
type ZoomHandlerApi = {
    on(eventType: 'zoom', callback: (transform: ZoomCallbackTransform) => void): ZoomHandlerApi;
    getTransform(): PanZoomTransform;
    reset(): void;
    setTransform(transform: Partial<PanZoomTransform> & Pick<PanZoomTransform, 'k'>): void;
    setInteractionsEnabled(enabled: boolean): void;
    destroy(): void;
    transform: ZoomCallbackTransform;
};

/**
 * Creates a zoom/pan handler using native mouse and wheel events
 * Integrates with the refactored architecture (ZoomStore, EventBus)
 * 
 * @param {SVGElement} svgElement - The SVG element to attach zoom listeners to
 * @param {Object} zoomStore - ZoomStore instance for state management
 * @param {Object} options - Configuration options
 * @param {number} [options.minZoom] - Minimum zoom level (scale factor)
 * @param {number} [options.maxZoom] - Maximum zoom level (scale factor)
 * @param {Object} [options.eventBus] - EventBus for publishing zoom events
 * @returns {Object} Zoom handler object with methods and properties
 */
export function createZoomHandler(svgElement: SVGElement, zoomStore: ZoomStore, options: ZoomHandlerOptions = {}): ZoomHandlerApi {
    const {
        minZoom = ZOOM.MIN_LEVEL,
        maxZoom = ZOOM.MAX_LEVEL,
        eventBus = null
    } = options;

    // Set zoom limits in the store
    zoomStore.setZoomLimits(minZoom, maxZoom);

    // Current transform state (scale and translation)
    let transform: PanZoomTransform = {
        k: 1,      // scale factor
        x: 0,      // x translation
        y: 0       // y translation
    };

    // Pan state
    let isPanning = false;
    let interactionsEnabled = true;
    let cursorBeforeLock = '';
    let panStartX = 0;
    let panStartY = 0;
    let panStartTransformX = 0;
    let panStartTransformY = 0;

    // Throttling for updates
    let pendingUpdate = false;
    let pendingAnimationFrame: number | null = null;

    // Callbacks for zoom events
    const callbacks: {
        zoom: Array<(transform: ZoomCallbackTransform) => void>;
    } = {
        zoom: []
    };

    /**
     * Create a transform object with rescale methods attached
     * This is needed for compatibility with the zoom callback API
     * @returns {Object} Transform object with k, x, y and rescaleX/rescaleY methods
     */
    function createTransformObject(): ZoomCallbackTransform {
        return {
            k: transform.k,
            x: transform.x,
            y: transform.y,
            rescaleX(baseScale: ZoomScale) {
                // Apply zoom transform to rescale the x-axis
                // Goal: compute what data domain is visible after zoom/pan
                if (!baseScale || typeof baseScale !== 'function') {
                    return baseScale;
                }

                const domain = baseScale.domain();
                const range = baseScale.range();
                const k = transform.k;
                const x = transform.x;

                // For each edge of the visible screen range, compute what data value it corresponds to:
                // 1. Apply inverse zoom transform to get base screen coordinate
                // 2. Invert through base scale to get data coordinate

                const rangeMin = range[0];
                const rangeMax = range[1];
                const domainMin = domain[0];
                const domainMax = domain[1];

                // Inverse zoom: base_screen = (zoomed_screen - pan) / scale
                const baseScreenMin = (rangeMin - x) / k;
                const baseScreenMax = (rangeMax - x) / k;

                // Invert through scale: data = domainMin + (screen - rangeMin) / rangeSpan * domainSpan
                const rangeSpan = rangeMax - rangeMin;
                const domainSpan = domainMax - domainMin;

                const newDomainMin = domainMin + (baseScreenMin - rangeMin) / rangeSpan * domainSpan;
                const newDomainMax = domainMin + (baseScreenMax - rangeMin) / rangeSpan * domainSpan;

                // Create new scale with the computed domain and SAME range
                return baseScale.copy().domain([newDomainMin, newDomainMax]);
            },
            rescaleY(baseScale: ZoomScale) {
                // Apply zoom transform to rescale the y-axis
                if (!baseScale || typeof baseScale !== 'function') {
                    return baseScale;
                }

                const domain = baseScale.domain();
                const range = baseScale.range();
                const k = transform.k;
                const y = transform.y;

                const rangeMin = range[0];
                const rangeMax = range[1];
                const domainMin = domain[0];
                const domainMax = domain[1];

                const baseScreenMin = (rangeMin - y) / k;
                const baseScreenMax = (rangeMax - y) / k;

                const rangeSpan = rangeMax - rangeMin;
                const domainSpan = domainMax - domainMin;

                const newDomainMin = domainMin + (baseScreenMin - rangeMin) / rangeSpan * domainSpan;
                const newDomainMax = domainMin + (baseScreenMax - rangeMin) / rangeSpan * domainSpan;

                return baseScale.copy().domain([newDomainMin, newDomainMax]);
            }
        };
    }

    /**
     * Notify all registered callbacks of transform change
     */
    function notifyZoomChange(): void {
        const transformObj = createTransformObject();

        callbacks.zoom.forEach(callback => {
            try {
                callback(transformObj);
            } catch (error) {
                console.error('Error in zoom callback:', error);
            }
        });

        // Publish event through EventBus if available
        if (eventBus) {
            eventBus.publish('zoom:changed', {
                scale: transform.k,
                translateX: transform.x,
                translateY: transform.y
            });
        }
    }

    /**
     * Handle wheel scroll zoom events
     * @param {WheelEvent} e - The wheel event
     */
    function handleWheel(e: WheelEvent): void {
        e.preventDefault();
        if (!interactionsEnabled) return;

        // Calculate zoom delta from wheel event
        const zoomFactor = ZOOM.WHEEL_FACTOR;
        const isZoomingIn = e.deltaY < 0;
        const newZoom = isZoomingIn ? transform.k * zoomFactor : transform.k / zoomFactor;

        // Apply zoom limits
        const limits = zoomStore.getZoomLimits();
        const constrainedZoom = Math.max(limits.min, Math.min(limits.max, newZoom));

        if (constrainedZoom === transform.k) {
            return; // No change
        }

        // Get mouse position relative to SVG viewport
        const rect = svgElement.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Calculate new pan to keep point under mouse stationary
        // Formula from D3 zoom: newPan = mousePos - (mousePos - currentPan) * zoomRatio
        const zoomRatio = constrainedZoom / transform.k;
        const newX = mouseX - (mouseX - transform.x) * zoomRatio;
        const newY = mouseY - (mouseY - transform.y) * zoomRatio;

        // Update transform
        transform = {
            k: constrainedZoom,
            x: newX,
            y: newY
        };

        // Cancel any pending pan updates before notifying of zoom change
        if (pendingAnimationFrame !== null) {
            cancelAnimationFrame(pendingAnimationFrame);
            pendingAnimationFrame = null;
            pendingUpdate = false;
        }

        // Notify immediately for responsive zoom feedback
        notifyZoomChange();
    }

    /**
     * Handle mouse down to start panning
     * @param {MouseEvent} e - The mouse event
     */
    function handleMouseDown(e: MouseEvent): void {
        if (!interactionsEnabled) return;
        // Only respond to left (0) and middle (1) mouse buttons
        if (e.button !== 0 && e.button !== 1) {
            return;
        }

        isPanning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        panStartTransformX = transform.x;
        panStartTransformY = transform.y;

        // Add cursor style for panning
        svgElement.style.cursor = 'grabbing';
    }

    /**
     * Handle mouse move for panning
     * @param {MouseEvent} e - The mouse event
     */
    function handleMouseMove(e: MouseEvent): void {
        if (!interactionsEnabled || !isPanning) return;

        const deltaX = e.clientX - panStartX;
        const deltaY = e.clientY - panStartY;

        // Update transform with new pan offset - scale must remain constant
        transform = {
            k: transform.k,  // Keep scale constant during pan
            x: panStartTransformX + deltaX,
            y: panStartTransformY + deltaY
        };

        // Throttle updates using requestAnimationFrame to avoid excessive redraws
        if (!pendingUpdate) {
            pendingUpdate = true;
            pendingAnimationFrame = requestAnimationFrame(() => {
                pendingAnimationFrame = null;
                pendingUpdate = false;
                notifyZoomChange();
            });
        }
    }

    /**
     * Handle mouse up to stop panning
     */
    function handleMouseUp(): void {
        if (isPanning) {
            isPanning = false;
            svgElement.style.cursor = 'grab';

            // Cancel any pending throttled update and ensure final position is applied
            if (pendingAnimationFrame !== null) {
                cancelAnimationFrame(pendingAnimationFrame);
                pendingAnimationFrame = null;
                pendingUpdate = false;
            }

            // Ensure final transform is applied
            notifyZoomChange();
        }
    }

    // Attach event listeners
    svgElement.addEventListener('wheel', handleWheel, { passive: false });
    svgElement.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Set cursor style
    svgElement.style.cursor = 'grab';

    // Return the zoom handler API
    const handler: Omit<ZoomHandlerApi, 'transform'> = {
        /**
         * Register a callback for zoom/pan events
         * @param {string} eventType - The event type ('zoom')
         * @param {Function} callback - Function to call with (transform) argument
         * @returns {this}
         */
        on(eventType: 'zoom', callback: (transform: ZoomCallbackTransform) => void): ZoomHandlerApi {
            if (eventType === 'zoom' && !callbacks.zoom.includes(callback)) {
                callbacks.zoom.push(callback);
            }
            return handler as ZoomHandlerApi;
        },

        /**
         * Get the current zoom transform state
         * @returns {Object} Transform with k (scale), x, y (translation)
         */
        getTransform(): PanZoomTransform {
            return { ...transform };
        },

        /**
         * Reset zoom to identity transform (no zoom/pan)
         */
        reset(): void {
            transform = {
                k: 1,
                x: 0,
                y: 0
            };
            notifyZoomChange();
        },

        setInteractionsEnabled(enabled: boolean): void {
            if (!enabled) cursorBeforeLock = svgElement.style.cursor;
            interactionsEnabled = enabled;
            if (!enabled && isPanning) {
                isPanning = false;
                if (pendingAnimationFrame !== null) {
                    cancelAnimationFrame(pendingAnimationFrame);
                    pendingAnimationFrame = null;
                    pendingUpdate = false;
                }
            }
            svgElement.style.cursor = enabled ? cursorBeforeLock : 'not-allowed';
            if (enabled) cursorBeforeLock = '';
        },

        /**
         * Set transform programmatically
         * @param {Object} newTransform - Transform with k, x, y properties
         */
        setTransform(newTransform: Partial<PanZoomTransform> & Pick<PanZoomTransform, 'k'>): void {
            if (!newTransform || typeof newTransform.k !== 'number') {
                throw new Error('Invalid transform: must have k, x, y properties');
            }

            const limits = zoomStore.getZoomLimits();
            transform = {
                k: Math.max(limits.min, Math.min(limits.max, newTransform.k)),
                x: newTransform.x || 0,
                y: newTransform.y || 0
            };
            notifyZoomChange();
        },

        /**
         * Cleanup - remove event listeners
         */
        destroy(): void {
            // Cancel any pending animation frames
            if (pendingAnimationFrame !== null) {
                cancelAnimationFrame(pendingAnimationFrame);
                pendingAnimationFrame = null;
                pendingUpdate = false;
            }

            svgElement.removeEventListener('wheel', handleWheel);
            svgElement.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            svgElement.style.cursor = '';
        }
    };

    // Add a readonly transform property that uses createTransformObject
    Object.defineProperty(handler, 'transform', {
        get() {
            return createTransformObject();
        }
    });

    return handler as ZoomHandlerApi;
}

export default createZoomHandler;
