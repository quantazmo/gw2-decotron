/**
 * SettingsDialog Component
 * Modal dialog for editing application settings (e.g. API Key).
 * Uses native <dialog> element with Promise-based API.
 * Save button commits changes; Cancel (button or Escape) discards them.
 *
 * After the user stops typing in the API Key field (debounced 600 ms), the key
 * is validated against the GW2 tokeninfo endpoint. A green check icon is shown
 * on success and a red × icon on failure.
 */

const VALIDATE_DEBOUNCE_MS = 600;
const TOKENINFO_URL = 'https://api.guildwars2.com/v2/tokeninfo';

/**
 * GW2 API keys are two UUIDs concatenated without a separator between them:
 *   [8hex]-[4hex]-[4hex]-[4hex]-[12hex][8hex]-[4hex]-[4hex]-[4hex]-[12hex]
 * which collapses the boundary into a 20-char hex run:
 *   [8]-[4]-[4]-[4]-[20]-[4]-[4]-[4]-[12]
 */
const API_KEY_PATTERN = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{20}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

let _instanceCount = 0;
type ThemePreference = 'light' | 'dark' | 'system';
type AngleUnit = 'degrees' | 'radians';
type SettingsResult = { apiKey: string; theme: ThemePreference; angleUnit: AngleUnit };

export class SettingsDialog {
    private _id: string;
    private _onResetLayout: () => void;
    private _resolve: ((result: SettingsResult | null) => void) | null = null;
    private _validateTimer: ReturnType<typeof setTimeout> | null = null;
    private _currentValidationKey: string | null = null;
    private _dialogEl!: HTMLDialogElement;
    private _apiKeyInput!: HTMLInputElement;
    private _angleUnitSelect!: HTMLSelectElement;
    private _validationIcon!: HTMLSpanElement;
    private _cancelBtn!: HTMLButtonElement;
    private _saveBtn!: HTMLButtonElement;

    constructor(onResetLayout: () => void = () => { }) {
        _instanceCount++;
        this._id = `settings-dialog-${_instanceCount}`;
        this._onResetLayout = onResetLayout;
        this._resolve = null;
        this._validateTimer = null;
        this._currentValidationKey = null;
        this._dialogEl = this._createDialogElement();
        document.body.appendChild(this._dialogEl);
    }

    /**
     * Show the settings dialog pre-populated with current settings.
     *
    * @param {{ apiKey: string, theme?: string, angleUnit?: AngleUnit }} settings  Current settings values
     * @returns {Promise<{ apiKey: string, theme: string } | null>}
     *   Resolves with the new settings object on Save.
     *   Resolves with null on Cancel or Escape.
     */
    show(settings: { apiKey: string; theme?: ThemePreference; angleUnit?: AngleUnit }): Promise<SettingsResult | null> {
        this._apiKeyInput.value = settings.apiKey ?? '';
        // Validate the existing key immediately on open (no debounce)
        this._scheduleValidation(0);

        // Pre-select the theme radio button
        const theme = settings.theme ?? 'system';
        const themeRadio = this._dialogEl.querySelector<HTMLInputElement>(`input[name="${this._id}-theme"][value="${theme}"]`);
        if (themeRadio) themeRadio.checked = true;
        this._angleUnitSelect.value = settings.angleUnit === 'radians' ? 'radians' : 'degrees';

        if (typeof this._dialogEl.showModal === 'function') {
            this._dialogEl.showModal();
        } else {
            this._dialogEl.setAttribute('open', '');
        }

        this._cancelBtn.focus();

        return new Promise<SettingsResult | null>((resolve) => {
            this._resolve = resolve;
        });
    }

    // ── private ──────────────────────────────────────────────────────────────

    _createDialogElement(): HTMLDialogElement {
        const dialog = document.createElement('dialog');
        dialog.classList.add('settings-dialog');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');

        const titleId = `${this._id}-title`;
        const descId = `${this._id}-desc`;

        dialog.setAttribute('aria-labelledby', titleId);
        dialog.setAttribute('aria-describedby', descId);

        // Title
        const titleEl = document.createElement('h2');
        titleEl.classList.add('settings-dialog__title');
        titleEl.id = titleId;
        titleEl.textContent = 'Settings';

        // Description
        const descEl = document.createElement('p');
        descEl.classList.add('settings-dialog__desc');
        descEl.id = descId;
        descEl.textContent = 'Configure application settings. Settings are stored in local browser storage.';

        // Form body
        const formEl = document.createElement('div');
        formEl.classList.add('settings-dialog__form');

        // API Key field
        const apiKeyGroup = document.createElement('div');
        apiKeyGroup.classList.add('settings-dialog__field-group');

        const apiKeyLabel = document.createElement('label');
        apiKeyLabel.classList.add('settings-dialog__label');
        apiKeyLabel.htmlFor = `${this._id}-api-key`;
        apiKeyLabel.textContent = 'GW2 API Key';

        // Input row: input + status icon
        const inputRow = document.createElement('div');
        inputRow.classList.add('settings-dialog__input-row');

        this._apiKeyInput = document.createElement('input');
        this._apiKeyInput.type = 'text';
        this._apiKeyInput.id = `${this._id}-api-key`;
        this._apiKeyInput.classList.add('settings-dialog__input');
        this._apiKeyInput.placeholder = 'Enter your Guild Wars 2 API key';
        this._apiKeyInput.setAttribute('autocomplete', 'off');
        this._apiKeyInput.setAttribute('spellcheck', 'false');
        this._apiKeyInput.addEventListener('input', () => this._scheduleValidation(VALIDATE_DEBOUNCE_MS));

        this._validationIcon = document.createElement('span');
        this._validationIcon.classList.add('settings-dialog__validation-icon');
        this._validationIcon.setAttribute('aria-live', 'polite');
        this._validationIcon.setAttribute('aria-atomic', 'true');

        inputRow.appendChild(this._apiKeyInput);
        inputRow.appendChild(this._validationIcon);

        apiKeyGroup.appendChild(apiKeyLabel);
        apiKeyGroup.appendChild(inputRow);
        formEl.appendChild(apiKeyGroup);

        // Theme selector
        const themeGroup = document.createElement('div');
        themeGroup.classList.add('settings-dialog__field-group');

        const themeLabel = document.createElement('label');
        themeLabel.classList.add('settings-dialog__label');
        themeLabel.textContent = 'Color Theme';
        themeGroup.appendChild(themeLabel);

        const themeOptions = document.createElement('div');
        themeOptions.classList.add('settings-dialog__theme-group');

        const themeDefs = [
            { value: 'system', icon: '🌗', label: 'System default' },
            { value: 'light', icon: '☀️', label: 'Light' },
            { value: 'dark', icon: '🌙', label: 'Dark' },
        ] as const;

        for (const def of themeDefs) {
            const optionEl = document.createElement('label');
            optionEl.classList.add('settings-dialog__theme-option', `settings-dialog__theme-option--${def.value}`);

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = `${this._id}-theme`;
            radio.value = def.value;
            if (def.value === 'system') radio.checked = true;

            const preview = document.createElement('span');
            preview.classList.add('settings-dialog__theme-preview');
            preview.setAttribute('aria-hidden', 'true');
            preview.textContent = def.icon;

            const labelSpan = document.createElement('span');
            labelSpan.classList.add('settings-dialog__theme-label');
            labelSpan.textContent = def.label;

            optionEl.appendChild(radio);
            optionEl.appendChild(preview);
            optionEl.appendChild(labelSpan);
            themeOptions.appendChild(optionEl);
        }

        themeGroup.appendChild(themeOptions);
        formEl.appendChild(themeGroup);

        const angleUnitGroup = document.createElement('div');
        angleUnitGroup.classList.add('settings-dialog__field-group');

        const angleUnitLabel = document.createElement('label');
        angleUnitLabel.classList.add('settings-dialog__label');
        angleUnitLabel.htmlFor = `${this._id}-angle-unit`;
        angleUnitLabel.textContent = 'Rotation Units';

        this._angleUnitSelect = document.createElement('select');
        this._angleUnitSelect.id = `${this._id}-angle-unit`;
        this._angleUnitSelect.classList.add('settings-dialog__input');
        for (const [value, label] of [['degrees', 'Degrees'], ['radians', 'Radians']] as const) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            this._angleUnitSelect.appendChild(option);
        }

        angleUnitGroup.appendChild(angleUnitLabel);
        angleUnitGroup.appendChild(this._angleUnitSelect);
        formEl.appendChild(angleUnitGroup);

        const resetLayoutBtn = document.createElement('button');
        resetLayoutBtn.type = 'button';
        resetLayoutBtn.classList.add('settings-dialog__reset');
        resetLayoutBtn.textContent = 'Reset Layout';
        resetLayoutBtn.addEventListener('click', () => this._onResetLayout());
        formEl.appendChild(resetLayoutBtn);

        // Actions
        const actionsEl = document.createElement('div');
        actionsEl.classList.add('settings-dialog__actions');

        this._cancelBtn = document.createElement('button');
        this._cancelBtn.type = 'button';
        this._cancelBtn.classList.add('settings-dialog__cancel');
        this._cancelBtn.textContent = 'Cancel';
        this._cancelBtn.addEventListener('click', () => this._close(null));

        this._saveBtn = document.createElement('button');
        this._saveBtn.type = 'button';
        this._saveBtn.classList.add('settings-dialog__save');
        this._saveBtn.textContent = 'Save';
        this._saveBtn.addEventListener('click', () => this._onSave());

        actionsEl.appendChild(this._saveBtn);
        actionsEl.appendChild(this._cancelBtn);

        dialog.appendChild(titleEl);
        dialog.appendChild(descEl);
        dialog.appendChild(formEl);
        dialog.appendChild(actionsEl);

        // Native cancel event fires on Escape key
        dialog.addEventListener('cancel', (e) => {
            e.preventDefault();
            this._close(null);
        });

        return dialog;
    }

    _onSave(): void {
        const selectedThemeRadio = this._dialogEl.querySelector<HTMLInputElement>(`input[name="${this._id}-theme"]:checked`);
        const selectedTheme = selectedThemeRadio?.value;
        const result: SettingsResult = {
            apiKey: this._apiKeyInput.value.trim(),
            theme: selectedTheme === 'light' || selectedTheme === 'dark' || selectedTheme === 'system'
                ? selectedTheme
                : 'system',
            angleUnit: this._angleUnitSelect.value === 'radians' ? 'radians' : 'degrees',
        };
        this._close(result);
    }

    _close(result: SettingsResult | null): void {
        // Cancel any in-flight validation
        if (this._validateTimer !== null) clearTimeout(this._validateTimer);
        this._currentValidationKey = null;

        if (typeof this._dialogEl.close === 'function') {
            this._dialogEl.close();
        } else {
            this._dialogEl.removeAttribute('open');
        }
        if (this._resolve) {
            this._resolve(result);
            this._resolve = null;
        }
    }

    /**
     * Schedule a validation run after `delay` ms.
     * Cancels any previously scheduled run.
     * @param {number} delay
     */
    _scheduleValidation(delay: number): void {
        if (this._validateTimer !== null) clearTimeout(this._validateTimer);
        const key = this._apiKeyInput.value.trim();

        if (!key) {
            this._setValidationState('idle');
            return;
        }

        if (!API_KEY_PATTERN.test(key)) {
            this._setValidationState('invalid');
            return;
        }

        this._setValidationState('pending');
        this._validateTimer = setTimeout(() => this._validateKey(key), delay);
    }

    /**
     * Call the GW2 tokeninfo endpoint to validate the key.
     * Uses the access_token query parameter to avoid CORS preflight issues
     * that arise from setting a custom Authorization header.
     * Only applies the result if the key has not changed since the call was made.
     * @param {string} key
     */
    async _validateKey(key: string): Promise<void> {
        this._currentValidationKey = key;
        try {
            const url = `${TOKENINFO_URL}?access_token=${encodeURIComponent(key)}`;
            const response = await fetch(url);
            // Guard: ignore stale results
            if (this._currentValidationKey !== key) return;
            if (!response.ok) {
                this._setValidationState('invalid');
                return;
            }
            this._setValidationState('valid');
        } catch (_err) {
            if (this._currentValidationKey !== key) return;
            this._setValidationState('invalid');
        }
    }

    /**
     * Update the validation icon state.
     * @param {'idle'|'pending'|'valid'|'invalid'} state
     */
    _setValidationState(state: 'idle' | 'pending' | 'valid' | 'invalid'): void {
        const icon = this._validationIcon;
        icon.className = 'settings-dialog__validation-icon';

        switch (state) {
            case 'pending':
                icon.classList.add('settings-dialog__validation-icon--pending');
                icon.textContent = '';
                icon.setAttribute('aria-label', 'Validating API key…');
                break;
            case 'valid':
                icon.classList.add('settings-dialog__validation-icon--valid');
                icon.textContent = '✓';
                icon.setAttribute('aria-label', 'API key is valid');
                break;
            case 'invalid':
                icon.classList.add('settings-dialog__validation-icon--invalid');
                icon.textContent = '✕';
                icon.setAttribute('aria-label', 'API key is invalid');
                break;
            default: // 'idle'
                icon.textContent = '';
                icon.removeAttribute('aria-label');
                break;
        }
    }

    /**
     * Remove the dialog element from the DOM.
     */
    destroy(): void {
        this._dialogEl.remove();
    }
}
