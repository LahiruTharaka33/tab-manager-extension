// utils/browser-detect.js — Detects the current Chromium-based browser

/**
 * Detects the current browser from the user agent string.
 *
 * @returns {'chrome'|'edge'|'brave'|'opera'|'vivaldi'|'arc'|'chromium'}
 */
export function detectBrowser() {
  const ua = navigator.userAgent;

  if (ua.includes('Edg/')) return 'edge';
  if (ua.includes('OPR/') || ua.includes('Opera')) return 'opera';
  if (ua.includes('Vivaldi/')) return 'vivaldi';

  if (typeof navigator.brave?.isBrave === 'function') return 'brave';

  if (ua.includes('Chrome/') && !ua.includes('Edg/') && !ua.includes('OPR/')) return 'chrome';

  return 'chromium';
}

/**
 * Checks whether chrome.identity.getAuthToken is available.
 * This API is Chrome-only and not supported in Edge, Brave, Opera, etc.
 *
 * @returns {boolean}
 */
export function hasIdentityApi() {
  return typeof chrome !== 'undefined' &&
    typeof chrome.identity !== 'undefined' &&
    typeof chrome.identity.getAuthToken === 'function';
}

/**
 * Checks whether chrome.sidePanel is available.
 *
 * @returns {boolean}
 */
export function hasSidePanelApi() {
  return typeof chrome !== 'undefined' &&
    typeof chrome.sidePanel !== 'undefined' &&
    typeof chrome.sidePanel.open === 'function';
}
