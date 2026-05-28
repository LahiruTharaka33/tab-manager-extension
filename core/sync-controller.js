// core/sync-controller.js — Orchestrates bidirectional sync between local and cloud storage

import { SYNC_STATUS, CLOUD_STORAGE_KEYS } from '../utils/constants.js';
import { localGet, localSet, getSnapshot, saveSnapshot } from '../storage/local-storage.js';
import { getSettings, saveSettings } from '../storage/sync-storage.js';
import { listWorkspaces } from './group-manager.js';
import { getCurrentUser } from './auth-service.js';
import {
  uploadSnapshot,
  downloadSnapshot,
  listCloudSnapshots,
  deleteCloudSnapshot,
  setCloudLastSyncTime,
} from '../storage/cloud-storage.js';

/** @type {string} Current sync status */
let syncStatus = SYNC_STATUS.IDLE;

/** @type {string|null} Last sync error message */
let lastSyncError = null;

/** @type {number} Timestamp of last successful sync */
let lastSyncTime = 0;

/** @type {boolean} Whether a sync operation is currently in progress */
let isSyncing = false;

/**
 * Returns the current sync status.
 *
 * @returns {{status: string, lastSyncTime: number, error: string|null}}
 */
export function getSyncStatus() {
  return {
    status: syncStatus,
    lastSyncTime,
    error: lastSyncError,
  };
}

/**
 * Syncs a single workspace bidirectionally between local and cloud.
 * Uses last-write-wins conflict resolution based on savedAt timestamp.
 *
 * @param {string} workspaceId - The workspace to sync
 * @returns {Promise<void>}
 * @throws {Error} If sync fails
 */
export async function syncWorkspace(workspaceId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const deviceId = await getDeviceId();
  const localSnapshot = await getSnapshot(workspaceId);
  const cloudSnapshot = await downloadSnapshot(user.uid, workspaceId);

  if (localSnapshot && !cloudSnapshot) {
    localSnapshot.deviceId = deviceId;
    await uploadSnapshot(user.uid, workspaceId, localSnapshot);
  } else if (!localSnapshot && cloudSnapshot) {
    await saveSnapshot(workspaceId, cloudSnapshot);
  } else if (localSnapshot && cloudSnapshot) {
    resolveConflict(localSnapshot, cloudSnapshot, workspaceId, user.uid, deviceId);
  }
}

/**
 * Syncs all workspaces bidirectionally.
 *
 * @returns {Promise<void>}
 */
export async function syncAllWorkspaces() {
  if (isSyncing) return;

  const settings = await getSettings();
  if (!settings.cloudSyncEnabled) return;

  const user = await getCurrentUser();
  if (!user) {
    syncStatus = SYNC_STATUS.ERROR;
    lastSyncError = 'Not authenticated';
    return;
  }

  isSyncing = true;
  syncStatus = SYNC_STATUS.SYNCING;
  lastSyncError = null;

  try {
    const deviceId = await getDeviceId();
    const workspaces = await listWorkspaces();
    const cloudSnapshots = await listCloudSnapshots(user.uid);

    const cloudMap = new Map();
    for (const snap of cloudSnapshots) {
      if (snap.workspaceId) {
        cloudMap.set(snap.workspaceId, snap);
      }
    }

    for (const ws of workspaces) {
      const localSnapshot = await getSnapshot(ws.id);
      const cloudSnapshot = cloudMap.get(ws.id);

      if (localSnapshot && !cloudSnapshot) {
        localSnapshot.deviceId = deviceId;
        await uploadSnapshot(user.uid, ws.id, localSnapshot);
      } else if (!localSnapshot && cloudSnapshot) {
        await saveSnapshot(ws.id, cloudSnapshot);
      } else if (localSnapshot && cloudSnapshot) {
        await resolveConflict(localSnapshot, cloudSnapshot, ws.id, user.uid, deviceId);
      }

      cloudMap.delete(ws.id);
    }

    // Download cloud-only snapshots (from other devices)
    for (const [workspaceId, cloudSnapshot] of cloudMap) {
      await saveSnapshot(workspaceId, cloudSnapshot);
    }

    const now = Date.now();
    lastSyncTime = now;
    await localSet(CLOUD_STORAGE_KEYS.LAST_SYNC_TIME, now);
    await setCloudLastSyncTime(user.uid, now);

    syncStatus = SYNC_STATUS.SUCCESS;
  } catch (error) {
    syncStatus = SYNC_STATUS.ERROR;
    lastSyncError = error.message;
    console.error('[SyncController] Sync failed:', error.message);
  } finally {
    isSyncing = false;
  }
}

/**
 * Resolves a conflict between local and cloud snapshots.
 * Uses last-write-wins based on savedAt timestamp.
 *
 * @param {Object} local - Local snapshot
 * @param {Object} cloud - Cloud snapshot
 * @param {string} workspaceId - The workspace ID
 * @param {string} userId - The user's ID
 * @param {string} deviceId - This device's ID
 * @returns {Promise<void>}
 */
async function resolveConflict(local, cloud, workspaceId, userId, deviceId) {
  const localTime = local.savedAt || 0;
  const cloudTime = cloud.savedAt || 0;

  if (localTime >= cloudTime) {
    local.deviceId = deviceId;
    await uploadSnapshot(userId, workspaceId, local);
  } else {
    await saveSnapshot(workspaceId, cloud);
  }
}

/**
 * Enables cloud sync: saves the setting and performs an initial full sync.
 *
 * @returns {Promise<void>}
 */
export async function enableCloudSync() {
  await saveSettings({ cloudSyncEnabled: true });
  await syncAllWorkspaces();
}

/**
 * Disables cloud sync. Local data is kept intact.
 *
 * @returns {Promise<void>}
 */
export async function disableCloudSync() {
  await saveSettings({ cloudSyncEnabled: false });
  syncStatus = SYNC_STATUS.IDLE;
  lastSyncError = null;
}

/**
 * Retrieves (or generates) a unique device ID for this browser installation.
 *
 * @returns {Promise<string>}
 */
async function getDeviceId() {
  let deviceId = await localGet(CLOUD_STORAGE_KEYS.DEVICE_ID);
  if (!deviceId) {
    deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    await localSet(CLOUD_STORAGE_KEYS.DEVICE_ID, deviceId);
  }
  return deviceId;
}

/**
 * Initializes the device ID on first install.
 *
 * @returns {Promise<string>} The device ID
 */
export async function initializeDeviceId() {
  return getDeviceId();
}
