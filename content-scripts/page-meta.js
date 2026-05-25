// content-scripts/page-meta.js — Captures page scroll position when requested by the service worker

/**
 * Listens for scroll position capture requests from the background service worker.
 * Responds with the current vertical scroll position (window.scrollY).
 *
 * This script is injected programmatically via chrome.scripting.executeScript
 * before tabs are closed during a workspace switch. It is NOT a persistent
 * content script — it only runs when explicitly invoked.
 *
 * Message format expected: { action: 'CAPTURE_SCROLL' }
 * Response format: { scrollY: number }
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'CAPTURE_SCROLL') {
    sendResponse({
      scrollY: window.scrollY || 0,
    });
  }
  return false;
});
