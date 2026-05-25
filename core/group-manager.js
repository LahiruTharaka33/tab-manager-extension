// core/group-manager.js — CRUD operations for workspace metadata (stored in sync storage)

import { getWorkspaces, saveWorkspaces } from '../storage/sync-storage.js';
import { generateId } from '../utils/helpers.js';
import { WORKSPACE_COLORS, MAX_WORKSPACES, DEFAULT_WORKSPACE } from '../utils/constants.js';

/**
 * Creates a new workspace with the given name and color.
 * Enforces the maximum workspace limit.
 *
 * @param {string} name - Display name for the workspace
 * @param {string} [color] - Hex color from the palette; defaults to next unused color
 * @returns {Promise<Object>} The newly created workspace metadata object
 * @throws {Error} If the maximum workspace count is reached or storage write fails
 */
export async function createWorkspace(name, color) {
  const workspaces = await getWorkspaces();

  if (workspaces.length >= MAX_WORKSPACES) {
    throw new Error(`Cannot create workspace: maximum of ${MAX_WORKSPACES} workspaces reached.`);
  }

  const resolvedColor = color || pickNextColor(workspaces);
  const now = Date.now();

  const workspace = {
    id: generateId(),
    name: name.trim(),
    color: resolvedColor,
    isActive: false,
    tabCount: 0,
    createdAt: now,
    lastActiveAt: now,
  };

  workspaces.push(workspace);
  await saveWorkspaces(workspaces);
  return workspace;
}

/**
 * Retrieves all workspace metadata objects.
 *
 * @returns {Promise<Array<Object>>} Array of workspace metadata
 * @throws {Error} If the storage read fails
 */
export async function listWorkspaces() {
  return getWorkspaces();
}

/**
 * Finds a single workspace by its ID.
 *
 * @param {string} workspaceId - The workspace ID to find
 * @returns {Promise<Object|undefined>} The workspace metadata, or undefined if not found
 * @throws {Error} If the storage read fails
 */
export async function getWorkspaceById(workspaceId) {
  const workspaces = await getWorkspaces();
  return workspaces.find((ws) => ws.id === workspaceId);
}

/**
 * Returns the currently active workspace (isActive === true).
 *
 * @returns {Promise<Object|undefined>} The active workspace, or undefined if none
 * @throws {Error} If the storage read fails
 */
export async function getActiveWorkspace() {
  const workspaces = await getWorkspaces();
  return workspaces.find((ws) => ws.isActive);
}

/**
 * Renames a workspace.
 *
 * @param {string} workspaceId - The workspace ID to rename
 * @param {string} newName - The new display name
 * @returns {Promise<Object>} The updated workspace metadata
 * @throws {Error} If the workspace is not found or storage write fails
 */
export async function renameWorkspace(workspaceId, newName) {
  const workspaces = await getWorkspaces();
  const workspace = workspaces.find((ws) => ws.id === workspaceId);

  if (!workspace) {
    throw new Error(`Workspace "${workspaceId}" not found.`);
  }

  workspace.name = newName.trim();
  await saveWorkspaces(workspaces);
  return workspace;
}

/**
 * Deletes a workspace by ID.
 * Cannot delete the currently active workspace.
 *
 * @param {string} workspaceId - The workspace ID to delete
 * @returns {Promise<void>}
 * @throws {Error} If the workspace is active, not found, or storage write fails
 */
export async function deleteWorkspace(workspaceId) {
  const workspaces = await getWorkspaces();
  const index = workspaces.findIndex((ws) => ws.id === workspaceId);

  if (index === -1) {
    throw new Error(`Workspace "${workspaceId}" not found.`);
  }

  if (workspaces[index].isActive) {
    throw new Error('Cannot delete the active workspace. Switch to another workspace first.');
  }

  workspaces.splice(index, 1);
  await saveWorkspaces(workspaces);
}

/**
 * Updates the isActive flag on workspaces: sets the target to active
 * and all others to inactive. Also updates lastActiveAt on the target.
 *
 * @param {string} workspaceId - The workspace ID to mark as active
 * @returns {Promise<Object>} The newly activated workspace metadata
 * @throws {Error} If the workspace is not found or storage write fails
 */
export async function setActiveWorkspace(workspaceId) {
  const workspaces = await getWorkspaces();
  let target = null;

  for (const ws of workspaces) {
    if (ws.id === workspaceId) {
      ws.isActive = true;
      ws.lastActiveAt = Date.now();
      target = ws;
    } else {
      ws.isActive = false;
    }
  }

  if (!target) {
    throw new Error(`Workspace "${workspaceId}" not found.`);
  }

  await saveWorkspaces(workspaces);
  return target;
}

/**
 * Updates the tab count on a workspace's metadata.
 *
 * @param {string} workspaceId - The workspace ID to update
 * @param {number} tabCount - The new tab count
 * @returns {Promise<void>}
 * @throws {Error} If the workspace is not found or storage write fails
 */
export async function updateTabCount(workspaceId, tabCount) {
  const workspaces = await getWorkspaces();
  const workspace = workspaces.find((ws) => ws.id === workspaceId);

  if (!workspace) {
    throw new Error(`Workspace "${workspaceId}" not found.`);
  }

  workspace.tabCount = tabCount;
  await saveWorkspaces(workspaces);
}

/**
 * Initializes storage with a default workspace on first install.
 * No-op if workspaces already exist.
 *
 * @returns {Promise<Object|null>} The created default workspace, or null if already initialized
 * @throws {Error} If the storage write fails
 */
export async function initializeDefaultWorkspace() {
  const workspaces = await getWorkspaces();
  if (workspaces.length > 0) {
    return null;
  }

  const now = Date.now();
  const defaultWs = {
    id: generateId(),
    name: DEFAULT_WORKSPACE.name,
    color: DEFAULT_WORKSPACE.color,
    isActive: true,
    tabCount: 0,
    createdAt: now,
    lastActiveAt: now,
  };

  await saveWorkspaces([defaultWs]);
  return defaultWs;
}

/**
 * Picks the next color from the palette that isn't already used.
 * Falls back to the first color if all are taken.
 *
 * @param {Array<Object>} workspaces - Current workspace list
 * @returns {string} Hex color string
 */
function pickNextColor(workspaces) {
  const usedColors = new Set(workspaces.map((ws) => ws.color));
  const available = WORKSPACE_COLORS.find((c) => !usedColors.has(c));
  return available || WORKSPACE_COLORS[0];
}
