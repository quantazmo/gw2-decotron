/**
 * Tests for SettingsRepository
 * Validates localStorage serialization, deserialization, error recovery, and version checks.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SettingsRepository } from '../../../src/infrastructure/repositories/SettingsRepository.js';
import { SETTINGS } from '../../../src/config/constants.js';
import { setupLocalStorageMock } from '../mocks/localStorageMock.js';

describe('SettingsRepository', () => {
    let repository;
    let mockStorage;

    beforeEach(() => {
        mockStorage = setupLocalStorageMock();
        repository = new SettingsRepository(mockStorage);
    });

    afterEach(() => {
        mockStorage.clear();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // save
    // ─────────────────────────────────────────────────────────────────────────

    describe('save', () => {
        it('should serialize settings to JSON and write to localStorage', () => {
            repository.save({ apiKey: 'my-test-key' });

            const stored = mockStorage.getItem(SETTINGS.SETTINGS_STORAGE_KEY);
            expect(stored).not.toBeNull();

            const parsed = JSON.parse(stored);
            expect(parsed.version).toBe(1);
            expect(parsed.apiKey).toBe('my-test-key');
            expect(parsed.angleUnit).toBe('degrees');
            expect(parsed.decorationDisplayMode).toBe('small');
        });

        it('should store under the correct SETTINGS_STORAGE_KEY', () => {
            repository.save({ apiKey: 'abc' });

            expect(mockStorage.getItem(SETTINGS.SETTINGS_STORAGE_KEY)).not.toBeNull();
        });

        it('should store empty string for apiKey when apiKey is omitted', () => {
            repository.save({});

            const parsed = JSON.parse(mockStorage.getItem(SETTINGS.SETTINGS_STORAGE_KEY));
            expect(parsed.apiKey).toBe('');
        });

        it('should store empty string for apiKey when apiKey is null', () => {
            repository.save({ apiKey: null });

            const parsed = JSON.parse(mockStorage.getItem(SETTINGS.SETTINGS_STORAGE_KEY));
            expect(parsed.apiKey).toBe('');
        });

        it('should not throw when storage write succeeds', () => {
            expect(() => repository.save({ apiKey: 'key' })).not.toThrow();
        });

        it('should overwrite a previous save with new values', () => {
            repository.save({ apiKey: 'first' });
            repository.save({ apiKey: 'second' });

            const parsed = JSON.parse(mockStorage.getItem(SETTINGS.SETTINGS_STORAGE_KEY));
            expect(parsed.apiKey).toBe('second');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // load
    // ─────────────────────────────────────────────────────────────────────────

    describe('load', () => {
        it('should return default settings when localStorage key is missing', () => {
            const result = repository.load();

            expect(result).toEqual({ apiKey: '', theme: 'system', angleUnit: 'degrees', decorationDisplayMode: 'small' });
        });

        it('should deserialize a previously saved apiKey', () => {
            repository.save({ apiKey: 'my-api-key-123' });

            const loaded = repository.load();

            expect(loaded.apiKey).toBe('my-api-key-123');
        });

        it('should round-trip the selected angle unit', () => {
            repository.save({ angleUnit: 'radians' });
            expect(repository.load().angleUnit).toBe('radians');
        });

        it('should round-trip the selected decoration display mode', () => {
            repository.save({ decorationDisplayMode: 'icon' });
            expect(repository.load().decorationDisplayMode).toBe('icon');
        });

        it('should preserve the decoration display mode when saving other settings', () => {
            repository.save({ decorationDisplayMode: 'large' });
            repository.save({ apiKey: 'updated-key', theme: 'dark', angleUnit: 'radians' });
            expect(repository.load().decorationDisplayMode).toBe('large');
        });

        it('should default invalid decoration display modes to small', () => {
            mockStorage.setItem(SETTINGS.SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, decorationDisplayMode: 'giant' }));
            expect(repository.load().decorationDisplayMode).toBe('small');
        });

        it('should default to degrees when the saved settings have no angle unit', () => {
            mockStorage.setItem(SETTINGS.SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, apiKey: 'key', theme: 'system' }));
            expect(repository.load().angleUnit).toBe('degrees');
        });

        it('should round-trip an empty apiKey correctly', () => {
            repository.save({ apiKey: '' });

            const loaded = repository.load();

            expect(loaded.apiKey).toBe('');
        });

        it('should return defaults when JSON is corrupt', () => {
            mockStorage.setItem(SETTINGS.SETTINGS_STORAGE_KEY, '{ not valid json !!');

            const result = repository.load();

            expect(result).toEqual({ apiKey: '', theme: 'system', angleUnit: 'degrees', decorationDisplayMode: 'small' });
        });

        it('should return defaults when stored version is unsupported', () => {
            const futureDoc = JSON.stringify({ version: 999, apiKey: 'some-key' });
            mockStorage.setItem(SETTINGS.SETTINGS_STORAGE_KEY, futureDoc);

            const result = repository.load();

            expect(result).toEqual({ apiKey: '', theme: 'system', angleUnit: 'degrees', decorationDisplayMode: 'small' });
        });

        it('should return defaults when stored document is not an object', () => {
            mockStorage.setItem(SETTINGS.SETTINGS_STORAGE_KEY, JSON.stringify(null));

            const result = repository.load();

            expect(result).toEqual({ apiKey: '', theme: 'system', angleUnit: 'degrees', decorationDisplayMode: 'small' });
        });

        it('should return defaults when stored document is a plain string', () => {
            mockStorage.setItem(SETTINGS.SETTINGS_STORAGE_KEY, '"just-a-string"');

            const result = repository.load();

            expect(result).toEqual({ apiKey: '', theme: 'system', angleUnit: 'degrees', decorationDisplayMode: 'small' });
        });

        it('should return apiKey as empty string when stored apiKey is not a string', () => {
            const doc = JSON.stringify({ version: 1, apiKey: 12345 });
            mockStorage.setItem(SETTINGS.SETTINGS_STORAGE_KEY, doc);

            const result = repository.load();

            expect(result.apiKey).toBe('');
        });

        it('should return apiKey as empty string when apiKey field is missing', () => {
            const doc = JSON.stringify({ version: 1 });
            mockStorage.setItem(SETTINGS.SETTINGS_STORAGE_KEY, doc);

            const result = repository.load();

            expect(result.apiKey).toBe('');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // clear
    // ─────────────────────────────────────────────────────────────────────────

    describe('clear', () => {
        it('should remove the settings entry from localStorage', () => {
            repository.save({ apiKey: 'to-be-removed' });
            expect(mockStorage.getItem(SETTINGS.SETTINGS_STORAGE_KEY)).not.toBeNull();

            repository.clear();

            expect(mockStorage.getItem(SETTINGS.SETTINGS_STORAGE_KEY)).toBeNull();
        });

        it('should not throw when key does not exist', () => {
            expect(() => repository.clear()).not.toThrow();
        });

        it('should return defaults from load after clear', () => {
            repository.save({ apiKey: 'some-key' });
            repository.clear();

            const result = repository.load();

            expect(result).toEqual({ apiKey: '', theme: 'system', angleUnit: 'degrees', decorationDisplayMode: 'small' });
        });
    });
});
