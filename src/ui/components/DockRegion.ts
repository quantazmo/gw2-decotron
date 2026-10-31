/**
 * DockRegion
 * Renders a single panel wrapper with a title bar and a content area.
 * Used by DockManager to wrap each panel content element in the layout tree.
 */

const PANEL_LABELS: Record<string, string> = {
    map: 'Map',
    layers: 'Layers',
    decorationList: 'Decoration List'
};

export class DockRegion {
    private panelId: string;
    private contentElement: HTMLElement | null;
    private label: string;
    private _element: HTMLElement;

    /**
     * @param {string} panelId  One of the PANEL_IDS values
     * @param {HTMLElement|null} contentElement  DOM element to place inside the content area
     * @param {string} [label]  Override display label (defaults to PANEL_LABELS[panelId])
     */
    constructor(panelId: string, contentElement: HTMLElement | null, label?: string) {
        this.panelId = panelId;
        this.contentElement = contentElement;
        this.label = label || PANEL_LABELS[panelId] || panelId;
        this._element = this._createElement();
    }

    /**
     * Build the DockRegion DOM element.
     * @private
     */
    _createElement(): HTMLDivElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'dock-region';
        wrapper.dataset.panelId = this.panelId;

        // Title bar
        const titleBar = document.createElement('div');
        titleBar.className = 'dock-region-title';
        titleBar.dataset.panelId = this.panelId;

        const titleText = document.createElement('span');
        titleText.className = 'dock-region-title-text';
        titleText.textContent = this.label;
        titleBar.appendChild(titleText);

        // Search and sort buttons for the decoration list panel (right of title)
        if (this.panelId === 'decorationList') {
            // Sort button
            const sortBtn = document.createElement('button');
            sortBtn.className = 'dock-region-title-sort-btn';
            sortBtn.title = 'Sort decorations';
            sortBtn.setAttribute('aria-label', 'Sort decorations');
            sortBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="19" x2="7" y2="5"/><polyline points="3 9 7 5 11 9"/><line x1="17" y1="5" x2="17" y2="19"/><polyline points="13 15 17 19 21 15"/></svg>`;

            const sortOptions: Array<{ mode: 'oldest' | 'newest' | 'az' | 'za'; label: string }> = [
                { mode: 'oldest', label: 'File Order' },
                { mode: 'az', label: 'A \u2192 Z' },
                { mode: 'za', label: 'Z \u2192 A' },
            ];

            let currentSortMode: 'oldest' | 'newest' | 'az' | 'za' = 'oldest';
            let sortDropdown: HTMLDivElement | null = null;

            const closeSortDropdown = () => {
                if (sortDropdown) {
                    sortDropdown.remove();
                    sortDropdown = null;
                }
            };

            const outsideClickHandler = (e: MouseEvent) => {
                const target = e.target;
                if (sortDropdown && target instanceof Node && !sortDropdown.contains(target) && target !== sortBtn) {
                    closeSortDropdown();
                    document.removeEventListener('click', outsideClickHandler, true);
                }
            };

            sortBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (sortDropdown) {
                    closeSortDropdown();
                    document.removeEventListener('click', outsideClickHandler, true);
                    return;
                }

                const dropdown = document.createElement('div');
                sortDropdown = dropdown;
                dropdown.className = 'decoration-sort-dropdown';

                sortOptions.forEach(opt => {
                    const option = document.createElement('button');
                    option.className = 'decoration-sort-dropdown__option' + (opt.mode === currentSortMode ? ' active' : '');
                    option.type = 'button';
                    option.textContent = opt.label;
                    option.addEventListener('click', (ev: MouseEvent) => {
                        ev.stopPropagation();
                        currentSortMode = opt.mode;
                        sortBtn.classList.toggle('active', opt.mode !== 'oldest');
                        document.dispatchEvent(new CustomEvent('decoration-list:set-sort', { detail: { mode: opt.mode } }));
                        closeSortDropdown();
                        document.removeEventListener('click', outsideClickHandler, true);
                    });
                    dropdown.appendChild(option);
                });

                const rect = sortBtn.getBoundingClientRect();
                dropdown.style.position = 'fixed';
                dropdown.style.top = `${rect.bottom + 2}px`;
                dropdown.style.right = `${window.innerWidth - rect.right}px`;
                document.body.appendChild(dropdown);

                setTimeout(() => {
                    document.addEventListener('click', outsideClickHandler, true);
                }, 0);
            });

            titleBar.appendChild(sortBtn);

            // Search button
            const searchBtn = document.createElement('button');
            searchBtn.className = 'dock-region-title-search-btn';
            searchBtn.title = 'Toggle search';
            searchBtn.setAttribute('aria-label', 'Toggle decoration search');
            searchBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;

            // Reflect active state from DOM on each render
            const isActive = this.contentElement &&
                this.contentElement.querySelector('.decoration-search-bar.visible');
            if (isActive) searchBtn.classList.add('active');

            searchBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                document.dispatchEvent(new CustomEvent('decoration-list:toggle-search'));
                searchBtn.classList.toggle('active');
            });

            titleBar.appendChild(searchBtn);
        }

        // Content area
        const content = document.createElement('div');
        content.className = 'dock-region-content';

        if (this.contentElement) {
            this.contentElement.style.display = '';
            content.appendChild(this.contentElement);
        }

        wrapper.appendChild(titleBar);
        wrapper.appendChild(content);

        return wrapper;
    }

    /**
     * Return the root DOM element for this DockRegion.
     * @returns {HTMLElement}
     */
    getElement(): HTMLElement {
        return this._element;
    }
}
