// core/auth-service.js — Authentication service using Chrome Identity API and Google OAuth

import { CLOUD_STORAGE_KEYS } from '../utils/constants.js';
import { localGet, localSet, localRemove } from '../storage/local-storage.js';

/** @type {Array<Function>} Auth state change listeners */
const authListeners = [];

/**
 * Signs in the user via Chrome Identity API (Google OAuth).
 * Retrieves an OAuth token and fetches the user's profile info.
 *
 * @returns {Promise<Object>} User object with uid, email, displayName, photoUrl, token
 * @throws {Error} If authentication fails
 */
export async function signIn() {
  try {
    const token = await getAuthToken(true);
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
      await removeCachedToken(authState.token);
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

  try {
    const token = await getAuthToken(false);
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

/**
 * Returns a valid OAuth token, refreshing silently if needed.
 * Returns null if not authenticated.
 *
 * @returns {Promise<string|null>}
 */
export async function getValidToken() {
  try {
    const token = await getAuthToken(false);
    return token || null;
  } catch {
    return null;
  }
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

/**
 * Wraps chrome.identity.getAuthToken in a promise.
 *
 * @param {boolean} interactive - Whether to show sign-in UI
 * @returns {Promise<string>} OAuth access token
 */
function getAuthToken(interactive) {
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
