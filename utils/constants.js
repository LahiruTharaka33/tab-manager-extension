// utils/constants.js — Central store for all shared constants: color palette, storage keys, and default values

/**
 * Fixed palette of 8 workspace colors.
 * Each workspace is assigned one of these colors on creation.
 * @type {readonly string[]}
 */
export const WORKSPACE_COLORS = Object.freeze([
  '#4A90E2', // Blue
  '#E24A4A', // Red
  '#4AE26A', // Green
  '#E2B84A', // Yellow
  '#9B4AE2', // Purple
  '#4AE2D8', // Teal
  '#E2774A', // Orange
  '#A0A0A0', // Gray
]);

/**
 * Storage key constants used across chrome.storage.local and chrome.storage.sync.
 * @enum {string}
 */
export const STORAGE_KEYS = Object.freeze({
  /** Array of workspace metadata objects (stored in sync storage) */
  WORKSPACES: 'workspaces',

  /**
   * Prefix for per-workspace tab snapshot keys (stored in local storage).
   * Full key: `snapshot:${workspaceId}`
   */
  SNAPSHOT_PREFIX: 'snapshot:',

  /** User preferences / settings (stored in sync storage) */
  SETTINGS: 'tabvault_settings',
});

/**
 * Workspace ID prefix. All workspace IDs start with this string.
 * @type {string}
 */
export const WORKSPACE_ID_PREFIX = 'ws_';

/**
 * Maximum number of workspaces a user can create.
 * Keeps sync storage well within the 100KB quota.
 * @type {number}
 */
export const MAX_WORKSPACES = 50;

/**
 * Default settings applied on first install.
 * @type {Readonly<{cloudSyncEnabled: boolean, theme: string}>}
 */
export const DEFAULT_SETTINGS = Object.freeze({
  cloudSyncEnabled: false,
  theme: 'system',
});

/**
 * Default workspace created on first install.
 * @type {Readonly<{name: string, color: string}>}
 */
export const DEFAULT_WORKSPACE = Object.freeze({
  name: 'Default',
  color: WORKSPACE_COLORS[0],
});

/**
 * Popup UI dimensions (in pixels).
 * @type {Readonly<{width: number, maxHeight: number}>}
 */
export const POPUP_DIMENSIONS = Object.freeze({
  width: 320,
  maxHeight: 480,
});

/**
 * Length of the random portion of workspace IDs (characters after the prefix).
 * @type {number}
 */
export const WORKSPACE_ID_LENGTH = 12;

/**
 * Interval thresholds for relative time formatting (in milliseconds).
 * @type {Readonly<{MINUTE: number, HOUR: number, DAY: number, WEEK: number, MONTH: number, YEAR: number}>}
 */
export const TIME_UNITS = Object.freeze({
  MINUTE: 60_000,
  HOUR: 3_600_000,
  DAY: 86_400_000,
  WEEK: 604_800_000,
  MONTH: 2_592_000_000,
  YEAR: 31_536_000_000,
});
