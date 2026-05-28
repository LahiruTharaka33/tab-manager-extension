// core/session-store.js — Serialize open browser tabs into snapshots and deserialize them for restoration

import { getSnapshot, saveSnapshot, removeSnapshot } from '../storage/local-storage.js';
import { getSettings } from '../storage/sync-storage.js';
import { syncWorkspace, getSyncStatus } from './sync-controller.js';

/**
 * Serializes an array of chrome.tabs.Tab objects into a lightweight snapshot.
 * Captures only the fields needed for faithful restoration.
 *
 * @param {string} workspaceId - The workspace this snapshot belongs to
 * @param {Array<chrome.tabs.Tab>} tabs - Array of live Tab objects from chrome.tabs.query
 * @param {Object} [scrollPositions={}] - Map of tabId → scrollY values captured by content script
 * @returns {Object} A TabSnapshot object ready for storage
 */
export function serializeTabs(workspaceId, tabs, scrollPositions = {}) {
  const serialized = tabs.map((tab) => ({
    url: tab.url || tab.pendingUrl || '',
    title: tab.title || '',
    favIconUrl: tab.favIconUrl || '',
    pinned: tab.pinned || false,
    muted: tab.mutedInfo?.muted || false,
    index: tab.index,
    scrollY: scrollPositions[tab.id] || 0,
  }));

  return {
    workspaceId,
    savedAt: Date.now(),
    tabs: serialized,
  };
}

/**
 * Deserializes a stored snapshot into an array of tab descriptors
 * suitable for passing to tab-manager's restore functions.
 * Filters out any invalid entries (empty URLs, chrome:// pages that can't be restored).
 *
 * @param {Object} snapshot - A TabSnapshot object from storage
 * @returns {Array<Object>} Array of tab descriptors sorted by index
 */
export function deserializeTabs(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.tabs)) {
    return [];
  }

  return snapshot.tabs
    .filter((tab) => tab.url && isRestorableUrl(tab.url))
    .sort((a, b) => a.index - b.index);
}

/**
 * Checks whether a URL can be opened via chrome.tabs.create().
 * Chrome internal pages (chrome://, chrome-extension://, etc.) cannot be
 * programmatically created and must be skipped during restore.
 *
 * @param {string} url - The URL to check
 * @returns {boolean} True if the URL can be restored
 */
export function isRestorableUrl(url) {
  const blocked = [
    'chrome://',
    'chrome-extension://',
    'devtools://',
    'edge://',
    'about:',
    'chrome-search://',
  ];
  return !blocked.some((prefix) => url.startsWith(prefix));
}

/**
 * Loads a workspace's tab snapshot from storage and deserializes it.
 * Returns an empty array if no snapshot exists.
 *
 * @param {string} workspaceId - The workspace ID to load
 * @returns {Promise<Array<Object>>} Array of restorable tab descriptors
 * @throws {Error} If the storage read fails
 */
export async function loadSnapshot(workspaceId) {
  const snapshot = await getSnapshot(workspaceId);
  if (!snapshot) {
    return [];
  }
  return deserializeTabs(snapshot);
}

/**
 * Serializes current tabs and persists the snapshot to storage.
 *
 * @param {string} workspaceId - The workspace ID to save under
 * @param {Array<chrome.tabs.Tab>} tabs - Live Tab objects to serialize
 * @param {Object} [scrollPositions={}] - Map of tabId → scrollY
 * @returns {Promise<Object>} The saved snapshot object
 * @throws {Error} If the storage write fails
 */
export async function persistSnapshot(workspaceId, tabs, scrollPositions = {}) {
  const snapshot = serializeTabs(workspaceId, tabs, scrollPositions);
  await saveSnapshot(workspaceId, snapshot);

  // Trigger cloud sync if enabled (non-blocking)
  triggerCloudSync(workspaceId);

  return snapshot;
}

/**
 * Deletes a workspace's snapshot from storage.
 *
 * @param {string} workspaceId - The workspace ID whose snapshot should be deleted
 * @returns {Promise<void>}
 * @throws {Error} If the storage removal fails
 */
export async function deleteSnapshot(workspaceId) {
  return removeSnapshot(workspaceId);
}

/**
 * Triggers a non-blocking cloud sync for a workspace if cloud sync is enabled.
 *
 * @param {string} workspaceId
 */
async function triggerCloudSync(workspaceId) {
  try {
    const settings = await getSettings();
    if (!settings.cloudSyncEnabled) return;

    await syncWorkspace(workspaceId);
  } catch (error) {
    console.warn('[SessionStore] Cloud sync failed for workspace:', workspaceId, error.message);
  }
}
