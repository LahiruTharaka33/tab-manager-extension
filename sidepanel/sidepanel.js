// sidepanel/sidepanel.js — Full workspace manager logic for the side panel

import { WORKSPACE_COLORS } from '../utils/constants.js';
import { formatRelativeTime } from '../utils/helpers.js';

/** @type {string} Selected color for new workspace */
let selectedColor = WORKSPACE_COLORS[0];

/** @type {string|null} Workspace ID pending deletion */
let pendingDeleteId = null;

/** @type {string|null} Workspace ID pending rename */
let pendingRenameId = null;

/** @type {Set<string>} IDs of workspaces with expanded tab previews */
const expandedWorkspaces = new Set();

// ── DOM references ──

const loadingEl = document.getElementById('loading');
const activeSection = document.getElementById('active-section');
const activeCard = document.getElementById('active-card');
const sleepingSection = document.getElementById('sleeping-section');
const sleepingList = document.getElementById('sleeping-list');
const emptyState = document.getElementById('empty-state');
const errorBanner = document.getElementById('error-banner');
const errorText = document.getElementById('error-text');
const errorDismiss = document.getElementById('error-dismiss');
const searchInput = document.getElementById('search-input');
const newWorkspaceBtn = document.getElementById('new-workspace-btn');
const newWorkspaceForm = document.getElementById('new-workspace-form');
const newNameInput = document.getElementById('new-name');
const colorPickerEl = document.getElementById('color-picker');
const createBtn = document.getElementById('create-btn');
const cancelBtn = document.getElementById('cancel-btn');
const switchOverlay = document.getElementById('switch-overlay');
const switchStatus = document.getElementById('switch-status');
const deleteDialog = document.getElementById('delete-dialog');
const deleteWsName = document.getElementById('delete-ws-name');
const deleteConfirm = document.getElementById('delete-confirm');
const deleteCancel = document.getElementById('delete-cancel');
const renameDialog = document.getElementById('rename-dialog');
const renameInput = document.getElementById('rename-input');
const renameConfirm = document.getElementById('rename-confirm');
const renameCancel = document.getElementById('rename-cancel');
const syncBadge = document.getElementById('sync-badge');
const syncBadgeDot = document.getElementById('sync-badge-dot');
const syncBadgeText = document.getElementById('sync-badge-text');

// ── Initialization ──

document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupColorPicker();
  bindEvents();
  await loadWorkspaces();
  await updateSyncBadge();
  startSyncBadgePoll();
}

// ── Data loading ──

/**
 * Fetches workspace list and renders both active card and sleeping list.
 */
async function loadWorkspaces() {
  showLoading(true);
  hideError();

  try {
    const response = await sendMessage('GET_WORKSPACES');
    const workspaces = response;

    const active = workspaces.find((ws) => ws.isActive);
    const sleeping = workspaces.filter((ws) => !ws.isActive);

    if (active) {
      renderActiveCard(active);
      activeSection.classList.remove('hidden');
    } else {
      activeSection.classList.add('hidden');
    }

    renderSleepingList(sleeping);
  } catch (error) {
    showError(error.message || 'Failed to load workspaces.');
  } finally {
    showLoading(false);
  }
}

// ── Rendering ──

/**
 * Renders the active workspace card.
 *
 * @param {Object} ws - Active workspace metadata
 */
function renderActiveCard(ws) {
  activeCard.style.setProperty('--ws-color', ws.color);
  activeCard.innerHTML = `
    <span class="active-card__color" style="background-color: ${ws.color}"></span>
    <div class="active-card__info">
      <div class="active-card__name">${escapeHtml(ws.name)}</div>
      <div class="active-card__meta">${ws.tabCount} tab${ws.tabCount !== 1 ? 's' : ''} · Active now</div>
    </div>
    <button class="active-card__edit" data-id="${ws.id}" title="Rename">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M10 2l2 2-7 7H3v-2l7-7z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
      </svg>
    </button>
  `;

  activeCard.querySelector('.active-card__edit').addEventListener('click', () => {
    openRenameDialog(ws.id, ws.name);
  });
}

/**
 * Renders the sleeping workspaces list with expandable tab previews.
 *
 * @param {Array<Object>} workspaces - Array of sleeping workspace metadata
 */
function renderSleepingList(workspaces) {
  const query = searchInput.value.toLowerCase().trim();
  const filtered = query
    ? workspaces.filter((ws) => ws.name.toLowerCase().includes(query))
    : workspaces;

  sleepingList.innerHTML = '';

  if (filtered.length === 0) {
    sleepingSection.classList.add('hidden');
    emptyState.classList.remove('hidden');
    emptyState.querySelector('p').textContent = query
      ? 'No matching workspaces.'
      : 'No sleeping workspaces yet.';
    return;
  }

  emptyState.classList.add('hidden');
  sleepingSection.classList.remove('hidden');

  for (const ws of filtered) {
    const isExpanded = expandedWorkspaces.has(ws.id);
    const li = document.createElement('li');
    li.className = 'sleeping-item';

    // Header row
    const header = document.createElement('div');
    header.className = 'sleeping-item__header';
    header.innerHTML = `
      <span class="sleeping-item__color" style="background-color: ${ws.color}"></span>
      <div class="sleeping-item__info">
        <div class="sleeping-item__name">${escapeHtml(ws.name)}</div>
        <div class="sleeping-item__meta">${ws.tabCount} tab${ws.tabCount !== 1 ? 's' : ''} · ${formatRelativeTime(ws.lastActiveAt)}</div>
      </div>
      <svg class="sleeping-item__expand ${isExpanded ? 'sleeping-item__expand--open' : ''}" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

    header.addEventListener('click', () => toggleExpand(ws.id));

    // Tab preview container
    const tabsContainer = document.createElement('div');
    tabsContainer.className = `sleeping-item__tabs${isExpanded ? ' sleeping-item__tabs--open' : ''}`;
    tabsContainer.id = `tabs-${ws.id}`;

    if (isExpanded) {
      loadTabPreview(ws.id, tabsContainer);
    }

    // Action buttons
    const actions = document.createElement('div');
    actions.className = `sleeping-item__actions${isExpanded ? ' sleeping-item__actions--open' : ''}`;
    actions.id = `actions-${ws.id}`;

    const switchBtn = document.createElement('button');
    switchBtn.className = 'action-btn action-btn--switch';
    switchBtn.textContent = 'Switch';
    switchBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleSwitch(ws.id);
    });

    const renameBtn = document.createElement('button');
    renameBtn.className = 'action-btn';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openRenameDialog(ws.id, ws.name);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn action-btn--delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDeleteDialog(ws.id, ws.name);
    });

    actions.appendChild(switchBtn);
    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);

    li.appendChild(header);
    li.appendChild(tabsContainer);
    li.appendChild(actions);
    sleepingList.appendChild(li);
  }
}

/**
 * Toggles the expanded state of a sleeping workspace's tab preview.
 *
 * @param {string} workspaceId
 */
function toggleExpand(workspaceId) {
  const tabsEl = document.getElementById(`tabs-${workspaceId}`);
  const actionsEl = document.getElementById(`actions-${workspaceId}`);
  const item = tabsEl?.closest('.sleeping-item');
  const expandIcon = item?.querySelector('.sleeping-item__expand');

  if (expandedWorkspaces.has(workspaceId)) {
    expandedWorkspaces.delete(workspaceId);
    tabsEl?.classList.remove('sleeping-item__tabs--open');
    actionsEl?.classList.remove('sleeping-item__actions--open');
    expandIcon?.classList.remove('sleeping-item__expand--open');
  } else {
    expandedWorkspaces.add(workspaceId);
    tabsEl?.classList.add('sleeping-item__tabs--open');
    actionsEl?.classList.add('sleeping-item__actions--open');
    expandIcon?.classList.add('sleeping-item__expand--open');
    loadTabPreview(workspaceId, tabsEl);
  }
}

/**
 * Loads and renders tab previews for a sleeping workspace.
 *
 * @param {string} workspaceId
 * @param {HTMLElement} container
 */
async function loadTabPreview(workspaceId, container) {
  if (!container) return;

  container.innerHTML = '<div class="tab-preview" style="color:#80868b">Loading tabs…</div>';

  try {
    const tabs = await sendMessage('GET_TAB_PREVIEW', { workspaceId });

    if (!tabs || tabs.length === 0) {
      container.innerHTML = '<div class="tab-preview" style="color:#80868b">No saved tabs.</div>';
      return;
    }

    container.innerHTML = '';
    for (const tab of tabs) {
      const row = document.createElement('div');
      row.className = 'tab-preview';

      const favicon = document.createElement('img');
      favicon.className = 'tab-preview__favicon';
      favicon.src = tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="%23e8eaed"/></svg>';
      favicon.alt = '';
      favicon.onerror = () => {
        favicon.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="%23e8eaed"/></svg>';
      };

      const title = document.createElement('span');
      title.className = 'tab-preview__title';
      title.textContent = tab.title || tab.url || 'Untitled';

      row.appendChild(favicon);
      row.appendChild(title);
      container.appendChild(row);
    }
  } catch {
    container.innerHTML = '<div class="tab-preview" style="color:#c5221f">Failed to load tabs.</div>';
  }
}

// ── Actions ──

/**
 * Handles switching to a sleeping workspace.
 *
 * @param {string} workspaceId
 */
async function handleSwitch(workspaceId) {
  showSwitchOverlay(true, 'Saving workspace…');

  try {
    const stateInterval = setInterval(async () => {
      try {
        const state = await sendMessage('GET_SWITCH_STATE');
        const labels = {
          saving: 'Saving workspace…',
          closing: 'Closing tabs…',
          restoring: 'Restoring workspace…',
          idle: 'Done!',
        };
        switchStatus.textContent = labels[state] || 'Switching…';
      } catch {
        // Ignore polling errors
      }
    }, 300);

    await sendMessage('SWITCH_WORKSPACE', { workspaceId });
    clearInterval(stateInterval);

    switchStatus.textContent = 'Done!';
    setTimeout(() => loadWorkspaces(), 500);
    setTimeout(() => showSwitchOverlay(false), 600);
  } catch (error) {
    showSwitchOverlay(false);
    showError(error.message || 'Switch failed.');
  }
}

/**
 * Handles creating a new workspace.
 */
async function handleCreate() {
  const name = newNameInput.value.trim();
  if (!name) return;

  createBtn.disabled = true;

  try {
    await sendMessage('CREATE_WORKSPACE', { name, color: selectedColor });
    hideNewWorkspaceForm();
    await loadWorkspaces();
  } catch (error) {
    showError(error.message || 'Failed to create workspace.');
  } finally {
    createBtn.disabled = false;
  }
}

/**
 * Handles confirming workspace deletion.
 */
async function handleDelete() {
  if (!pendingDeleteId) return;

  try {
    await sendMessage('DELETE_WORKSPACE', { workspaceId: pendingDeleteId });
    expandedWorkspaces.delete(pendingDeleteId);
    closeDeleteDialog();
    await loadWorkspaces();
  } catch (error) {
    closeDeleteDialog();
    showError(error.message || 'Failed to delete workspace.');
  }
}

/**
 * Handles confirming workspace rename.
 */
async function handleRename() {
  const newName = renameInput.value.trim();
  if (!pendingRenameId || !newName) return;

  try {
    await sendMessage('RENAME_WORKSPACE', { workspaceId: pendingRenameId, newName });
    closeRenameDialog();
    await loadWorkspaces();
  } catch (error) {
    closeRenameDialog();
    showError(error.message || 'Failed to rename workspace.');
  }
}

// ── Dialogs ──

function openDeleteDialog(workspaceId, name) {
  pendingDeleteId = workspaceId;
  deleteWsName.textContent = name;
  deleteDialog.classList.remove('hidden');
}

function closeDeleteDialog() {
  pendingDeleteId = null;
  deleteDialog.classList.add('hidden');
}

function openRenameDialog(workspaceId, currentName) {
  pendingRenameId = workspaceId;
  renameInput.value = currentName;
  renameDialog.classList.remove('hidden');
  renameInput.focus();
  renameInput.select();
}

function closeRenameDialog() {
  pendingRenameId = null;
  renameDialog.classList.add('hidden');
}

// ── Color picker ──

function setupColorPicker() {
  colorPickerEl.innerHTML = '';

  for (const color of WORKSPACE_COLORS) {
    const swatch = document.createElement('button');
    swatch.className = 'color-picker__swatch';
    swatch.style.backgroundColor = color;
    swatch.title = color;

    if (color === selectedColor) {
      swatch.classList.add('color-picker__swatch--selected');
    }

    swatch.addEventListener('click', () => {
      selectedColor = color;
      colorPickerEl.querySelectorAll('.color-picker__swatch').forEach((s) => {
        s.classList.toggle('color-picker__swatch--selected', s.style.backgroundColor === swatch.style.backgroundColor);
      });
    });

    colorPickerEl.appendChild(swatch);
  }
}

// ── Event binding ──

function bindEvents() {
  newWorkspaceBtn.addEventListener('click', showNewWorkspaceForm);
  cancelBtn.addEventListener('click', hideNewWorkspaceForm);
  createBtn.addEventListener('click', handleCreate);
  errorDismiss.addEventListener('click', hideError);
  deleteConfirm.addEventListener('click', handleDelete);
  deleteCancel.addEventListener('click', closeDeleteDialog);
  renameConfirm.addEventListener('click', handleRename);
  renameCancel.addEventListener('click', closeRenameDialog);

  newNameInput.addEventListener('input', () => {
    createBtn.disabled = !newNameInput.value.trim();
  });

  newNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !createBtn.disabled) handleCreate();
  });

  renameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleRename();
  });

  searchInput.addEventListener('input', () => {
    loadWorkspaces();
  });
}

// ── Messaging ──

/**
 * Sends a message to the service worker and returns the data.
 *
 * @param {string} action
 * @param {Object} [payload]
 * @returns {Promise<*>}
 */
async function sendMessage(action, payload) {
  const response = await chrome.runtime.sendMessage({ action, payload });
  if (!response.success) {
    throw new Error(response.error);
  }
  return response.data;
}

// ── UI helpers ──

function showLoading(visible) {
  loadingEl.classList.toggle('hidden', !visible);
}

function showSwitchOverlay(visible, text) {
  switchOverlay.classList.toggle('hidden', !visible);
  if (text) switchStatus.textContent = text;
}

function showError(msg) {
  errorText.textContent = msg;
  errorBanner.classList.remove('hidden');
}

function hideError() {
  errorBanner.classList.add('hidden');
}

function showNewWorkspaceForm() {
  newWorkspaceForm.classList.remove('hidden');
  newWorkspaceBtn.classList.add('hidden');
  newNameInput.value = '';
  createBtn.disabled = true;
  selectedColor = WORKSPACE_COLORS[0];
  setupColorPicker();
  newNameInput.focus();
}

function hideNewWorkspaceForm() {
  newWorkspaceForm.classList.add('hidden');
  newWorkspaceBtn.classList.remove('hidden');
}

// ── Sync badge ──

/**
 * Updates the sync status badge in the header.
 */
async function updateSyncBadge() {
  try {
    const status = await sendMessage('GET_SYNC_STATUS');
    const settings = await chrome.storage.sync.get('tabvault_settings');
    const cloudEnabled = settings.tabvault_settings?.cloudSyncEnabled || false;

    if (!cloudEnabled) {
      syncBadge.classList.add('hidden');
      return;
    }

    syncBadge.classList.remove('hidden');

    syncBadgeDot.className = 'sync-badge__dot';
    syncBadgeDot.classList.add(`sync-badge__dot--${status.status}`);

    const labels = {
      idle: 'Sync',
      syncing: 'Syncing…',
      success: 'Synced',
      error: 'Sync error',
      offline: 'Offline',
    };
    syncBadgeText.textContent = labels[status.status] || 'Sync';
  } catch {
    syncBadge.classList.add('hidden');
  }
}

/**
 * Polls sync status every 10 seconds to keep the badge up to date.
 */
function startSyncBadgePoll() {
  setInterval(updateSyncBadge, 10_000);
}

/**
 * Escapes HTML special characters to prevent XSS.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
