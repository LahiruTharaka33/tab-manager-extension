// core/auth-service.js — Authentication service supporting Chrome Identity API and web-based OAuth fallback

import { CLOUD_STORAGE_KEYS } from '../utils/constants.js';
import { localGet, localSet, localRemove } from '../storage/local-storage.js';
import { hasIdentityApi } from '../utils/browser-detect.js';
import { getFirebaseConfig } from '../lib/firebase-config.js';

/** @type {Array<Function>} Auth state change listeners */
const authListeners = [];

/**
 * Signs in the user via Chrome Identity API (on Chrome) or web-based OAuth (other browsers).
 *
 * @returns {Promise<Object>} User object with uid, email, displayName, photoUrl, token
 * @throws {Error} If authentication fails
 */
export async function signIn() {
  try {
    const token = hasIdentityApi()
      ? await getAuthTokenViaIdentity(true)
      : await getAuthTokenViaWeb();

    const userInfo = await fetchUserInfo(token);

    const user = {
      uid: userInfo.id,
      email: userInfo.email,
      displayName: userInfo.name || userInfo.email,
      photoUrl: userInfo.picture || '',
      token,
    };

    await localSet(CLOUD_STORAGE_KEYS.AUTH_STATE, user);
    notifyListeners(user);
    return user;
  } catch (error) {
    throw new Error(`[AuthService] Sign-in failed: ${error.message}`);
  }
}

/**
 * Signs out the user by revoking the OAuth token and clearing auth state.
 *
 * @returns {Promise<void>}
 */
export async function signOut() {
  try {
    const authState = await localGet(CLOUD_STORAGE_KEYS.AUTH_STATE);
    if (authState?.token) {
      await revokeToken(authState.token);
      if (hasIdentityApi()) {
        await removeCachedToken(authState.token);
      }
    }
  } catch {
    // Best-effort revocation
  }

  await localRemove(CLOUD_STORAGE_KEYS.AUTH_STATE);
  notifyListeners(null);
}

/**
 * Returns the currently authenticated user, or null if not signed in.
 * Validates the cached token before returning.
 *
 * @returns {Promise<Object|null>} User object or null
 */
export async function getCurrentUser() {
  const authState = await localGet(CLOUD_STORAGE_KEYS.AUTH_STATE);
  if (!authState?.token) return null;

  if (hasIdentityApi()) {
    try {
      const token = await getAuthTokenViaIdentity(false);
      if (token) {
        authState.token = token;
        await localSet(CLOUD_STORAGE_KEYS.AUTH_STATE, authState);
        return authState;
      }
    } catch {
      // Token expired or invalid
    }
    return null;
  }

  // For web-based OAuth, validate the stored token
  try {
    const valid = await validateToken(authState.token);
    if (valid) return authState;
  } catch {
    // Token invalid
  }

  return null;
}

/**
 * Returns a valid OAuth token, refreshing silently if needed.
 * Returns null if not authenticated.
 *
 * @returns {Promise<string|null>}
 */
export async function getValidToken() {
  if (hasIdentityApi()) {
    try {
      const token = await getAuthTokenViaIdentity(false);
      return token || null;
    } catch {
      return null;
    }
  }

  const authState = await localGet(CLOUD_STORAGE_KEYS.AUTH_STATE);
  return authState?.token || null;
}

/**
 * Registers a listener that fires whenever auth state changes.
 *
 * @param {Function} callback - Called with user object or null
 * @returns {Function} Unsubscribe function
 */
export function onAuthStateChanged(callback) {
  authListeners.push(callback);
  return () => {
    const index = authListeners.indexOf(callback);
    if (index > -1) authListeners.splice(index, 1);
  };
}

// ── Chrome Identity API (Chrome-only) ──

/**
 * Wraps chrome.identity.getAuthToken in a promise.
 *
 * @param {boolean} interactive - Whether to show sign-in UI
 * @returns {Promise<string>} OAuth access token
 */
function getAuthTokenViaIdentity(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!token) {
        reject(new Error('No token returned'));
      } else {
        resolve(token);
      }
    });
  });
}

/**
 * Removes a cached token so Chrome will fetch a fresh one next time.
 *
 * @param {string} token - The token to remove from cache
 * @returns {Promise<void>}
 */
function removeCachedToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}

// ── Web-based OAuth (Edge, Brave, Opera, Vivaldi) ──

/**
 * Launches a web-based OAuth flow using chrome.identity.launchWebAuthFlow.
 * This works on all Chromium-based browsers that support extensions.
 *
 * @returns {Promise<string>} OAuth access token
 */
async function getAuthTokenViaWeb() {
  const config = getFirebaseConfig();
  const redirectUrl = chrome.identity.getRedirectURL();
  const clientId = chrome.runtime.getManifest().oauth2?.client_id;

  if (!clientId) {
    throw new Error('No OAuth2 client_id found in manifest.json');
  }

  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/datastore',
  ].join(' ');

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('redirect_uri', redirectUrl);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('prompt', 'consent');

  const responseUrl = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      (callbackUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!callbackUrl) {
          reject(new Error('No callback URL returned'));
        } else {
          resolve(callbackUrl);
        }
      },
    );
  });

  const hashParams = new URLSearchParams(new URL(responseUrl).hash.substring(1));
  const accessToken = hashParams.get('access_token');

  if (!accessToken) {
    throw new Error('No access token found in OAuth response');
  }

  return accessToken;
}

// ── Shared helpers ──

/**
 * Validates a token by calling the tokeninfo endpoint.
 *
 * @param {string} token - The token to validate
 * @returns {Promise<boolean>}
 */
async function validateToken(token) {
  const response = await fetch(
    `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`,
  );
  return response.ok;
}

/**
 * Revokes an OAuth token via Google's revocation endpoint.
 *
 * @param {string} token - The token to revoke
 * @returns {Promise<void>}
 */
async function revokeToken(token) {
  await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
}

/**
 * Fetches the user's Google profile info using the People API.
 *
 * @param {string} token - Valid OAuth access token
 * @returns {Promise<Object>} User info with id, email, name, picture
 * @throws {Error} If the API request fails
 */
async function fetchUserInfo(token) {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${response.status}`);
  }

  return response.json();
}

/**
 * Notifies all registered auth state listeners.
 *
 * @param {Object|null} user - The current user or null
 */
function notifyListeners(user) {
  for (const listener of authListeners) {
    try {
      listener(user);
    } catch {
      // Prevent listener errors from breaking the chain
    }
  }
}
