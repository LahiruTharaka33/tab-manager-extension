// core/workspace-controller.js — Central orchestrator for the workspace switch lifecycle

import { persistSnapshot, loadSnapshot, deleteSnapshot } from './session-store.js';
import {
  getActiveWorkspace,
  setActiveWorkspace,
  updateTabCount,
  deleteWorkspace as removeWorkspace,
  createWorkspace,
  listWorkspaces,
  renameWorkspace,
  initializeDefaultWorkspace,
} from './group-manager.js';
import {
  getCurrentWindowTabs,
  closeAllTabs,
  restoreTabs,
  captureScrollPositions,
  captureAndCloseTab,
} from './tab-manager.js';
import { getSnapshot, saveSnapshot } from '../storage/local-storage.js';

/**
 * @typedef {'idle'|'saving'|'closing'|'restoring'} SwitchState
 */

/** Current state of the switch lifecycle for UI feedback. */
let switchState = 'idle';

/** Lock to prevent concurrent switches. */
let isSwitching = false;

/**
 * Returns the current switch lifecycle state.
 *
 * @returns {SwitchState} Current state
 */
export function getSwitchState() {
  return switchState;
}

/**
 * Returns whether a workspace switch is currently in progress.
 *
 * @returns {boolean}
 */
export function isSwitchInProgress() {
  return isSwitching;
}

/**
 * Executes the full workspace switch lifecycle:
 * 1. SNAPSHOT  → capture all open tabs + scroll positions
 * 2. SAVE     → persist snapshot to local storage
 * 3. TEARDOWN → close all tabs in current window
 * 4. MARK     → set current workspace inactive, target workspace active
 * 5. RESTORE  → load target workspace's snapshot
 * 6. OPEN     → create tabs from snapshot
 * 7. STATES   → re-apply pinned/muted states
 *
 * @param {string} targetWorkspaceId - The workspace to switch to
 * @returns {Promise<{previousWorkspaceId: string, restoredTabCount: number}>}
 * @throws {Error} If the switch fails at any step
 */
export async function switchWorkspace(targetWorkspaceId) {
  if (isSwitching) {
    throw new Error('A workspace switch is already in progress.');
  }

  const currentWorkspace = await getActiveWorkspace();
  if (!currentWorkspace) {
    throw new Error('No active workspace found. Run initialization first.');
  }

  if (currentWorkspace.id === targetWorkspaceId) {
    throw new Error('Target workspace is already active.');
  }

  isSwitching = true;

  try {
    // Step 1: SNAPSHOT — capture scroll positions, then read all tabs
    switchState = 'saving';
    const scrollPositions = await captureScrollPositions();
    const currentTabs = await getCurrentWindowTabs();

    // Step 2: SAVE — persist the snapshot
    await persistSnapshot(currentWorkspace.id, currentTabs, scrollPositions);
    await updateTabCount(currentWorkspace.id, currentTabs.length);

    // Step 3: TEARDOWN — close all tabs (creates a placeholder)
    switchState = 'closing';
    const placeholderTabId = await closeAllTabs();

    // Step 4: MARK — update active flags
    await setActiveWorkspace(targetWorkspaceId);

    // Step 5 & 6: RESTORE + OPEN — load snapshot and create tabs
    switchState = 'restoring';
    const tabDescriptors = await loadSnapshot(targetWorkspaceId);
    let restoredTabs = [];

    if (tabDescriptors.length > 0) {
      restoredTabs = await restoreTabs(tabDescriptors, placeholderTabId);
    } else {
      // No snapshot for target — keep the placeholder as a blank new tab
      try {
        await chrome.tabs.update(placeholderTabId, { active: true });
      } catch {
        // Placeholder may have been closed
      }
    }

    // Update tab count on the target workspace
    await updateTabCount(targetWorkspaceId, restoredTabs.length || 1);

    return {
      previousWorkspaceId: currentWorkspace.id,
      restoredTabCount: restoredTabs.length,
    };
  } finally {
    isSwitching = false;
    switchState = 'idle';
  }
}

/**
 * Creates a new workspace. Does not switch to it.
 *
 * @param {string} name - Workspace display name
 * @param {string} [color] - Hex color from the palette
 * @returns {Promise<Object>} The created workspace metadata
 * @throws {Error} If creation fails
 */
export async function createNewWorkspace(name, color) {
  return createWorkspace(name, color);
}

/**
 * Deletes a sleeping workspace and its stored snapshot.
 * Cannot delete the active workspace.
 *
 * @param {string} workspaceId - The workspace ID to delete
 * @returns {Promise<void>}
 * @throws {Error} If the workspace is active, not found, or deletion fails
 */
export async function deleteWorkspaceWithSnapshot(workspaceId) {
  await removeWorkspace(workspaceId);
  await deleteSnapshot(workspaceId);
}

/**
 * Moves a tab from the current window into a sleeping workspace's snapshot.
 * The tab is captured (URL, title, scroll, etc.), closed, and appended
 * to the target workspace's stored snapshot.
 *
 * @param {number} tabId - The tab ID to move
 * @param {string} targetWorkspaceId - The sleeping workspace to add the tab to
 * @returns {Promise<void>}
 * @throws {Error} If the target workspace is active or the operation fails
 */
export async function moveTabToWorkspace(tabId, targetWorkspaceId) {
  const activeWorkspace = await getActiveWorkspace();
  if (activeWorkspace && activeWorkspace.id === targetWorkspaceId) {
    throw new Error('Cannot move a tab to the currently active workspace.');
  }

  const tabDescriptor = await captureAndCloseTab(tabId);

  const existingSnapshot = await getSnapshot(targetWorkspaceId);
  const tabs = existingSnapshot?.tabs || [];
  tabDescriptor.index = tabs.length;
  tabs.push(tabDescriptor);

  await saveSnapshot(targetWorkspaceId, {
    workspaceId: targetWorkspaceId,
    savedAt: Date.now(),
    tabs,
  });

  await updateTabCount(targetWorkspaceId, tabs.length);

  if (activeWorkspace) {
    const currentTabs = await getCurrentWindowTabs();
    await updateTabCount(activeWorkspace.id, currentTabs.length);
  }
}

/**
 * Renames a workspace.
 *
 * @param {string} workspaceId - The workspace ID to rename
 * @param {string} newName - The new display name
 * @returns {Promise<Object>} The updated workspace metadata
 * @throws {Error} If the workspace is not found or rename fails
 */
export async function renameWorkspaceById(workspaceId, newName) {
  return renameWorkspace(workspaceId, newName);
}

/**
 * Returns all workspace metadata for UI rendering.
 *
 * @returns {Promise<Array<Object>>} Array of workspace metadata objects
 */
export async function getAllWorkspaces() {
  return listWorkspaces();
}

/**
 * Returns the tab preview list for a sleeping workspace.
 * Used by the side panel to show tab titles/favicons in expanded view.
 *
 * @param {string} workspaceId - The workspace ID to preview
 * @returns {Promise<Array<Object>>} Array of tab descriptors (url, title, favIconUrl)
 */
export async function getWorkspaceTabPreview(workspaceId) {
  const snapshot = await getSnapshot(workspaceId);
  if (!snapshot || !Array.isArray(snapshot.tabs)) {
    return [];
  }
  return snapshot.tabs.map((tab) => ({
    url: tab.url,
    title: tab.title,
    favIconUrl: tab.favIconUrl,
  }));
}

/**
 * Initializes TabVault on first install.
 * Creates the default workspace if none exist.
 *
 * @returns {Promise<Object|null>} The default workspace if created, null if already initialized
 */
export async function initialize() {
  return initializeDefaultWorkspace();
}
