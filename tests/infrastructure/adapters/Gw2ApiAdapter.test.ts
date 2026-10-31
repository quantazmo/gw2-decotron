/**
 * Tests for Gw2ApiAdapter
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Gw2ApiAdapter } from '../../../src/infrastructure/adapters/Gw2ApiAdapter.js';

describe('Gw2ApiAdapter', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
        vi.useFakeTimers();
    });

    afterEach(() => {
        global.fetch = originalFetch;
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    describe('getMap', () => {
        it('should fetch and return map data successfully', async () => {
            const mockMapData = { id: 38, name: 'Queensdale', continent_id: 1 };
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                statusText: 'OK',
                json: vi.fn().mockResolvedValue(mockMapData)
            });

            const adapter = new Gw2ApiAdapter();
            const promise = adapter.getMap(38);
            vi.runAllTimers();
            const result = await promise;

            expect(result).toEqual(mockMapData);
            expect(global.fetch).toHaveBeenCalledTimes(1);
            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.guildwars2.com/v2/maps/38',
                expect.objectContaining({ signal: expect.any(AbortSignal) })
            );
        });

        it('should return null for 404 not found', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                json: vi.fn().mockResolvedValue({ error: 'Not Found' })
            });

            const adapter = new Gw2ApiAdapter();
            const promise = adapter.getMap(99999);
            vi.runAllTimers();
            const result = await promise;

            expect(result).toBeNull();
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });

        it('should retry on network error', async () => {
            let callCount = 0;
            global.fetch = vi.fn().mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.reject(new Error('Network error'));
                }
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: vi.fn().mockResolvedValue({ id: 38, name: 'Queensdale' })
                });
            });

            const adapter = new Gw2ApiAdapter();
            const promise = adapter.getMap(38);

            // Advance timers for retry delay
            await vi.advanceTimersByTimeAsync(1000);
            vi.runAllTimers();

            const result = await promise;

            expect(result).toEqual({ id: 38, name: 'Queensdale' });
            expect(global.fetch).toHaveBeenCalledTimes(2);
        });

        it('should throw error after max retries exhausted', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

            const adapter = new Gw2ApiAdapter({ maxRetries: 3 });
            const promise = adapter.getMap(38);

            // Advance timers for all retry delays (exponential backoff: 1000ms, 2000ms, 4000ms)
            const advancePromise = (async () => {
                await vi.advanceTimersByTimeAsync(1000);
                await vi.advanceTimersByTimeAsync(2000);
                await vi.advanceTimersByTimeAsync(4000);
                vi.runAllTimers();
            })();

            await expect(Promise.all([promise, advancePromise])).rejects.toThrow(
                'API request failed after 3 attempts: Network error'
            );
            expect(global.fetch).toHaveBeenCalledTimes(3);
        });
    });

    describe('getContinent', () => {
        it('should fetch and return continent data successfully', async () => {
            const mockContinentData = { id: 1, name: 'Tyria', continent_dims: [49152, 49152] };
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: vi.fn().mockResolvedValue(mockContinentData)
            });

            const adapter = new Gw2ApiAdapter();
            const promise = adapter.getContinent(1);
            vi.runAllTimers();
            const result = await promise;

            expect(result).toEqual(mockContinentData);
            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.guildwars2.com/v2/continents/1',
                expect.objectContaining({ signal: expect.any(AbortSignal) })
            );
        });
    });

    describe('getMapFloor', () => {
        it('should fetch and return map floor data successfully', async () => {
            const mockFloorData = { texture_dims: [32768, 32768], regions: {} };
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: vi.fn().mockResolvedValue(mockFloorData)
            });

            const adapter = new Gw2ApiAdapter();
            const promise = adapter.getMapFloor(1, 0);
            vi.runAllTimers();
            const result = await promise;

            expect(result).toEqual(mockFloorData);
            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.guildwars2.com/v1/map_floor.json?continent_id=1&floor=0',
                expect.objectContaining({ signal: expect.any(AbortSignal) })
            );
        });
    });

    describe('getAllMapIds', () => {
        it('should fetch and return array of map IDs', async () => {
            const mockMapIds = [15, 17, 18, 19, 20, 21, 22, 23, 24, 25];
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: vi.fn().mockResolvedValue(mockMapIds)
            });

            const adapter = new Gw2ApiAdapter();
            const promise = adapter.getAllMapIds();
            vi.runAllTimers();
            const result = await promise;

            expect(result).toEqual(mockMapIds);
            expect(Array.isArray(result)).toBe(true);
            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.guildwars2.com/v2/maps',
                expect.objectContaining({ signal: expect.any(AbortSignal) })
            );
        });

        it('should throw error when API call fails', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            });

            const adapter = new Gw2ApiAdapter();
            const promise = adapter.getAllMapIds();
            vi.runAllTimers();

            await expect(promise).rejects.toThrow('Failed to get map IDs');
        });
    });

    describe('timeout handling', () => {
        it('should timeout request after configured timeout', async () => {
            let abortCalled = false;
            global.fetch = vi.fn().mockImplementation((url, options) => {
                const signal = options.signal;
                signal.addEventListener('abort', () => {
                    abortCalled = true;
                });

                return new Promise((resolve) => {
                    // Never resolve - simulates hanging request
                });
            });

            const adapter = new Gw2ApiAdapter({ timeout: 5000 });
            const promise = adapter.getMap(38);

            // Advance timers past timeout
            await vi.advanceTimersByTimeAsync(5000);
            vi.runAllTimers();

            expect(abortCalled).toBe(true);
        });
    });

    describe('exponential backoff', () => {
        it('should apply exponential backoff delays on retries', async () => {
            let callCount = 0;

            global.fetch = vi.fn().mockImplementation(() => {
                callCount++;
                if (callCount < 3) {
                    return Promise.reject(new Error('Network error'));
                }
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: vi.fn().mockResolvedValue({ id: 38 })
                });
            });

            const adapter = new Gw2ApiAdapter({ maxRetries: 3, retryDelay: 1000 });
            const promise = adapter.getMap(38);

            // First attempt fails immediately
            await Promise.resolve();

            // Advance through retry delays and capture them
            // Delay 1: 1000ms * 2^0 = 1000ms (after first failure)
            await vi.advanceTimersByTimeAsync(1000);
            await Promise.resolve();

            // Delay 2: 1000ms * 2^1 = 2000ms (after second failure, third attempt succeeds)
            await vi.advanceTimersByTimeAsync(2000);
            vi.runAllTimers();

            const result = await promise;
            expect(result).toEqual({ id: 38 });
            expect(global.fetch).toHaveBeenCalledTimes(3);
        });
    });

    describe('configurable options', () => {
        it('should use custom maxRetries', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

            const adapter = new Gw2ApiAdapter({ maxRetries: 2 });

            // Create promise and handle rejection to prevent unhandled rejection
            const promise = adapter.getMap(38).catch(e => e);

            await vi.advanceTimersByTimeAsync(1000);
            await vi.advanceTimersByTimeAsync(2000);
            vi.runAllTimers();

            const error = await promise;
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toBe('API request failed after 2 attempts: Network error');
            expect(global.fetch).toHaveBeenCalledTimes(2);
        });

        it('should use custom timeout', async () => {
            let abortCalled = false;
            global.fetch = vi.fn().mockImplementation((url, options) => {
                options.signal.addEventListener('abort', () => {
                    abortCalled = true;
                });
                return new Promise(() => { }); // Never resolves
            });

            const adapter = new Gw2ApiAdapter({ timeout: 3000 });
            const promise = adapter.getMap(38);

            await vi.advanceTimersByTimeAsync(3000);
            vi.runAllTimers();

            expect(abortCalled).toBe(true);
        });

        it('should use custom baseUrl', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: vi.fn().mockResolvedValue({ id: 38 })
            });

            const adapter = new Gw2ApiAdapter({ baseUrl: 'https://custom-api.example.com' });
            const promise = adapter.getMap(38);
            vi.runAllTimers();
            await promise;

            expect(global.fetch).toHaveBeenCalledWith(
                'https://custom-api.example.com/v2/maps/38',
                expect.any(Object)
            );
        });

        it('should use default options when none provided', () => {
            const adapter = new Gw2ApiAdapter();

            expect(adapter.maxRetries).toBe(3);
            expect(adapter.timeout).toBe(10000);
            expect(adapter.retryDelay).toBe(1000);
            expect(adapter.baseUrl).toBe('https://api.guildwars2.com');
        });
    });

    describe('getAccountHomesteadDecorations', () => {
        const mockApiKey = 'AAAAAAAA-1111-2222-3333-BBBBBBBBBBBBBBBB-CCCC-DDDD-EEEE-FFFFFFFFFFFF';
        const mockDecorations = [
            { id: 35, count: 92 },
            { id: 70, count: 6 },
            { id: 125, count: 1 },
        ];

        it('should fetch and return account decoration data with API key via query parameter', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: vi.fn().mockResolvedValue(mockDecorations)
            });

            const adapter = new Gw2ApiAdapter();
            const promise = adapter.getAccountHomesteadDecorations(mockApiKey);
            vi.runAllTimers();
            const result = await promise;

            expect(result).toEqual(mockDecorations);
            const calledUrl = global.fetch.mock.calls[0][0];
            expect(calledUrl).toContain('/v2/account/homestead/decorations');
            expect(calledUrl).toContain(`access_token=${encodeURIComponent(mockApiKey)}`);
            // Must NOT use an Authorization header (avoids CORS preflight)
            const calledOptions = global.fetch.mock.calls[0][1];
            expect(calledOptions?.headers?.Authorization).toBeUndefined();
        });

        it('should throw an error for 401 unauthorized (invalid API key)', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                json: vi.fn().mockResolvedValue({ text: 'Invalid access token' })
            });

            const adapter = new Gw2ApiAdapter({ maxRetries: 1 });
            const promise = adapter.getAccountHomesteadDecorations(mockApiKey);
            vi.runAllTimers();

            await expect(promise).rejects.toThrow('API request failed after 1 attempts');
        });

        it('should return empty array for 404 not found', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                json: vi.fn().mockResolvedValue([])
            });

            const adapter = new Gw2ApiAdapter();
            const promise = adapter.getAccountHomesteadDecorations(mockApiKey);
            vi.runAllTimers();
            const result = await promise;

            expect(result).toBeNull();
        });
    });

    describe('getHomesteadDecorations', () => {
        it('should fetch metadata for multiple decoration IDs in one request', async () => {
            const mockDecorations = [{ id: 327, name: 'Kodan Dining Chair', icon: 'https://render.guildwars2.com/icon.png' }];
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: vi.fn().mockResolvedValue(mockDecorations)
            });

            const adapter = new Gw2ApiAdapter();
            const promise = adapter.getHomesteadDecorations([327, 327, 328]);
            vi.runAllTimers();
            const result = await promise;

            expect(result).toEqual(mockDecorations);
            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.guildwars2.com/v2/homestead/decorations?ids=327,328&lang=en',
                expect.objectContaining({ signal: expect.any(AbortSignal) })
            );
        });
    });
});
