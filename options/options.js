// options/options.js — Options page logic for cloud sync settings

// ── DOM references ──

const authAvatar = document.getElementById('auth-avatar');
const authInfo = document.getElementById('auth-info');
const authName = document.getElementById('auth-name');
const authEmail = document.getElementById('auth-email');
const authPlaceholder = document.getElementById('auth-placeholder');
const signInBtn = document.getElementById('sign-in-btn');
const signOutBtn = document.getElementById('sign-out-btn');
const authError = document.getElementById('auth-error');

const cloudSyncToggle = document.getElementById('cloud-sync-toggle');
const syncStatusSection = document.getElementById('sync-status-section');
const syncIndicator = document.getElementById('sync-indicator');
const syncStatusText = document.getElementById('sync-status-text');
const syncLastTime = document.getElementById('sync-last-time');
const syncNowBtn = document.getElementById('sync-now-btn');
const syncError = document.getElementById('sync-error');

/** @type {number|null} Interval for polling sync status */
let statusPollInterval = null;

// ── Initialization ──

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindEvents();
  await loadAuthState();
  await loadSyncSettings();
}

// ── Auth ──

async function loadAuthState() {
  try {
    const user = await sendMessage('GET_AUTH_STATE');
    renderAuthState(user);
  } catch {
    renderAuthState(null);
  }
}

function renderAuthState(user) {
  if (user) {
    authPlaceholder.classList.add('hidden');
    signInBtn.classList.add('hidden');

    authInfo.classList.remove('hidden');
    signOutBtn.classList.remove('hidden');

    authName.textContent = user.displayName || user.email;
    authEmail.textContent = user.email || '';

    if (user.photoUrl) {
      authAvatar.src = user.photoUrl;
      authAvatar.classList.remove('hidden');
    } else {
      authAvatar.classList.add('hidden');
    }

    cloudSyncToggle.disabled = false;
    syncNowBtn.disabled = false;
  } else {
    authPlaceholder.classList.remove('hidden');
    signInBtn.classList.remove('hidden');

    authInfo.classList.add('hidden');
    signOutBtn.classList.add('hidden');
    authAvatar.classList.add('hidden');

    cloudSyncToggle.disabled = true;
    cloudSyncToggle.checked = false;
    syncNowBtn.disabled = true;
    syncStatusSection.classList.add('hidden');
  }

  hideAuthError();
}

async function handleSignIn() {
  signInBtn.disabled = true;
  hideAuthError();

  try {
    await sendMessage('SIGN_IN');
    await loadAuthState();
    await loadSyncSettings();
  } catch (error) {
    showAuthError(error.message || 'Sign-in failed.');
  } finally {
    signInBtn.disabled = false;
  }
}

async function handleSignOut() {
  signOutBtn.disabled = true;

  try {
    await sendMessage('SIGN_OUT');
    renderAuthState(null);
    stopStatusPoll();
  } catch (error) {
    showAuthError(error.message || 'Sign-out failed.');
  } finally {
    signOutBtn.disabled = false;
  }
}

// ── Cloud sync settings ──

async function loadSyncSettings() {
  try {
    const user = await sendMessage('GET_AUTH_STATE');
    if (!user) return;

    const status = await sendMessage('GET_SYNC_STATUS');
    cloudSyncToggle.checked = status.status !== 'idle' || status.lastSyncTime > 0;

    // Load from sync storage
    try {
      const response = await chrome.storage.sync.get('tabvault_settings');
      const settings = response.tabvault_settings;
      if (settings) {
        cloudSyncToggle.checked = settings.cloudSyncEnabled || false;
      }
    } catch {
      // Fall back to status-based check above
    }

    if (cloudSyncToggle.checked) {
      showSyncStatus(status);
      startStatusPoll();
    }
  } catch {
    // Ignore
  }
}

async function handleToggleCloudSync() {
  const enabled = cloudSyncToggle.checked;
  hideSyncError();

  try {
    await sendMessage('TOGGLE_CLOUD_SYNC', { enabled });

    if (enabled) {
      const status = await sendMessage('GET_SYNC_STATUS');
      showSyncStatus(status);
      startStatusPoll();
    } else {
      syncStatusSection.classList.add('hidden');
      stopStatusPoll();
    }
  } catch (error) {
    cloudSyncToggle.checked = !enabled;
    showSyncError(error.message || 'Failed to toggle cloud sync.');
  }
}

async function handleSyncNow() {
  syncNowBtn.disabled = true;
  hideSyncError();

  try {
    await sendMessage('SYNC_NOW');
    const status = await sendMessage('GET_SYNC_STATUS');
    showSyncStatus(status);
  } catch (error) {
    showSyncError(error.message || 'Sync failed.');
  } finally {
    syncNowBtn.disabled = false;
  }
}

// ── Sync status display ──

function showSyncStatus(status) {
  syncStatusSection.classList.remove('hidden');

  // Update indicator
  syncIndicator.className = 'sync-indicator';
  syncIndicator.classList.add(`sync-indicator--${status.status}`);

  // Update text
  const labels = {
    idle: 'Not synced',
    syncing: 'Syncing…',
    success: 'Synced',
    error: 'Sync error',
    offline: 'Offline',
  };
  syncStatusText.textContent = labels[status.status] || 'Unknown';

  // Update last sync time
  if (status.lastSyncTime > 0) {
    syncLastTime.textContent = `Last synced: ${formatTime(status.lastSyncTime)}`;
  } else {
    syncLastTime.textContent = '';
  }

  // Show error if any
  if (status.error) {
    showSyncError(status.error);
  }
}

function startStatusPoll() {
  stopStatusPoll();
  statusPollInterval = setInterval(async () => {
    try {
      const status = await sendMessage('GET_SYNC_STATUS');
      showSyncStatus(status);
    } catch {
      // Ignore polling errors
    }
  }, 5000);
}

function stopStatusPoll() {
  if (statusPollInterval) {
    clearInterval(statusPollInterval);
    statusPollInterval = null;
  }
}

// ── Event binding ──

function bindEvents() {
  signInBtn.addEventListener('click', handleSignIn);
  signOutBtn.addEventListener('click', handleSignOut);
  cloudSyncToggle.addEventListener('change', handleToggleCloudSync);
  syncNowBtn.addEventListener('click', handleSyncNow);
}

// ── Messaging ──

async function sendMessage(action, payload) {
  const response = await chrome.runtime.sendMessage({ action, payload });
  if (!response.success) {
    throw new Error(response.error);
  }
  return response.data;
}

// ── UI helpers ──

function showAuthError(msg) {
  authError.textContent = msg;
  authError.classList.remove('hidden');
}

function hideAuthError() {
  authError.classList.add('hidden');
}

function showSyncError(msg) {
  syncError.textContent = msg;
  syncError.classList.remove('hidden');
}

function hideSyncError() {
  syncError.classList.add('hidden');
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) {
    const mins = Math.floor(diff / 60_000);
    return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  }
  if (diff < 86_400_000) {
    const hours = Math.floor(diff / 3_600_000);
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
