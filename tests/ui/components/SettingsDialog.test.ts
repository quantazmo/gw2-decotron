/**
 * Tests for SettingsDialog component
 * Covers: construction, show/cancel/save, pre-population, Escape handling,
 *         multiple shows, format pre-validation, API key validation (debounce, success, failure).
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { SettingsDialog } from '../../../src/ui/components/SettingsDialog.js';

// Two real-format GW2 API keys used across validation tests.
const VALID_KEY = '3C6E7201-72FD-5942-9391-52A666D3AAA0D1223AAA-CF73-4408-9182-903AB441A2DE';
const VALID_KEY_2 = '3C6E7201-72FD-5942-9391-52A666D3AAA0D1223AAA-CF73-4408-9182-903AB441A2DF';

describe('SettingsDialog', () => {
    let dialog;

    beforeEach(() => {
        document.body.innerHTML = '';
        dialog = new SettingsDialog();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    // ─────────────────────────────────────────────────────────────────────────
    // constructor
    // ─────────────────────────────────────────────────────────────────────────

    describe('constructor', () => {
        test('creates a dialog element in the DOM', () => {
            expect(document.querySelector('dialog.settings-dialog')).not.toBeNull();
        });

        test('has role="dialog"', () => {
            const el = document.querySelector('dialog.settings-dialog');
            expect(el.getAttribute('role')).toBe('dialog');
        });

        test('has aria-modal="true"', () => {
            const el = document.querySelector('dialog.settings-dialog');
            expect(el.getAttribute('aria-modal')).toBe('true');
        });

        test('has aria-labelledby pointing to a title element', () => {
            const el = document.querySelector('dialog.settings-dialog');
            const labelId = el.getAttribute('aria-labelledby');
            expect(document.getElementById(labelId)).not.toBeNull();
            expect(document.getElementById(labelId).textContent).toBe('Settings');
        });

        test('has aria-describedby pointing to a description element', () => {
            const el = document.querySelector('dialog.settings-dialog');
            const descId = el.getAttribute('aria-describedby');
            expect(document.getElementById(descId)).not.toBeNull();
        });

        test('contains an API key input field', () => {
            expect(document.querySelector('.settings-dialog__input')).not.toBeNull();
        });

        test('contains a Save button', () => {
            expect(document.querySelector('.settings-dialog__save')).not.toBeNull();
        });

        test('contains a Cancel button', () => {
            expect(document.querySelector('.settings-dialog__cancel')).not.toBeNull();
        });

        test('contains a Reset Layout button', () => {
            expect(document.querySelector('.settings-dialog__reset')?.textContent).toBe('Reset Layout');
        });

        test('contains a rotation unit selector defaulting to degrees', () => {
            const unitSelect = document.querySelector('select[id$="-angle-unit"]');
            expect(unitSelect.value).toBe('degrees');
            expect(Array.from(unitSelect.options).map(option => option.value)).toEqual(['degrees', 'radians']);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // show — pre-population
    // ─────────────────────────────────────────────────────────────────────────

    describe('show — pre-population', () => {
        test('pre-populates the API key input with the provided value', async () => {
            const promise = dialog.show({ apiKey: 'my-secret-key' });

            const input = document.querySelector('.settings-dialog__input');
            expect(input.value).toBe('my-secret-key');

            document.querySelector('.settings-dialog__cancel').click();
            await promise;
        });

        test('pre-populates with an empty string when apiKey is empty', async () => {
            const promise = dialog.show({ apiKey: '' });

            const input = document.querySelector('.settings-dialog__input');
            expect(input.value).toBe('');

            document.querySelector('.settings-dialog__cancel').click();
            await promise;
        });

        test('pre-populates with empty string when apiKey is undefined', async () => {
            const promise = dialog.show({});

            const input = document.querySelector('.settings-dialog__input');
            expect(input.value).toBe('');

            document.querySelector('.settings-dialog__cancel').click();
            await promise;
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // show — Cancel
    // ─────────────────────────────────────────────────────────────────────────

    describe('show — Cancel button', () => {
        test('resolves with null when Cancel is clicked', async () => {
            const promise = dialog.show({ apiKey: 'some-key' });
            document.querySelector('.settings-dialog__cancel').click();
            const result = await promise;
            expect(result).toBeNull();
        });

        test('does not resolve with settings when Cancel is clicked', async () => {
            const promise = dialog.show({ apiKey: 'some-key' });
            document.querySelector('.settings-dialog__input').value = 'changed-key';
            document.querySelector('.settings-dialog__cancel').click();
            const result = await promise;
            expect(result).toBeNull();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // show — Save
    // ─────────────────────────────────────────────────────────────────────────

    describe('show — Save button', () => {
        test('resolves with the entered API key on Save', async () => {
            const promise = dialog.show({ apiKey: '' });
            document.querySelector('.settings-dialog__input').value = 'new-api-key';
            document.querySelector('.settings-dialog__save').click();
            const result = await promise;
            expect(result).toEqual({ apiKey: 'new-api-key', theme: 'system', angleUnit: 'degrees' });
        });

        test('trims whitespace from the API key on Save', async () => {
            const promise = dialog.show({ apiKey: '' });
            document.querySelector('.settings-dialog__input').value = '  trimmed-key  ';
            document.querySelector('.settings-dialog__save').click();
            const result = await promise;
            expect(result).toEqual({ apiKey: 'trimmed-key', theme: 'system', angleUnit: 'degrees' });
        });

        test('resolves with empty string when API key is cleared and saved', async () => {
            const promise = dialog.show({ apiKey: 'existing-key' });
            document.querySelector('.settings-dialog__input').value = '';
            document.querySelector('.settings-dialog__save').click();
            const result = await promise;
            expect(result).toEqual({ apiKey: '', theme: 'system', angleUnit: 'degrees' });
        });

        test('returns the unchanged pre-populated value when saved without editing', async () => {
            const promise = dialog.show({ apiKey: 'original-key' });
            document.querySelector('.settings-dialog__save').click();
            const result = await promise;
            expect(result).toEqual({ apiKey: 'original-key', theme: 'system', angleUnit: 'degrees' });
        });

        test('returns the selected rotation unit on Save', async () => {
            const promise = dialog.show({ apiKey: '', angleUnit: 'radians' });
            document.querySelector('select[id$="-angle-unit"]').value = 'radians';
            document.querySelector('.settings-dialog__save').click();
            await expect(promise).resolves.toMatchObject({ angleUnit: 'radians' });
        });
    });

    describe('reset layout', () => {
        test('calls the reset callback without closing the dialog', () => {
            const onResetLayout = vi.fn();
            const dialogWithReset = new SettingsDialog(onResetLayout);
            const promise = dialogWithReset.show({ apiKey: '' });
            const resetDialog = document.querySelectorAll('dialog.settings-dialog').item(1);

            resetDialog.querySelector('.settings-dialog__reset').click();

            expect(onResetLayout).toHaveBeenCalledTimes(1);
            expect(resetDialog.hasAttribute('open')).toBe(true);
            resetDialog.querySelector('.settings-dialog__cancel').click();
            return promise;
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // show — Escape key (native cancel event)
    // ─────────────────────────────────────────────────────────────────────────

    describe('show — Escape / cancel event', () => {
        test('resolves with null when native cancel event fires (Escape)', async () => {
            const promise = dialog.show({ apiKey: 'key' });
            const el = document.querySelector('dialog.settings-dialog');
            const cancelEvent = new Event('cancel', { cancelable: true });
            el.dispatchEvent(cancelEvent);
            const result = await promise;
            expect(result).toBeNull();
        });

        test('prevents default on native cancel event', async () => {
            const promise = dialog.show({ apiKey: 'key' });
            const el = document.querySelector('dialog.settings-dialog');
            const cancelEvent = new Event('cancel', { cancelable: true });
            const preventDefaultSpy = vi.spyOn(cancelEvent, 'preventDefault');
            el.dispatchEvent(cancelEvent);
            expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
            await promise;
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Multiple shows
    // ─────────────────────────────────────────────────────────────────────────

    describe('multiple shows', () => {
        test('can be shown again after being cancelled', async () => {
            const p1 = dialog.show({ apiKey: 'first' });
            document.querySelector('.settings-dialog__cancel').click();
            await p1;

            const p2 = dialog.show({ apiKey: 'second' });
            expect(document.querySelector('.settings-dialog__input').value).toBe('second');
            document.querySelector('.settings-dialog__cancel').click();
            await p2;
        });

        test('can be shown again after being saved', async () => {
            const p1 = dialog.show({ apiKey: 'first' });
            document.querySelector('.settings-dialog__save').click();
            await p1;

            const p2 = dialog.show({ apiKey: 'updated' });
            expect(document.querySelector('.settings-dialog__input').value).toBe('updated');
            document.querySelector('.settings-dialog__cancel').click();
            await p2;
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // destroy
    // ─────────────────────────────────────────────────────────────────────────

    describe('destroy', () => {
        test('removes the dialog element from the DOM', () => {
            expect(document.querySelector('dialog.settings-dialog')).not.toBeNull();
            dialog.destroy();
            expect(document.querySelector('dialog.settings-dialog')).toBeNull();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Format pre-validation
    // ─────────────────────────────────────────────────────────────────────────

    describe('format pre-validation', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
            vi.restoreAllMocks();
        });

        test('shows invalid immediately for a key that is too short, without calling fetch', async () => {
            global.fetch = vi.fn();
            const promise = dialog.show({ apiKey: '' });
            const input = document.querySelector('.settings-dialog__input');
            input.value = 'short-key';
            input.dispatchEvent(new Event('input'));
            await vi.runAllTimersAsync();
            const icon = document.querySelector('.settings-dialog__validation-icon');
            expect(icon.classList.contains('settings-dialog__validation-icon--invalid')).toBe(true);
            expect(global.fetch).not.toHaveBeenCalled();
            document.querySelector('.settings-dialog__cancel').click();
            await promise;
        });

        test('shows invalid immediately for a key missing hyphens, without calling fetch', async () => {
            global.fetch = vi.fn();
            const promise = dialog.show({ apiKey: '' });
            const input = document.querySelector('.settings-dialog__input');
            // 72 hex chars but no hyphens
            input.value = '3C6E720172FD59429391' + '52A666D3AAA0D1223AAA' + 'CF7344089182903AB441A2DE';
            input.dispatchEvent(new Event('input'));
            await vi.runAllTimersAsync();
            const icon = document.querySelector('.settings-dialog__validation-icon');
            expect(icon.classList.contains('settings-dialog__validation-icon--invalid')).toBe(true);
            expect(global.fetch).not.toHaveBeenCalled();
            document.querySelector('.settings-dialog__cancel').click();
            await promise;
        });

        test('shows invalid immediately for a key with wrong hyphen positions', async () => {
            global.fetch = vi.fn();
            const promise = dialog.show({ apiKey: '' });
            const input = document.querySelector('.settings-dialog__input');
            // A single standard UUID (too short for a GW2 key)
            input.value = '3C6E7201-72FD-5942-9391-52A666D3AAA0';
            input.dispatchEvent(new Event('input'));
            await vi.runAllTimersAsync();
            const icon = document.querySelector('.settings-dialog__validation-icon');
            expect(icon.classList.contains('settings-dialog__validation-icon--invalid')).toBe(true);
            expect(global.fetch).not.toHaveBeenCalled();
            document.querySelector('.settings-dialog__cancel').click();
            await promise;
        });

        test('accepts a correctly-formatted key and calls fetch', async () => {
            global.fetch = vi.fn(() => Promise.resolve({ ok: true }));
            const promise = dialog.show({ apiKey: '' });
            const input = document.querySelector('.settings-dialog__input');
            input.value = VALID_KEY;
            input.dispatchEvent(new Event('input'));
            await vi.runAllTimersAsync();
            expect(global.fetch).toHaveBeenCalledTimes(1);
            document.querySelector('.settings-dialog__cancel').click();
            await promise;
        });

        test('accepts lowercase hex in the key', async () => {
            global.fetch = vi.fn(() => Promise.resolve({ ok: true }));
            const promise = dialog.show({ apiKey: '' });
            const input = document.querySelector('.settings-dialog__input');
            input.value = VALID_KEY.toLowerCase();
            input.dispatchEvent(new Event('input'));
            await vi.runAllTimersAsync();
            expect(global.fetch).toHaveBeenCalledTimes(1);
            document.querySelector('.settings-dialog__cancel').click();
            await promise;
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // API key validation
    // ─────────────────────────────────────────────────────────────────────────

    describe('API key validation', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
            vi.restoreAllMocks();
        });

        test('validation icon is idle (empty) when dialog opens with an empty key', async () => {
            global.fetch = vi.fn();
            const promise = dialog.show({ apiKey: '' });
            await vi.runAllTimersAsync();
            const icon = document.querySelector('.settings-dialog__validation-icon');
            expect(icon.textContent).toBe('');
            expect(icon.classList.contains('settings-dialog__validation-icon--pending')).toBe(false);
            expect(global.fetch).not.toHaveBeenCalled();
            document.querySelector('.settings-dialog__cancel').click();
            await promise;
        });

        test('validation icon shows pending spinner while validating', async () => {
            // fetch never resolves during this test
            global.fetch = vi.fn(() => new Promise(() => { }));
            const promise = dialog.show({ apiKey: '' });

            const input = document.querySelector('.settings-dialog__input');
            input.value = VALID_KEY;
            input.dispatchEvent(new Event('input'));

            // Icon should be pending immediately after input (before debounce fires)
            const icon = document.querySelector('.settings-dialog__validation-icon');
            expect(icon.classList.contains('settings-dialog__validation-icon--pending')).toBe(true);

            document.querySelector('.settings-dialog__cancel').click();
            await promise;
        });

        test('shows green valid icon after successful tokeninfo response', async () => {
            global.fetch = vi.fn(() => Promise.resolve({ ok: true }));
            const promise = dialog.show({ apiKey: '' });

            const input = document.querySelector('.settings-dialog__input');
            input.value = VALID_KEY;
            input.dispatchEvent(new Event('input'));

            await vi.runAllTimersAsync();

            const icon = document.querySelector('.settings-dialog__validation-icon');
            expect(icon.classList.contains('settings-dialog__validation-icon--valid')).toBe(true);
            expect(icon.textContent).toBe('✓');
            expect(icon.getAttribute('aria-label')).toBe('API key is valid');

            document.querySelector('.settings-dialog__cancel').click();
            await promise;
        });

        test('shows red invalid icon after failed tokeninfo response (non-ok status)', async () => {
            global.fetch = vi.fn(() => Promise.resolve({ ok: false }));
            const promise = dialog.show({ apiKey: '' });

            const input = document.querySelector('.settings-dialog__input');
            input.value = VALID_KEY;
            input.dispatchEvent(new Event('input'));

            await vi.runAllTimersAsync();

            const icon = document.querySelector('.settings-dialog__validation-icon');
            expect(icon.classList.contains('settings-dialog__validation-icon--invalid')).toBe(true);
            expect(icon.textContent).toBe('✕');
            expect(icon.getAttribute('aria-label')).toBe('API key is invalid');

            document.querySelector('.settings-dialog__cancel').click();
            await promise;
        });

        test('shows red invalid icon when fetch throws (network error)', async () => {
            global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));
            const promise = dialog.show({ apiKey: '' });

            const input = document.querySelector('.settings-dialog__input');
            input.value = VALID_KEY;
            input.dispatchEvent(new Event('input'));

            await vi.runAllTimersAsync();

            const icon = document.querySelector('.settings-dialog__validation-icon');
            expect(icon.classList.contains('settings-dialog__validation-icon--invalid')).toBe(true);

            document.querySelector('.settings-dialog__cancel').click();
            await promise;
        });

        test('debounces: only calls fetch once when setting multiple valid keys rapidly', async () => {
            global.fetch = vi.fn(() => Promise.resolve({ ok: true }));
            const promise = dialog.show({ apiKey: '' });

            const input = document.querySelector('.settings-dialog__input');
            input.value = VALID_KEY;
            input.dispatchEvent(new Event('input'));
            input.value = VALID_KEY_2;
            input.dispatchEvent(new Event('input'));
            input.value = VALID_KEY;
            input.dispatchEvent(new Event('input'));

            await vi.runAllTimersAsync();

            expect(global.fetch).toHaveBeenCalledTimes(1);
            expect(global.fetch).toHaveBeenCalledWith(
                `https://api.guildwars2.com/v2/tokeninfo?access_token=${encodeURIComponent(VALID_KEY)}`
            );

            document.querySelector('.settings-dialog__cancel').click();
            await promise;
        });

        test('passes API key as access_token query parameter', async () => {
            global.fetch = vi.fn(() => Promise.resolve({ ok: true }));
            const promise = dialog.show({ apiKey: '' });

            const input = document.querySelector('.settings-dialog__input');
            input.value = VALID_KEY;
            input.dispatchEvent(new Event('input'));

            await vi.runAllTimersAsync();

            expect(global.fetch).toHaveBeenCalledWith(
                `https://api.guildwars2.com/v2/tokeninfo?access_token=${encodeURIComponent(VALID_KEY)}`
            );

            document.querySelector('.settings-dialog__cancel').click();
            await promise;
        });

        test('clears icon back to idle when input is emptied', async () => {
            global.fetch = vi.fn(() => Promise.resolve({ ok: true }));
            const promise = dialog.show({ apiKey: '' });

            const input = document.querySelector('.settings-dialog__input');
            input.value = '';
            input.dispatchEvent(new Event('input'));

            await vi.runAllTimersAsync();

            const icon = document.querySelector('.settings-dialog__validation-icon');
            expect(icon.textContent).toBe('');
            expect(icon.classList.contains('settings-dialog__validation-icon--valid')).toBe(false);
            expect(global.fetch).not.toHaveBeenCalled();

            document.querySelector('.settings-dialog__cancel').click();
            await promise;
        });

        test('validates existing valid-format key immediately when dialog opens', async () => {
            global.fetch = vi.fn(() => Promise.resolve({ ok: true }));
            const promise = dialog.show({ apiKey: VALID_KEY });

            // No input event needed — validation fires on open with delay=0
            await vi.runAllTimersAsync();

            expect(global.fetch).toHaveBeenCalledWith(
                `https://api.guildwars2.com/v2/tokeninfo?access_token=${encodeURIComponent(VALID_KEY)}`
            );

            const icon = document.querySelector('.settings-dialog__validation-icon');
            expect(icon.classList.contains('settings-dialog__validation-icon--valid')).toBe(true);

            document.querySelector('.settings-dialog__cancel').click();
            await promise;
        });

        test('shows invalid immediately (no fetch) when dialog opens with a badly-formatted key', async () => {
            global.fetch = vi.fn();
            const promise = dialog.show({ apiKey: 'not-a-real-key' });

            await vi.runAllTimersAsync();

            const icon = document.querySelector('.settings-dialog__validation-icon');
            expect(icon.classList.contains('settings-dialog__validation-icon--invalid')).toBe(true);
            expect(global.fetch).not.toHaveBeenCalled();

            document.querySelector('.settings-dialog__cancel').click();
            await promise;
        });

        test('cancelling dialog cancels any pending validation', async () => {
            let fetchResolve;
            global.fetch = vi.fn(() => new Promise(r => { fetchResolve = r; }));
            const promise = dialog.show({ apiKey: '' });

            const input = document.querySelector('.settings-dialog__input');
            input.value = VALID_KEY;
            input.dispatchEvent(new Event('input'));
            await vi.runAllTimersAsync();

            // Cancel before fetch resolves
            document.querySelector('.settings-dialog__cancel').click();
            const result = await promise;
            expect(result).toBeNull();

            // Resolving the fetch after cancel should not throw or update state
            fetchResolve({ ok: true });
        });
    });
});
