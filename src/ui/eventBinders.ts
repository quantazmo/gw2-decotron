/**
 * eventBinders.js
 * Binds DOM events to application commands and updates UI from store changes
 * Handles all user interactions and state synchronization
 */
import { AppService } from '../application/AppService.ts';
import { AppState, AppStore } from './stores/AppStore.ts';
import { SelectionStore } from './stores/SelectionStore.ts';
import { ZoomStore } from './stores/ZoomStore.ts';
import { EventBus } from './EventBus.ts';
import { Layer } from '../domain/Layer.ts';

/**
 * Bind layer creation button
 * @param {HTMLElement} button - The create layer button element
 * @param {Object} appService - The AppService instance
 * @param {EventBus} eventBus - The EventBus instance
 */
function bindCreateLayerButton(button: HTMLElement, appService: Pick<AppService, 'execute'>, eventBus: EventBus): void {
    console.log('[eventBinders] ⚡ bindCreateLayerButton() called');

    button.addEventListener('click', () => {
        console.log('[eventBinders] 🔘 Create layer button CLICKED');
        try {
            const command = {
                type: 'CreateLayerCommand',
                payload: {
                    isVisible: true
                }
            };

            console.log('[eventBinders]   ↳ Executing CreateLayerCommand...');
            appService.execute(command);
            console.log('[eventBinders] ✅ CreateLayerCommand executed');
        } catch (error) {
            console.error('[eventBinders] ❌ Error creating layer:', error);
            eventBus.publish('ERROR', { message: 'Failed to create layer' });
        }
    });

    console.log('[eventBinders] ✅ Create layer button bound');
}

/**
 * Bind delete layer button
 * @param {HTMLElement} button - The delete layer button element
 * @param {Object} appService - The AppService instance
 * @param {SelectionStore} selectionStore - The SelectionStore instance
 * @param {EventBus} eventBus - The EventBus instance
 */
function bindDeleteLayerButton(button: HTMLElement, appService: Pick<AppService, 'execute'>, selectionStore: SelectionStore, eventBus: EventBus, onDeleteLayer?: (layerId: string) => void): void {
    console.log('[eventBinders] ⚡ bindDeleteLayerButton() called');

    button.addEventListener('click', () => {
        console.log('[eventBinders] 🔘 Delete layer button CLICKED');
        try {
            const layerId = selectionStore.getActiveLayerId();
            console.log(`[eventBinders]   ↳ Active layer ID: ${layerId}`);

            if (!layerId) {
                console.warn('[eventBinders] ⚠️  No layer selected');
                eventBus.publish('WARNING', { message: 'No layer selected' });
                return;
            }

            if (onDeleteLayer) {
                onDeleteLayer(layerId);
                return;
            }

            const command = {
                type: 'DeleteLayerCommand',
                payload: { layerId }
            };

            console.log('[eventBinders]   ↳ Executing DeleteLayerCommand...');
            appService.execute(command);
            console.log('[eventBinders] ✅ DeleteLayerCommand executed');
        } catch (error) {
            console.error('[eventBinders] ❌ Error deleting layer:', error);
            eventBus.publish('ERROR', { message: 'Failed to delete layer' });
        }
    });

    console.log('[eventBinders] ✅ Delete layer button bound');
}

/**
 * Bind rename layer input
 * @param {HTMLElement} input - The rename layer input element
 * @param {Object} appService - The AppService instance
 * @param {SelectionStore} selectionStore - The SelectionStore instance
 * @param {EventBus} eventBus - The EventBus instance
 */
function bindRenameLayerInput(input: HTMLInputElement, appService: Pick<AppService, 'execute'>, selectionStore: SelectionStore, eventBus: EventBus): void {
    input.addEventListener('blur', () => {
        try {
            const newName = input.value.trim();
            const layerId = selectionStore.getActiveLayerId();

            if (!layerId || !newName) {
                eventBus.publish('WARNING', { message: 'Invalid layer name' });
                return;
            }

            const command = {
                type: 'RenameLayerCommand',
                payload: { layerId, newName }
            };

            appService.execute(command);
        } catch (error) {
            console.error('Error renaming layer:', error);
            eventBus.publish('ERROR', { message: 'Failed to rename layer' });
        }
    });

    input.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            input.blur();
        }
    });
}

/**
 * Bind file drop zone for layout loading
 * @param {HTMLElement} dropZone - The drop zone element
 * @param {Object} appService - The AppService instance
 * @param {EventBus} eventBus - The EventBus instance
 */
function bindFileDropZone(dropZone: HTMLElement, appService: Pick<AppService, 'execute'>, eventBus: EventBus): void {
    // Prevent default drag behavior
    dropZone.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (event) => {
        event.preventDefault();
        dropZone.classList.remove('drag-over');

        const files = event.dataTransfer?.files;
        if (!files) return;
        if (files.length === 0) return;

        const file = files[0];
        if (!file) return;

        // Validate file type
        if (!file.name.endsWith('.xml')) {
            eventBus.publish('ERROR', { message: 'Please drop an XML layout file' });
            return;
        }

        // Read file
        const reader = new FileReader();
        reader.onload = async (e: ProgressEvent<FileReader>) => {
            try {
                const xmlContent = e.target?.result;
                if (typeof xmlContent !== 'string') return;
                const command = {
                    type: 'LoadLayoutCommand',
                    payload: { xmlContent, fileName: file.name }
                };

                await appService.execute(command);
                eventBus.publish('SUCCESS', { message: 'Layout loaded successfully' });
            } catch (error) {
                console.error('Error loading layout:', error);
                eventBus.publish('ERROR', { message: 'Failed to load layout' });
            }
        };

        reader.onerror = () => {
            eventBus.publish('ERROR', { message: 'Failed to read file' });
        };

        reader.readAsText(file);
    });
}

/**
 * Bind layer visibility toggle
 * @param {HTMLElement} checkbox - The visibility toggle checkbox
 * @param {string} layerId - The layer ID
 * @param {Object} appService - The AppService instance
 * @param {EventBus} eventBus - The EventBus instance
 */
function bindLayerVisibilityToggle(checkbox: HTMLInputElement, layerId: string, appService: Pick<AppService, 'execute'>, eventBus: EventBus): void {
    checkbox.addEventListener('change', async () => {
        try {
            // Toggle visibility using command through AppService
            await appService.execute({
                type: 'ToggleLayerVisibilityCommand',
                payload: {
                    layerId
                }
            });
        } catch (error) {
            console.error('Error toggling layer visibility:', error);
            eventBus.publish('ERROR', { message: 'Failed to toggle visibility' });
        }
    });
}

/**
 * Bind layer selection in layer list
 * @param {HTMLElement} layerElement - The layer list item element
 * @param {string} layerId - The layer ID
 * @param {SelectionStore} selectionStore - The SelectionStore instance
 */
function bindLayerSelection(layerElement: HTMLElement, layerId: string, selectionStore: SelectionStore): void {
    layerElement.addEventListener('click', () => {
        selectionStore.setActiveLayer(layerId);
    });
}

/**
 * Bind zoom controls
 * @param {HTMLElement} zoomInButton - The zoom in button
 * @param {HTMLElement} zoomOutButton - The zoom out button
 * @param {Object} zoomStore - The ZoomStore instance
 */
function bindZoomControls(zoomInButton: HTMLElement | null, zoomOutButton: HTMLElement | null, zoomStore: ZoomStore): void {
    if (zoomInButton) {
        zoomInButton.addEventListener('click', () => {
            zoomStore.zoom(1.2);
        });
    }

    if (zoomOutButton) {
        zoomOutButton.addEventListener('click', () => {
            zoomStore.zoom(0.8);
        });
    }
}

/**
 * Bind reset zoom button
 * @param {HTMLElement} resetButton - The reset zoom button
 * @param {Object} zoomStore - The ZoomStore instance
 */
function bindResetZoomButton(resetButton: HTMLElement, zoomStore: ZoomStore): void {
    resetButton.addEventListener('click', () => {
        zoomStore.reset();
    });
}

/**
 * Update layer panel when store changes
 * @param {HTMLElement} layerPanel - The layer panel container
 * @param {Object} state - The current app state
 * @param {SelectionStore} selectionStore - The SelectionStore instance
 * @param {Function} createLayerElement - Function to create layer DOM element
 */
function updateLayerPanel(layerPanel: HTMLElement, state: AppState, selectionStore: SelectionStore, createLayerElement: (layer: Layer, active: boolean) => HTMLElement): void {
    // Clear existing layers
    layerPanel.innerHTML = '';

    // Add each layer
    state.layers.forEach(layer => {
        const layerElement = createLayerElement(layer, selectionStore.getActiveLayerId() === layer.id);
        layerPanel.appendChild(layerElement);

        // Bind selection
        bindLayerSelection(layerElement, layer.id, selectionStore);
    });
}

/**
 * Highlight active layer in UI
 * @param {HTMLElement} layerPanel - The layer panel container
 * @param {string} activeLayerId - The active layer ID
 */
function highlightActiveLayer(layerPanel: HTMLElement, activeLayerId: string | null): void {
    const layerElements = layerPanel.querySelectorAll('[data-layer-id]');

    layerElements.forEach(element => {
        const elementLayerId = element.getAttribute('data-layer-id');
        if (elementLayerId === activeLayerId) {
            element.classList.add('active');
        } else {
            element.classList.remove('active');
        }
    });
}

/**
 * Update map viewer when zoom changes
 * @param {SVGElement} mapSvg - The SVG map element
 * @param {Object} transform - The zoom/pan transform
 */
function updateMapTransform(mapSvg: SVGElement, transform: { sx: number; sy: number; tx: number; ty: number }): void {
    const transformString = `matrix(${transform.sx}, 0, 0, ${transform.sy}, ${transform.tx}, ${transform.ty})`;
    mapSvg.style.transform = transformString;
}

/**
 * Show notification to user
 * @param {string} message - The notification message
 * @param {string} type - The notification type: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duration in milliseconds (0 for permanent)
 */
function showNotification(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', duration: number = 3000): void {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    if (duration > 0) {
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, duration);
    }
}

/**
 * Enable/disable buttons based on conditions
 * @param {HTMLElement} button - The button element
 * @param {boolean} enabled - Whether the button should be enabled
 */
function setButtonState(button: HTMLElement | null, enabled: boolean): void {
    if (!button) return; // Button may not exist in HTML

    if (enabled) {
        button.removeAttribute('disabled');
        button.classList.remove('disabled');
    } else {
        button.setAttribute('disabled', 'disabled');
        button.classList.add('disabled');
    }
}

/**
 * Bind the Export button in the Layers panel.
 * Opens ExportDialog when clicked; dispatches ExportLayersCommand if user confirms.
 * Disables the button when no layout is loaded.
 *
 * @param {HTMLElement} button - The export button element
 * @param {Object} appService - The AppService instance
 * @param {Object} appStore - The AppStore instance
 * @param {EventBus} eventBus - The EventBus instance
 */
function bindExportButton(button: HTMLElement | null, appService: Pick<AppService, 'execute'>, appStore: AppStore, eventBus: EventBus): void {
    if (!button) return;

    console.log('[eventBinders] ⚡ bindExportButton() called');

    // Sync button enabled state with store
    const syncButtonState = () => {
        const { layout } = appStore.getState();
        setButtonState(button, !!layout);
    };

    appStore.subscribe(syncButtonState);
    syncButtonState();

    button.addEventListener('click', () => {
        console.log('[eventBinders] 🔘 Export button CLICKED');
        // Publish event — ApplicationInitializer owns the ExportDialog instance
        eventBus.publish('ribbon:export-requested', {});
    });

    console.log('[eventBinders] ✅ Export button bound');
}

export {
    bindCreateLayerButton,
    bindDeleteLayerButton,
    bindRenameLayerInput,
    bindFileDropZone,
    bindLayerVisibilityToggle,
    bindLayerSelection,
    bindZoomControls,
    bindResetZoomButton,
    updateLayerPanel,
    highlightActiveLayer,
    updateMapTransform,
    showNotification,
    setButtonState,
    bindExportButton
};
