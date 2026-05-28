// popup/popup.js — Compact workspace switcher logic for the toolbar popup

import { WORKSPACE_COLORS } from '../utils/constants.js';
import { formatRelativeTime } from '../utils/helpers.js';

/** @type {string} Currently selected color for new workspace */
let selectedColor = WORKSPACE_COLORS[0];

// ── DOM references ──

const loadingEl = document.getElementById('loading');
const listEl = document.getElementById('workspace-list');
const errorBanner = document.getElementById('error-banner');
const errorText = document.getElementById('error-text');
const errorDismiss = document.getElementById('error-dismiss');
const newWorkspaceBtn = document.getElementById('new-workspace-btn');
const newWorkspaceForm = document.getElementById('new-workspace-form');
const newNameInput = document.getElementById('new-name');
const colorPickerEl = document.getElementById('color-picker');
const createBtn = document.getElementById('create-btn');
const cancelBtn = document.getElementById('cancel-btn');
const switchOverlay = document.getElementById('switch-overlay');
const switchStatus = document.getElementById('switch-status');
const openSidepanelBtn = document.getElementById('open-sidepanel');

// ── Initialization ──

document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupColorPicker();
  bindEvents();
  await loadWorkspaces();
}

// ── Data loading ──

/**
 * Fetches workspace list from the service worker and renders the UI.
 */
async function loadWorkspaces() {
  showLoading(true);
  hideError();

  try {
    const response = await chrome.runtime.sendMessage({ action: 'GET_WORKSPACES' });

    if (!response.success) {
      throw new Error(response.error);
    }

    renderWorkspaceList(response.data);
  } catch (error) {
    showError(error.message || 'Failed to load workspaces.');
  } finally {
    showLoading(false);
  }
}

// ── Rendering ──

/**
 * Renders the workspace list into the popup.
 *
 * @param {Array<Object>} workspaces - Array of workspace metadata
 */
function renderWorkspaceList(workspaces) {
  listEl.innerHTML = '';

  if (workspaces.length === 0) {
    listEl.innerHTML = '<li class="workspace-item"><span class="workspace-item__name">No workspaces yet.</span></li>';
    listEl.classList.remove('hidden');
    return;
  }

  for (const ws of workspaces) {
    const li = document.createElement('li');
    li.className = `workspace-item${ws.isActive ? ' workspace-item--active' : ''}`;
    li.style.setProperty('--ws-color', ws.color);

    const dot = document.createElement('span');
    dot.className = 'workspace-item__dot';
    dot.style.backgroundColor = ws.color;

    const info = document.createElement('div');
    info.className = 'workspace-item__info';

    const name = document.createElement('div');
    name.className = 'workspace-item__name';
    name.textContent = ws.name;

    const tabs = document.createElement('div');
    tabs.className = 'workspace-item__tabs';
    tabs.textContent = ws.isActive
      ? `${ws.tabCount} tab${ws.tabCount !== 1 ? 's' : ''} · Active`
      : `${ws.tabCount} tab${ws.tabCount !== 1 ? 's' : ''} · ${formatRelativeTime(ws.lastActiveAt)}`;

    info.appendChild(name);
    info.appendChild(tabs);

    li.appendChild(dot);
    li.appendChild(info);

    if (ws.isActive) {
      const label = document.createElement('span');
      label.className = 'workspace-item__active-label';
      label.textContent = 'Active';
      li.appendChild(label);
    } else {
      const switchBtn = document.createElement('button');
      switchBtn.className = 'workspace-item__switch';
      switchBtn.textContent = 'Switch';
      switchBtn.addEventListener('click', () => handleSwitch(ws.id));
      li.appendChild(switchBtn);
    }

    listEl.appendChild(li);
  }

  listEl.classList.remove('hidden');
}

// ── Actions ──

/**
 * Handles switching to a different workspace.
 *
 * @param {string} workspaceId - Target workspace ID
 */
async function handleSwitch(workspaceId) {
  showSwitchOverlay(true, 'Saving workspace…');

  try {
    const stateInterval = setInterval(async () => {
      try {
        const stateRes = await chrome.runtime.sendMessage({ action: 'GET_SWITCH_STATE' });
        if (stateRes.success) {
          const labels = {
            saving: 'Saving workspace…',
            closing: 'Closing tabs…',
            restoring: 'Restoring workspace…',
            idle: 'Done!',
          };
          switchStatus.textContent = labels[stateRes.data] || 'Switching…';
        }
      } catch {
        // Ignore polling errors
      }
    }, 300);

    const response = await chrome.runtime.sendMessage({
      action: 'SWITCH_WORKSPACE',
      payload: { workspaceId },
    });

    clearInterval(stateInterval);

    if (!response.success) {
      throw new Error(response.error);
    }

    switchStatus.textContent = 'Done!';
    setTimeout(() => window.close(), 400);
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
    const response = await chrome.runtime.sendMessage({
      action: 'CREATE_WORKSPACE',
      payload: { name, color: selectedColor },
    });

    if (!response.success) {
      throw new Error(response.error);
    }

    hideNewWorkspaceForm();
    await loadWorkspaces();
  } catch (error) {
    showError(error.message || 'Failed to create workspace.');
  } finally {
    createBtn.disabled = false;
  }
}

// ── Color picker ──

/**
 * Builds the color picker swatches.
 */
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

  newNameInput.addEventListener('input', () => {
    createBtn.disabled = !newNameInput.value.trim();
  });

  newNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !createBtn.disabled) {
      handleCreate();
    }
  });

  openSidepanelBtn.addEventListener('click', async () => {
    if (typeof chrome.sidePanel?.open === 'function') {
      try {
        await chrome.sidePanel.open({ windowId: (await chrome.windows.getCurrent()).id });
        window.close();
      } catch {
        showError('Could not open side panel.');
      }
    } else {
      showError('Side panel is not supported in this browser.');
    }
  });
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
