export type LassoPoint = { x: number; y: number };

export class SelectionLasso {
    private _svg: SVGSVGElement;
    private _path: SVGPathElement | null;
    private _points: LassoPoint[];
    private _active: boolean;

    constructor(svgElement: SVGSVGElement) {
        this._svg = svgElement;
        this._path = null;
        this._points = [];
        this._active = false;
    }

    start(x: number, y: number): void {
        this._points = [{ x, y }];
        this._active = true;

        if (!this._path) {
            this._path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            this._path.classList.add('selection-lasso');
            this._path.setAttribute('pointer-events', 'none');
        }

        this._path.setAttribute('d', `M ${x} ${y}`);
        if (!this._path.parentNode) this._svg.appendChild(this._path);
    }

    update(x: number, y: number): void {
        if (!this._active) return;
        const lastPoint = this._points[this._points.length - 1];
        if (!lastPoint || Math.hypot(x - lastPoint.x, y - lastPoint.y) < 2) return;

        this._points.push({ x, y });
        this._path?.setAttribute('d', this._points.map((point, index) =>
            `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
        ).join(' '));
    }

    finish(): LassoPoint[] | null {
        if (!this._active) return null;
        this._active = false;
        const points = this._points.length >= 3 ? [...this._points] : null;
        this._points = [];
        this._path?.remove();
        return points;
    }

    isActive(): boolean {
        return this._active;
    }

    getDecorationsInPolygon(points: LassoPoint[], decorationCircles: Map<string, SVGCircleElement>): string[] {
        if (points.length < 3) return [];
        const result: string[] = [];

        for (const [id, circle] of decorationCircles) {
            const x = parseFloat(circle.getAttribute('cx') ?? 'NaN');
            const y = parseFloat(circle.getAttribute('cy') ?? 'NaN');
            if (Number.isFinite(x) && Number.isFinite(y) && this._containsPoint(points, { x, y })) {
                result.push(id);
            }
        }
        return result;
    }

    private _containsPoint(polygon: LassoPoint[], point: LassoPoint): boolean {
        let inside = false;
        for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
            const current = polygon[index];
            const prior = polygon[previous];
            const cross = (point.x - prior.x) * (current.y - prior.y) -
                (point.y - prior.y) * (current.x - prior.x);
            if (Math.abs(cross) < 0.001 &&
                point.x >= Math.min(prior.x, current.x) && point.x <= Math.max(prior.x, current.x) &&
                point.y >= Math.min(prior.y, current.y) && point.y <= Math.max(prior.y, current.y)) {
                return true;
            }

            const intersects = (current.y > point.y) !== (prior.y > point.y) &&
                point.x < (prior.x - current.x) * (point.y - current.y) / (prior.y - current.y) + current.x;
            if (intersects) inside = !inside;
        }
        return inside;
    }
}