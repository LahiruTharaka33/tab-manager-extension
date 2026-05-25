// background/service-worker.js — MV3 service worker orchestrating all tab lifecycle events and message routing

import {
  initialize,
  switchWorkspace,
  createNewWorkspace,
  deleteWorkspaceWithSnapshot,
  moveTabToWorkspace,
  renameWorkspaceById,
  getAllWorkspaces,
  getWorkspaceTabPreview,
  getSwitchState,
  isSwitchInProgress,
  saveActiveWorkspaceSnapshot,
  restoreActiveWorkspaceOnStartup,
} from '../core/workspace-controller.js';
import { getActiveWorkspace, updateTabCount } from '../core/group-manager.js';
import { getCurrentWindowTabs } from '../core/tab-manager.js';

/**
 * Runs on extension install or update.
 * Creates the default workspace if this is a fresh install.
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    try {
      const workspace = await initialize();
      if (workspace) {
        console.log('[TabVault] Initialized with default workspace:', workspace.name);
      }
    } catch (error) {
      console.error('[TabVault] Initialization failed:', error.message);
    }
  }
});

/**
 * Runs when the service worker starts (browser launch or wake from idle).
 * Ensures workspace metadata stays in sync with actual tab count.
 */
chrome.runtime.onStartup.addListener(async () => {
  try {
    const restored = await restoreActiveWorkspaceOnStartup();
    if (restored) {
      console.log('[TabVault] Restored active workspace tabs on startup');
    }
  } catch (error) {
    console.error('[TabVault] Startup restore failed:', error.message);
  }
});

/**
 * Central message handler. All popup/sidepanel communication goes through here.
 *
 * Message format: { action: string, payload?: any }
 * Response format: { success: boolean, data?: any, error?: string }
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message)
    .then((data) => sendResponse({ success: true, data }))
    .catch((error) => sendResponse({ success: false, error: error.message }));

  // Return true to keep the message channel open for async response
  return true;
});

/**
 * Routes incoming messages to the appropriate handler.
 *
 * @param {Object} message - The message object with action and optional payload
 * @returns {Promise<*>} The result data to send back
 * @throws {Error} If the action is unknown or the handler fails
 */
async function handleMessage(message) {
  const { action, payload } = message;

  switch (action) {
    case 'GET_WORKSPACES':
      return getAllWorkspaces();

    case 'GET_ACTIVE_WORKSPACE':
      return getActiveWorkspace();

    case 'SWITCH_WORKSPACE':
      return switchWorkspace(payload.workspaceId);

    case 'CREATE_WORKSPACE':
      return createNewWorkspace(payload.name, payload.color);

    case 'DELETE_WORKSPACE':
      return deleteWorkspaceWithSnapshot(payload.workspaceId);

    case 'RENAME_WORKSPACE':
      return renameWorkspaceById(payload.workspaceId, payload.newName);

    case 'MOVE_TAB_TO_WORKSPACE':
      return moveTabToWorkspace(payload.tabId, payload.workspaceId);

    case 'GET_TAB_PREVIEW':
      return getWorkspaceTabPreview(payload.workspaceId);

    case 'GET_SWITCH_STATE':
      return getSwitchState();

    case 'IS_SWITCH_IN_PROGRESS':
      return isSwitchInProgress();

    case 'SYNC_TAB_COUNT': {
      const active = await getActiveWorkspace();
      if (active) {
        const tabs = await getCurrentWindowTabs();
        await updateTabCount(active.id, tabs.length);
        return { tabCount: tabs.length };
      }
      return { tabCount: 0 };
    }

    default:
      throw new Error(`Unknown action: "${action}"`);
  }
}

/**
 * Listens for tab creation/removal to keep the active workspace's
 * tab count in sync in real time.
 */
chrome.tabs.onCreated.addListener(() => { debouncedTabCountSync(); debouncedSnapshotSave(); });
chrome.tabs.onRemoved.addListener(() => { debouncedTabCountSync(); debouncedSnapshotSave(); });
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    debouncedSnapshotSave();
  }
});
chrome.tabs.onMoved.addListener(debouncedSnapshotSave);

/** Timer ID for debounced tab count sync. */
let syncTimer = null;

/** Timer ID for debounced snapshot auto-save. */
let snapshotTimer = null;

/**
 * Debounced tab count synchronization.
 * Waits 500ms after the last tab change before syncing to avoid
 * excessive storage writes during batch operations (e.g., workspace switch).
 */
function debouncedTabCountSync() {
  if (isSwitchInProgress()) return;

  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      const active = await getActiveWorkspace();
      if (active) {
        const tabs = await getCurrentWindowTabs();
        await updateTabCount(active.id, tabs.length);
      }
    } catch (error) {
      console.error('[TabVault] Tab count sync failed:', error.message);
    }
  }, 500);
}

/**
 * Debounced auto-save of the active workspace's tab snapshot.
 * Waits 2s after the last tab change to avoid excessive writes.
 */
function debouncedSnapshotSave() {
  if (isSwitchInProgress()) return;

  clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(async () => {
    try {
      await saveActiveWorkspaceSnapshot();
    } catch (error) {
      console.error('[TabVault] Auto-save snapshot failed:', error.message);
    }
  }, 2000);
}
