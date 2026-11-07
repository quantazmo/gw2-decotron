/**
 * Additional tests for SettingsRepository — targeting uncovered error paths.
 * Covers: save catch/warn, clear catch/warn, load getItem throws.
 */
import { describe, test, expect } from 'vitest';
import { SettingsRepository } from '../../../src/infrastructure/repositories/SettingsRepository.js';

describe('SettingsRepository — error path coverage', () => {

    // ─────────────────────────────────────────────────────────────────────────
    // save() – storage.setItem throws
    // ─────────────────────────────────────────────────────────────────────────
    describe('save – storage throws', () => {
        test('degrades gracefully when setItem throws (quota exceeded)', () => {
            const throwingStorage = {
                setItem: () => { throw new Error('QuotaExceededError'); },
                getItem: () => null,
                removeItem: () => { }
            };
            const repo = new SettingsRepository(throwingStorage);
            expect(() => repo.save({ apiKey: 'key' })).not.toThrow();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // clear() – storage.removeItem throws
    // ─────────────────────────────────────────────────────────────────────────
    describe('clear – storage throws', () => {
        test('degrades gracefully when removeItem throws', () => {
            const throwingStorage = {
                setItem: () => { },
                getItem: () => null,
                removeItem: () => { throw new Error('SecurityError'); }
            };
            const repo = new SettingsRepository(throwingStorage);
            expect(() => repo.clear()).not.toThrow();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // load() – storage.getItem throws
    // ─────────────────────────────────────────────────────────────────────────
    describe('load – storage getItem throws', () => {
        test('returns default settings when getItem throws', () => {
            const throwingStorage = {
                setItem: () => { },
                getItem: () => { throw new Error('SecurityError'); },
                removeItem: () => { }
            };
            const repo = new SettingsRepository(throwingStorage);
            const result = repo.load();
            expect(result).toEqual({ apiKey: '', theme: 'system', angleUnit: 'degrees', decorationDisplayMode: 'small' });
        });
    });
});
