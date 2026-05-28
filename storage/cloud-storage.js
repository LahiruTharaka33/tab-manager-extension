// storage/cloud-storage.js — Cloud backend integration using Firestore REST API

import { getFirestoreBaseUrl, getCollectionName } from '../lib/firebase-config.js';
import { getValidToken } from '../core/auth-service.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Uploads a workspace snapshot to Firestore.
 *
 * @param {string} userId - The authenticated user's ID
 * @param {string} workspaceId - The workspace ID
 * @param {Object} snapshot - The tab snapshot object
 * @returns {Promise<void>}
 * @throws {Error} If the upload fails after retries
 */
export async function uploadSnapshot(userId, workspaceId, snapshot) {
  const docPath = buildDocPath(userId, workspaceId);
  const firestoreDoc = toFirestoreDocument(snapshot);

  await firestoreRequest('PATCH', docPath, firestoreDoc);
}

/**
 * Downloads a workspace snapshot from Firestore.
 *
 * @param {string} userId - The authenticated user's ID
 * @param {string} workspaceId - The workspace ID
 * @returns {Promise<Object|null>} The snapshot object, or null if not found
 * @throws {Error} If the download fails after retries
 */
export async function downloadSnapshot(userId, workspaceId) {
  const docPath = buildDocPath(userId, workspaceId);

  try {
    const doc = await firestoreRequest('GET', docPath);
    return fromFirestoreDocument(doc);
  } catch (error) {
    if (error.message.includes('404') || error.message.includes('NOT_FOUND')) {
      return null;
    }
    throw error;
  }
}

/**
 * Lists all cloud snapshots for a user.
 *
 * @param {string} userId - The authenticated user's ID
 * @returns {Promise<Array<Object>>} Array of snapshot objects
 * @throws {Error} If the request fails
 */
export async function listCloudSnapshots(userId) {
  const collection = getCollectionName();
  const path = `${collection}/${userId}/workspaces`;

  try {
    const result = await firestoreRequest('GET', path);
    if (!result.documents) return [];

    return result.documents.map((doc) => fromFirestoreDocument(doc));
  } catch (error) {
    if (error.message.includes('404') || error.message.includes('NOT_FOUND')) {
      return [];
    }
    throw error;
  }
}

/**
 * Deletes a snapshot from Firestore.
 *
 * @param {string} userId - The authenticated user's ID
 * @param {string} workspaceId - The workspace ID
 * @returns {Promise<void>}
 * @throws {Error} If the deletion fails
 */
export async function deleteCloudSnapshot(userId, workspaceId) {
  const docPath = buildDocPath(userId, workspaceId);

  try {
    await firestoreRequest('DELETE', docPath);
  } catch (error) {
    if (!error.message.includes('404') && !error.message.includes('NOT_FOUND')) {
      throw error;
    }
  }
}

/**
 * Returns the last sync time stored in the cloud for a user.
 *
 * @param {string} userId - The authenticated user's ID
 * @returns {Promise<number>} Timestamp in milliseconds, or 0 if never synced
 */
export async function getCloudLastSyncTime(userId) {
  const collection = getCollectionName();
  const path = `${collection}/${userId}`;

  try {
    const doc = await firestoreRequest('GET', path);
    const fields = doc.fields || {};
    return Number(fields.lastSyncTime?.integerValue || 0);
  } catch {
    return 0;
  }
}

/**
 * Updates the last sync time in the cloud.
 *
 * @param {string} userId - The authenticated user's ID
 * @param {number} timestamp - Sync timestamp in milliseconds
 * @returns {Promise<void>}
 */
export async function setCloudLastSyncTime(userId, timestamp) {
  const collection = getCollectionName();
  const path = `${collection}/${userId}`;

  const doc = {
    fields: {
      lastSyncTime: { integerValue: String(timestamp) },
    },
  };

  await firestoreRequest('PATCH', path, doc);
}

// ── Firestore helpers ──

/**
 * Builds the Firestore document path for a workspace snapshot.
 *
 * @param {string} userId
 * @param {string} workspaceId
 * @returns {string}
 */
function buildDocPath(userId, workspaceId) {
  const collection = getCollectionName();
  return `${collection}/${userId}/workspaces/${workspaceId}`;
}

/**
 * Makes an authenticated request to the Firestore REST API with retry logic.
 *
 * @param {string} method - HTTP method (GET, PATCH, DELETE)
 * @param {string} docPath - Document path relative to database root
 * @param {Object} [body] - Request body for PATCH requests
 * @returns {Promise<Object>} Parsed JSON response
 * @throws {Error} If all retries fail
 */
async function firestoreRequest(method, docPath, body = null) {
  const baseUrl = getFirestoreBaseUrl();
  const url = `${baseUrl}/${docPath}`;

  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const token = await getValidToken();
    if (!token) {
      throw new Error('[CloudStorage] Not authenticated');
    }

    try {
      const options = {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      };

      if (body && method === 'PATCH') {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);

      if (response.status === 204 || (method === 'DELETE' && response.ok)) {
        return {};
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Firestore ${method} ${response.status}: ${errorBody}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES - 1) {
        await delay(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw new Error(`[CloudStorage] ${method} failed after ${MAX_RETRIES} retries: ${lastError.message}`);
}

/**
 * Converts a local snapshot object to Firestore document format.
 *
 * @param {Object} snapshot
 * @returns {Object} Firestore document with typed fields
 */
function toFirestoreDocument(snapshot) {
  return {
    fields: {
      workspaceId: { stringValue: snapshot.workspaceId || '' },
      savedAt: { integerValue: String(snapshot.savedAt || Date.now()) },
      deviceId: { stringValue: snapshot.deviceId || '' },
      tabs: { stringValue: JSON.stringify(snapshot.tabs || []) },
    },
  };
}

/**
 * Converts a Firestore document to a local snapshot object.
 *
 * @param {Object} doc - Firestore document
 * @returns {Object} Local snapshot object
 */
function fromFirestoreDocument(doc) {
  const fields = doc.fields || {};
  let tabs = [];
  try {
    tabs = JSON.parse(fields.tabs?.stringValue || '[]');
  } catch {
    tabs = [];
  }

  return {
    workspaceId: fields.workspaceId?.stringValue || '',
    savedAt: Number(fields.savedAt?.integerValue || 0),
    deviceId: fields.deviceId?.stringValue || '',
    tabs,
  };
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
