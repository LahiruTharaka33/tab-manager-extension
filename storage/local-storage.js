// storage/local-storage.js — Wrapper around chrome.storage.local for device-only data (tab snapshots)

import { STORAGE_KEYS } from '../utils/constants.js';

/**
 * Reads a value from chrome.storage.local by key.
 *
 * @param {string} key - The storage key to read
 * @returns {Promise<*>} The stored value, or undefined if not found
 * @throws {Error} If the storage read fails
 */
export async function localGet(key) {
  try {
    const result = await chrome.storage.local.get(key);
    return result[key];
  } catch (error) {
    throw new Error(`[LocalStorage] Failed to read key "${key}": ${error.message}`);
  }
}

/**
 * Writes a value to chrome.storage.local.
 *
 * @param {string} key - The storage key to write
 * @param {*} value - The value to store (must be JSON-serializable)
 * @returns {Promise<void>}
 * @throws {Error} If the storage write fails
 */
export async function localSet(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch (error) {
    throw new Error(`[LocalStorage] Failed to write key "${key}": ${error.message}`);
  }
}

/**
 * Removes one or more keys from chrome.storage.local.
 *
 * @param {string|string[]} keys - A single key or array of keys to remove
 * @returns {Promise<void>}
 * @throws {Error} If the storage removal fails
 */
export async function localRemove(keys) {
  try {
    await chrome.storage.local.remove(keys);
  } catch (error) {
    const keyStr = Array.isArray(keys) ? keys.join(', ') : keys;
    throw new Error(`[LocalStorage] Failed to remove key(s) "${keyStr}": ${error.message}`);
  }
}

/**
 * Retrieves a tab snapshot for a given workspace from local storage.
 * Uses the standard key format: `snapshot:${workspaceId}`.
 *
 * @param {string} workspaceId - The workspace ID (e.g. "ws_abc123")
 * @returns {Promise<Object|undefined>} The tab snapshot object, or undefined if none exists
 * @throws {Error} If the storage read fails
 */
export async function getSnapshot(workspaceId) {
  const key = STORAGE_KEYS.SNAPSHOT_PREFIX + workspaceId;
  return localGet(key);
}

/**
 * Saves a tab snapshot for a workspace to local storage.
 * Uses the standard key format: `snapshot:${workspaceId}`.
 *
 * @param {string} workspaceId - The workspace ID (e.g. "ws_abc123")
 * @param {Object} snapshot - The tab snapshot object to store
 * @param {string} snapshot.workspaceId - Must match the workspaceId parameter
 * @param {number} snapshot.savedAt - Timestamp of when the snapshot was taken
 * @param {Array<Object>} snapshot.tabs - Array of serialized tab objects
 * @returns {Promise<void>}
 * @throws {Error} If the storage write fails
 */
export async function saveSnapshot(workspaceId, snapshot) {
  const key = STORAGE_KEYS.SNAPSHOT_PREFIX + workspaceId;
  return localSet(key, snapshot);
}

/**
 * Deletes a tab snapshot for a workspace from local storage.
 * Uses the standard key format: `snapshot:${workspaceId}`.
 *
 * @param {string} workspaceId - The workspace ID (e.g. "ws_abc123")
 * @returns {Promise<void>}
 * @throws {Error} If the storage removal fails
 */
export async function removeSnapshot(workspaceId) {
  const key = STORAGE_KEYS.SNAPSHOT_PREFIX + workspaceId;
  return localRemove(key);
}

/**
 * Returns the total number of bytes currently used by chrome.storage.local.
 * Useful for monitoring storage consumption.
 *
 * @returns {Promise<number>} Bytes in use
 * @throws {Error} If the query fails
 */
export async function getLocalBytesInUse() {
  try {
    return await chrome.storage.local.getBytesInUse(null);
  } catch (error) {
    throw new Error(`[LocalStorage] Failed to get bytes in use: ${error.message}`);
  }
}
