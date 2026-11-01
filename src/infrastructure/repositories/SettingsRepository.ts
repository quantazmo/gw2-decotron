/**
 * SettingsRepository
 * Persists and restores application settings to/from localStorage.
 *
 * Storage format:
 *   { "version": 1, "apiKey": "", "theme": "system", "angleUnit": "degrees" }
 *
 * Falls back to default settings on any of:
 *   - Missing key
 *   - Corrupt JSON
 *   - Unsupported schema version (anything other than 1)
 */

import { SETTINGS } from '../../config/constants.js';

const SUPPORTED_VERSION = 1;

type Theme = 'light' | 'dark' | 'system';

interface AppSettings {
    apiKey: string;
    theme: Theme;
    angleUnit: 'degrees' | 'radians';
}

interface SettingsInput {
    apiKey?: string | null;
    theme?: string | null;
    angleUnit?: string | null;
}

interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

const DEFAULT_SETTINGS: Readonly<AppSettings> = Object.freeze({
    apiKey: '',
    theme: 'system',
    angleUnit: 'degrees',
});

export class SettingsRepository {
    private readonly _storage: StorageLike;
    private readonly _key: string;

    /**
     * @param {Storage|object} [storage]  localStorage-compatible storage.
     *   Defaults to globalThis.localStorage when omitted.
     */
    constructor(storage: StorageLike | null = null) {
        this._storage = storage || (typeof localStorage !== 'undefined' ? localStorage : globalThis.localStorage);
        this._key = SETTINGS.SETTINGS_STORAGE_KEY;
    }

    /**
     * Serialize settings and write them to localStorage.
     * @param {{ apiKey: string, theme: string }} settings
     */
    save(settings: SettingsInput): void {
        try {
            const doc = {
                version: SUPPORTED_VERSION,
                apiKey: settings.apiKey ?? '',
                theme: settings.theme ?? 'system',
                angleUnit: settings.angleUnit === 'radians' ? 'radians' : 'degrees',
            };
            this._storage.setItem(this._key, JSON.stringify(doc));
        } catch (err) {
            console.warn('[SettingsRepository] Failed to save settings:', err instanceof Error ? err.message : String(err));
        }
    }

    /**
     * Read and deserialize settings from localStorage.
     * Returns default settings if the data is missing, corrupt, or invalid.
     * @returns {{ apiKey: string, theme: string }}
     */
    load(): AppSettings {
        try {
            const raw = this._storage.getItem(this._key);
            if (!raw) return { ...DEFAULT_SETTINGS };

            const parsed: unknown = JSON.parse(raw);

            if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SETTINGS };
            const doc = parsed as Record<string, unknown>;
            if (doc.version !== SUPPORTED_VERSION) return { ...DEFAULT_SETTINGS };

            const validThemes: readonly Theme[] = ['light', 'dark', 'system'];
            return {
                apiKey: typeof doc.apiKey === 'string' ? doc.apiKey : '',
                theme: typeof doc.theme === 'string' && validThemes.includes(doc.theme as Theme)
                    ? doc.theme as Theme
                    : 'system',
                angleUnit: doc.angleUnit === 'degrees' || doc.angleUnit === 'radians'
                    ? doc.angleUnit
                    : 'degrees',
            };
        } catch (err) {
            console.warn('[SettingsRepository] Failed to load settings, using defaults:', err instanceof Error ? err.message : String(err));
            return { ...DEFAULT_SETTINGS };
        }
    }

    /**
     * Remove the persisted settings from localStorage.
     */
    clear(): void {
        try {
            this._storage.removeItem(this._key);
        } catch (err) {
            console.warn('[SettingsRepository] Failed to clear settings:', err instanceof Error ? err.message : String(err));
        }
    }
}
