// storage/sync-storage.js — Wrapper around chrome.storage.sync for cross-device data (workspace metadata, settings)

import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../utils/constants.js';

/**
 * Reads a value from chrome.storage.sync by key.
 *
 * @param {string} key - The storage key to read
 * @returns {Promise<*>} The stored value, or undefined if not found
 * @throws {Error} If the storage read fails
 */
export async function syncGet(key) {
  try {
    const result = await chrome.storage.sync.get(key);
    return result[key];
  } catch (error) {
    throw new Error(`[SyncStorage] Failed to read key "${key}": ${error.message}`);
  }
}

/**
 * Writes a value to chrome.storage.sync.
 * Be mindful of quota limits: 100KB total, ~8KB per item.
 *
 * @param {string} key - The storage key to write
 * @param {*} value - The value to store (must be JSON-serializable)
 * @returns {Promise<void>}
 * @throws {Error} If the storage write fails (including quota exceeded)
 */
export async function syncSet(key, value) {
  try {
    await chrome.storage.sync.set({ [key]: value });
  } catch (error) {
    throw new Error(`[SyncStorage] Failed to write key "${key}": ${error.message}`);
  }
}

/**
 * Removes one or more keys from chrome.storage.sync.
 *
 * @param {string|string[]} keys - A single key or array of keys to remove
 * @returns {Promise<void>}
 * @throws {Error} If the storage removal fails
 */
export async function syncRemove(keys) {
  try {
    await chrome.storage.sync.remove(keys);
  } catch (error) {
    const keyStr = Array.isArray(keys) ? keys.join(', ') : keys;
    throw new Error(`[SyncStorage] Failed to remove key(s) "${keyStr}": ${error.message}`);
  }
}

/**
 * Retrieves the workspace metadata list from sync storage.
 * Returns an empty array if no workspaces have been saved yet.
 *
 * @returns {Promise<Array<Object>>} Array of workspace metadata objects
 * @throws {Error} If the storage read fails
 */
export async function getWorkspaces() {
  const workspaces = await syncGet(STORAGE_KEYS.WORKSPACES);
  return workspaces || [];
}

/**
 * Saves the full workspace metadata list to sync storage.
 * This overwrites the existing list — always pass the complete array.
 *
 * @param {Array<Object>} workspaces - Array of workspace metadata objects
 * @returns {Promise<void>}
 * @throws {Error} If the storage write fails
 */
export async function saveWorkspaces(workspaces) {
  return syncSet(STORAGE_KEYS.WORKSPACES, workspaces);
}

/**
 * Retrieves user settings from sync storage.
 * Returns default settings if none have been saved yet.
 *
 * @returns {Promise<Object>} Settings object with cloudSyncEnabled and theme
 * @throws {Error} If the storage read fails
 */
export async function getSettings() {
  const settings = await syncGet(STORAGE_KEYS.SETTINGS);
  return settings || { ...DEFAULT_SETTINGS };
}

/**
 * Saves user settings to sync storage.
 * Merges with existing settings so partial updates are safe.
 *
 * @param {Object} updates - Partial settings object to merge
 * @returns {Promise<void>}
 * @throws {Error} If the storage read or write fails
 */
export async function saveSettings(updates) {
  const current = await getSettings();
  const merged = { ...current, ...updates };
  return syncSet(STORAGE_KEYS.SETTINGS, merged);
}

/**
 * Returns the total number of bytes currently used by chrome.storage.sync.
 * Useful for monitoring quota consumption (100KB limit).
 *
 * @returns {Promise<number>} Bytes in use
 * @throws {Error} If the query fails
 */
export async function getSyncBytesInUse() {
  try {
    return await chrome.storage.sync.getBytesInUse(null);
  } catch (error) {
    throw new Error(`[SyncStorage] Failed to get bytes in use: ${error.message}`);
  }
}
