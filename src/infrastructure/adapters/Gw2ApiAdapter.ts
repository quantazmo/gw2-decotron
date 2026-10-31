/**
 * Gw2ApiAdapter
 * 
 * Wraps the low-level gw2api.js functions with error handling, retry logic, and timeouts.
 * Provides a cleaner interface for API operations with resilience features.
 */

interface Gw2ApiAdapterOptions {
    maxRetries?: number;
    timeout?: number;
    retryDelay?: number;
    baseUrl?: string;
}

export type Gw2CoordinatePair = [number, number];
export type Gw2CoordinateRect = [Gw2CoordinatePair, Gw2CoordinatePair];

export interface Gw2ApiMapData {
    id: number;
    name: string;
    continent_id: number;
    default_floor: number;
    floors?: number[];
    region_id: number;
    map_rect?: Gw2CoordinateRect;
}

export interface Gw2ApiHomesteadDecoration {
    id: number;
    name: string;
    icon?: string;
}

export interface Gw2ApiFloorMapData {
    continent_rect: Gw2CoordinateRect;
    map_rect: Gw2CoordinateRect;
    sectors?: Array<{ bounds?: Gw2CoordinatePair[] }> | Record<string, { bounds?: Gw2CoordinatePair[] }>;
}

export interface Gw2ApiMapFloorData {
    regions?: Record<number, { maps?: Record<number, Gw2ApiFloorMapData> }>;
}

export class Gw2ApiAdapter {
    private readonly maxRetries: number;
    private readonly timeout: number;
    private readonly retryDelay: number;
    private readonly baseUrl: string;

    constructor(options: Gw2ApiAdapterOptions = {}) {
        this.maxRetries = options.maxRetries || 3;
        this.timeout = options.timeout || 10000; // 10 seconds
        this.retryDelay = options.retryDelay || 1000; // 1 second
        this.baseUrl = options.baseUrl || 'https://api.guildwars2.com';
    }

    /**
     * Get map data from GW2 API
     * @param {number} mapId - The map ID
     * @returns {Promise<object|null>} Map data or null if not found
     * @throws {Error} If all retries fail
     */
    async getMap(mapId: number): Promise<Gw2ApiMapData | null> {
        return this._callWithRetry<Gw2ApiMapData>(`v2/maps/${mapId}`);
    }

    /**
     * Get continent data from GW2 API
     * @param {number} continentId - The continent ID
     * @returns {Promise<object|null>} Continent data or null if not found
     * @throws {Error} If all retries fail
     */
    async getContinent(continentId: number): Promise<unknown | null> {
        return this._callWithRetry(`v2/continents/${continentId}`);
    }

    /**
     * Get map floor data from GW2 API
     * @param {number} continentId - The continent ID
     * @param {number} floorId - The floor ID
     * @returns {Promise<object|null>} Floor data or null if not found
     * @throws {Error} If all retries fail
     */
    async getMapFloor(continentId: number, floorId: number): Promise<Gw2ApiMapFloorData | null> {
        return this._callWithRetry<Gw2ApiMapFloorData>(`v1/map_floor.json?continent_id=${continentId}&floor=${floorId}`);
    }

    /**
     * Get all available map IDs
     * @returns {Promise<number[]>} Array of map IDs
     * @throws {Error} If request fails
     */
    async getAllMapIds(): Promise<number[]> {
        try {
            const response = await this._fetchWithTimeout(`${this.baseUrl}/v2/maps`);
            if (!response.ok) {
                throw new Error(`API returned ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to get map IDs: ${message}`);
        }
    }

    /**
     * Get account homestead decorations (requires API key)
     * Uses access_token query parameter to avoid CORS preflight restrictions.
     * @param {string} apiKey - A valid GW2 API key with the homestead scope
     * @returns {Promise<Array<{id: number, count: number}>|null>} Array of decoration entries or null if not found
     * @throws {Error} If the request fails or the API key is unauthorized
     */
    async getAccountHomesteadDecorations(apiKey: string): Promise<Array<{ id: number; count: number }> | null> {
        return this._callWithRetry<Array<{ id: number; count: number }>>(
            `v2/account/homestead/decorations?access_token=${encodeURIComponent(apiKey)}`
        );
    }

    /**
     * Get public metadata for homestead decorations.
     * @param {number[]} ids - Decoration IDs to fetch
     * @param {string} lang - API language
     */
    async getHomesteadDecorations(ids: number[], lang = 'en'): Promise<Gw2ApiHomesteadDecoration[] | null> {
        const uniqueIds = [...new Set(ids.filter(Number.isSafeInteger))];
        if (uniqueIds.length === 0) return [];

        return this._callWithRetry<Gw2ApiHomesteadDecoration[]>(
            `v2/homestead/decorations?ids=${uniqueIds.join(',')}&lang=${encodeURIComponent(lang)}`
        );
    }

    /**
     * Check if the API is reachable
     * @returns {Promise<boolean>} True if API is reachable
     */
    async isHealthy() {
        try {
            await this._callWithRetry('v2/maps/38');
            return true;
        } catch (error) {
            return false;
        }
    }

    // Private helper methods

    /**
     * Call an API endpoint with retry logic and timeout
     * @private
     */
    async _callWithRetry<T = unknown>(endpoint: string, headers: HeadersInit = {}): Promise<T | null> {
        let lastError: unknown;

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                return await this._callApiEndpoint(endpoint, headers);
            } catch (error) {
                lastError = error;

                if (attempt < this.maxRetries) {
                    const delayMs = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
                    console.warn(
                        `API call failed (attempt ${attempt}/${this.maxRetries}), ` +
                        `retrying in ${delayMs}ms: ${error instanceof Error ? error.message : String(error)}`
                    );
                    await this._sleep(delayMs);
                }
            }
        }

        const message = lastError instanceof Error ? lastError.message : String(lastError);
        throw new Error(`API request failed after ${this.maxRetries} attempts: ${message}`);
    }

    /**
     * Make the actual API call
     * @private
     */
    async _callApiEndpoint<T = unknown>(endpoint: string, headers: HeadersInit = {}): Promise<T | null> {
        const response = await this._fetchWithTimeout(`${this.baseUrl}/${endpoint}`, headers);

        if (response.status === 404) {
            return null;
        }

        if (!response.ok) {
            throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Fetch with timeout
     * @private
     */
    _fetchWithTimeout(url: string, headers: HeadersInit = {}): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        return fetch(url, { signal: controller.signal, headers })
            .finally(() => clearTimeout(timeoutId))
            .catch((error: unknown) => {
                if (error instanceof Error && error.name === 'AbortError') {
                    throw new Error(`Request timeout after ${this.timeout}ms`);
                }
                throw error;
            });
    }

    /**
     * Sleep for a given number of milliseconds
     * @private
     */
    _sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default Gw2ApiAdapter;
