/**
 * Global constants and configuration for the GW2 Decoration Editor
 * 
 * This module centralizes all magic numbers, configuration values, and constants
 * used throughout the application to ensure consistency and maintainability.
 */

// ==============================================================================
// UI CONFIGURATION
// ==============================================================================

export const UI_LAYOUT = {
    // SVG viewport margins (pixels)
    MARGIN_TOP: 10,
    MARGIN_RIGHT: 10,
    MARGIN_BOTTOM: 10,
    MARGIN_LEFT: 10,

    // Panel dimensions
    LAYER_PANEL_WIDTH: 300,
    TOOL_PANEL_WIDTH: 250,
    MIN_PANEL_WIDTH: 150,
    MAX_PANEL_WIDTH: 600,

    // Animation timings (milliseconds)
    ANIMATION_DURATION: 200,
    FADE_DURATION: 150,
    SLIDE_DURATION: 250,

    // Decoration rendering
    DECORATION_RADIUS: 10,
    DECORATION_RADIUS_SELECTED: 13,
    DECORATION_OPACITY: 0.8,
    DECORATION_OPACITY_HOVER: 1.0,
    BOUNDARY_STROKE_WIDTH: 2,
    BOUNDARY_STROKE_COLOR: '#FF0000',
    TILE_BORDER_COLOR: '#CCCCCC',
    TILE_BORDER_WIDTH: 1
};

// ==============================================================================
// ZOOM & SCALE CONFIGURATION
// ==============================================================================
export const ZOOM = {
    // Zoom level constraints
    MIN_LEVEL: 1.0,      // Minimum zoom (no zoom out past default/reset view)
    MAX_LEVEL: 30,
    DEFAULT_LEVEL: 1,

    // Zoom speed/sensitivity
    WHEEL_FACTOR: 1.2, // Multiplicative factor per wheel tick
    WHEEL_FACTOR_ALTERNATIVE: 1.1, // Alternative for fine-grained control
    KEYBOARD_ZOOM_STEP: 1.1, // For keyboard zoom controls

    // Pan sensitivity
    PAN_SPEED: 1.0,
    PAN_FRICTION: 0.95, // For smooth deceleration

    // Animation
    ZOOM_ANIMATION_DURATION: 300, // milliseconds
    PAN_ANIMATION_DURATION: 300 // milliseconds
};

// ==============================================================================
// MAP & COORDINATE CONFIGURATION
export const MAP = {
    // Tile system
    TILE_SIZE: 256, // Standard GW2 tile size in pixels
    TILE_BUFFER: 2, // Extra tiles to load around viewport
    MAX_TILES_IN_VIEW: 100,

    // Continent dimensions (Guild Wars 2 world coordinates)
    CONTINENT_WIDTH: 32768,
    CONTINENT_HEIGHT: 32768,

    // Boundary calculation
    BOUNDARY_PADDING: 100, // Extra space around boundary for panning
    ASPECT_RATIO_TOLERANCE: 0.05, // 5% tolerance for aspect ratio matching

    // Default zoom to fit map
    FIT_PADDING: 50 // Pixels of padding when fitting map to viewport
};

// ==============================================================================
// LAYER color PALETTE
// These colors are chosen to stand out against the earthy GW2 homestead map
// while remaining visually distinct from each other.
// ==============================================================================
export const GUILD_HALL_MAP_IDS: ReadonlySet<number> = new Set([1121, 1124, 1232, 1462]);

export const LAYER_COLORS: readonly string[] = [
    '#ff44cc', // pink
    '#ff4444', // red
    '#ff8800', // orange
    '#ffcc00', // yellow
    '#66ff44', // green
    '#00ffcc', // teal
    '#00d4ff', // blue
    '#aa44ff', // purple
];

// ==============================================================================
// CACHE CONFIGURATION
// ==============================================================================

export const CACHE = {
    // API cache durations (in seconds)
    API_DEFAULT_TTL: 3600, // 1 hour
    MAP_DATA_TTL: 604800, // 7 days (map data rarely changes)
    CONTINENT_DATA_TTL: 604800, // 7 days
    FLOOR_DATA_TTL: 86400, // 1 day

    // Local storage cache
    STORAGE_PREFIX: 'gw2-decoration-editor',
    LAYOUT_STORAGE_KEY: 'gw2-layouts',
    CACHE_STORAGE_KEY: 'gw2-cache',

    // Cache size limits
    MAX_CACHE_SIZE_MB: 50,
    MAX_ITEMS_PER_TYPE: 1000,

    // Cleanup
    CLEANUP_INTERVAL_MS: 3600000, // Run cleanup every hour
    EXPIRED_ITEM_THRESHOLD: 86400000 // Delete items expired > 1 day ago
};

// ==============================================================================
// API CONFIGURATION
// ==============================================================================

export const API = {
    // Base URL for the GW2 API
    BASE_URL: 'https://api.guildwars2.com',

    // API endpoints
    ENDPOINTS: {
        MAPS: '/v2/maps',
        CONTINENTS: '/v2/continents',
        MAP_FLOOR: '/v1/map_floor.json'
    },

    // Request timeouts (milliseconds)
    TIMEOUT: 10000, // 10 seconds
    RETRY_TIMEOUT: 30000, // 30 seconds for retry operations

    // Retry strategy
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000, // Initial delay in milliseconds (exponential backoff)
    RETRY_BACKOFF_MULTIPLIER: 2,

    // Rate limiting
    REQUEST_DELAY_MS: 100, // Minimum delay between requests
    BATCH_REQUEST_LIMIT: 10 // Max concurrent requests
};

// ==============================================================================
// VALIDATION CONFIGURATION
// ==============================================================================

export const VALIDATION = {
    // String field lengths
    NAME_MIN_LENGTH: 1,
    NAME_MAX_LENGTH: 255,
    ID_MIN_LENGTH: 1,
    ID_MAX_LENGTH: 100,

    // Numeric limits
    POSITION_MIN: -32768,
    POSITION_MAX: 32768,
    ROTATION_MIN: 0,
    ROTATION_MAX: 360,
    SCALE_MIN: 0.1,
    SCALE_MAX: 10,
    ZOOM_MIN: 0.01,
    ZOOM_MAX: 100,

    // Decoration limits
    MAX_DECORATIONS_PER_LAYER: 10000,
    MAX_LAYERS_PER_LAYOUT: 100,

    // Layout rules
    MIN_LAYERS_REQUIRED: 1,
    REQUIRE_MAP_LOADED: true,

    // Validation patterns
    NAME_PATTERN: /^[a-zA-Z0-9_\-\s().,]+$/,
    ID_PATTERN: /^[a-zA-Z0-9_\-]+$/
};

// ==============================================================================
// FILE OPERATIONS
// ==============================================================================

export const FILE = {
    // Supported file types
    ACCEPTED_TYPES: ['.xml', 'text/xml', 'application/xml'],
    MAX_FILE_SIZE_MB: 10,

    // Export format
    EXPORT_FORMAT: 'xml',
    EXPORT_PRETTY_PRINT: true,

    // Default filename
    DEFAULT_EXPORT_NAME: 'layout.xml'
};

// ==============================================================================
// KEYBOARD SHORTCUTS
// ==============================================================================

export const SHORTCUTS = {
    // Navigation
    ZOOM_IN: 'ctrl++',
    ZOOM_OUT: 'ctrl+-',
    RESET_ZOOM: 'ctrl+0',
    FIT_TO_VIEW: 'ctrl+shift+f',

    // Editing
    UNDO: 'ctrl+z',
    REDO: 'ctrl+y',
    DELETE: 'Delete',
    COPY: 'ctrl+c',
    PASTE: 'ctrl+v',

    // Layers
    NEW_LAYER: 'ctrl+shift+n',
    DELETE_LAYER: 'ctrl+shift+d',
    TOGGLE_VISIBILITY: 'ctrl+shift+v'
};

// ==============================================================================
// LAYOUT CONFIGURATION
// ==============================================================================

export const PANEL_IDS = {
    MAP: 'map',
    LAYERS: 'layers',
    DECORATION_LIST: 'decorationList',
};

export const LAYOUT = {
    // Minimum panel dimensions (pixels)
    MIN_PANEL_WIDTH: 120,
    MIN_PANEL_HEIGHT: 80,

    // Edge threshold for viewport-edge drop zones (pixels from viewport edge)
    EDGE_THRESHOLD_PX: 60,

    // Default ratio for newly docked panels (panel gets 25% of split space)
    DEFAULT_DOCK_RATIO: 0.25,

    // Map must occupy at least this proportion of the viewport
    MAP_MIN_RATIO: 0.5,

    // Divider resize ratio bounds
    SPLIT_RATIO_MIN: 0.1,
    SPLIT_RATIO_MAX: 0.9,

    // Maximum depth of the layout tree
    MAX_TREE_DEPTH: 10,

    // localStorage key for persisted layout
    LAYOUT_STORAGE_KEY: 'gw2-decoration-editor-layout'
};

// ==============================================================================
// SETTINGS CONFIGURATION
// ==============================================================================

export const SETTINGS = {
    // localStorage key for persisted settings
    SETTINGS_STORAGE_KEY: 'gw2-decoration-editor-settings'
};

// ==============================================================================
// DEBUG/DEVELOPMENT
// ==============================================================================

export const DEBUG = {
    // Enable debug logging
    ENABLE_LOGGING: false,
    LOG_API_CALLS: false,
    LOG_CACHE_OPERATIONS: false,
    LOG_COORDINATE_CONVERSIONS: false,

    // Render debug info
    SHOW_TILE_GRID: false,
    SHOW_COORDINATE_LABELS: false,
    SHOW_PERFORMANCE_METRICS: false
};
