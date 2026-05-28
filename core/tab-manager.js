// core/tab-manager.js — Open, close, and restore real browser tabs via the chrome.tabs API

const INTERNAL_URL_PREFIXES = [
  'chrome://', 'chrome-extension://', 'edge://', 'brave://',
  'opera://', 'vivaldi://', 'devtools://', 'about:',
];

/**
 * Checks if a URL is a browser-internal page that cannot be scripted.
 *
 * @param {string} url
 * @returns {boolean}
 */
function isInternalUrl(url) {
  return INTERNAL_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/**
 * Queries all tabs in the current window.
 *
 * @returns {Promise<Array<chrome.tabs.Tab>>} Array of Tab objects in the current window
 * @throws {Error} If the query fails
 */
export async function getCurrentWindowTabs() {
  try {
    return await chrome.tabs.query({ currentWindow: true });
  } catch (error) {
    throw new Error(`[TabManager] Failed to query tabs: ${error.message}`);
  }
}

/**
 * Closes all tabs in the current window except one blank tab
 * (Chrome requires at least one tab per window).
 * Returns the ID of the placeholder tab so it can be closed after restore.
 *
 * @returns {Promise<number>} The ID of the placeholder blank tab
 * @throws {Error} If tab operations fail
 */
export async function closeAllTabs() {
  try {
    const placeholder = await chrome.tabs.create({ url: 'about:blank', active: false });
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const tabsToClose = tabs.filter((tab) => tab.id !== placeholder.id);

    if (tabsToClose.length > 0) {
      await chrome.tabs.remove(tabsToClose.map((tab) => tab.id));
    }

    return placeholder.id;
  } catch (error) {
    throw new Error(`[TabManager] Failed to close tabs: ${error.message}`);
  }
}

/**
 * Restores tabs from an array of tab descriptors (from session-store deserialization).
 * Creates tabs in order, preserving index positions.
 * After all tabs are created, applies pinned/muted states.
 * Sets the first non-pinned tab as active.
 *
 * @param {Array<Object>} tabDescriptors - Array of deserialized tab objects
 * @param {number|null} [placeholderTabId=null] - ID of placeholder tab to close after restore
 * @returns {Promise<Array<chrome.tabs.Tab>>} Array of newly created Tab objects
 * @throws {Error} If tab creation fails
 */
export async function restoreTabs(tabDescriptors, placeholderTabId = null) {
  if (!tabDescriptors || tabDescriptors.length === 0) {
    return [];
  }

  const createdTabs = [];

  try {
    for (const descriptor of tabDescriptors) {
      const tab = await chrome.tabs.create({
        url: descriptor.url,
        pinned: descriptor.pinned || false,
        active: false,
        index: descriptor.index,
      });
      createdTabs.push({ created: tab, descriptor });
    }

    await applyTabStates(createdTabs);
    await activateFirstNonPinnedTab(createdTabs);

    if (placeholderTabId !== null) {
      try {
        await chrome.tabs.remove(placeholderTabId);
      } catch {
        // Placeholder may already be closed
      }
    }

    return createdTabs.map((entry) => entry.created);
  } catch (error) {
    throw new Error(`[TabManager] Failed to restore tabs: ${error.message}`);
  }
}

/**
 * Applies muted state to restored tabs.
 * Pinned state is already set during chrome.tabs.create().
 *
 * @param {Array<{created: chrome.tabs.Tab, descriptor: Object}>} tabEntries - Created tab + descriptor pairs
 * @returns {Promise<void>}
 */
async function applyTabStates(tabEntries) {
  for (const { created, descriptor } of tabEntries) {
    if (descriptor.muted) {
      try {
        await chrome.tabs.update(created.id, { muted: true });
      } catch {
        // Non-critical: tab may have been closed
      }
    }
  }
}

/**
 * Activates the first non-pinned tab, or the first tab if all are pinned.
 *
 * @param {Array<{created: chrome.tabs.Tab, descriptor: Object}>} tabEntries - Created tab + descriptor pairs
 * @returns {Promise<void>}
 */
async function activateFirstNonPinnedTab(tabEntries) {
  if (tabEntries.length === 0) return;

  const firstNonPinned = tabEntries.find((entry) => !entry.descriptor.pinned);
  const target = firstNonPinned || tabEntries[0];

  try {
    await chrome.tabs.update(target.created.id, { active: true });
  } catch {
    // Non-critical: tab may have been closed
  }
}

/**
 * Captures scroll positions from all tabs in the current window
 * by injecting a content script that reads window.scrollY.
 *
 * @returns {Promise<Object>} Map of tabId → scrollY position
 */
export async function captureScrollPositions() {
  const tabs = await getCurrentWindowTabs();
  const positions = {};

  for (const tab of tabs) {
    if (!tab.url || isInternalUrl(tab.url)) {
      continue;
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.scrollY,
      });

      if (results && results[0] && typeof results[0].result === 'number') {
        positions[tab.id] = results[0].result;
      }
    } catch {
      // Script injection may fail on restricted pages
    }
  }

  return positions;
}

/**
 * Moves a single tab from the current window into a sleeping workspace's snapshot.
 * The tab is closed after its data is captured.
 *
 * @param {number} tabId - The ID of the tab to move
 * @returns {Promise<Object>} Tab descriptor object suitable for adding to a snapshot
 * @throws {Error} If the tab is not found
 */
export async function captureAndCloseTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    let scrollY = 0;

    if (tab.url && !isInternalUrl(tab.url)) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => window.scrollY,
        });
        if (results && results[0] && typeof results[0].result === 'number') {
          scrollY = results[0].result;
        }
      } catch {
        // Script injection may fail
      }
    }

    const descriptor = {
      url: tab.url || tab.pendingUrl || '',
      title: tab.title || '',
      favIconUrl: tab.favIconUrl || '',
      pinned: tab.pinned || false,
      muted: tab.mutedInfo?.muted || false,
      index: tab.index,
      scrollY,
    };

    await chrome.tabs.remove(tabId);
    return descriptor;
  } catch (error) {
    throw new Error(`[TabManager] Failed to capture tab ${tabId}: ${error.message}`);
  }
}
