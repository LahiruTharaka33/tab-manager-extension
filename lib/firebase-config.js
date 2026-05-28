// lib/firebase-config.js — Firebase configuration and initialization

const FIREBASE_CONFIG = Object.freeze({
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
});

const FIRESTORE_COLLECTION = 'tab_snapshots';

const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

/**
 * Returns the Firestore REST API base URL.
 *
 * @returns {string}
 */
export function getFirestoreBaseUrl() {
  return FIRESTORE_BASE_URL;
}

/**
 * Returns the Firestore collection name for tab snapshots.
 *
 * @returns {string}
 */
export function getCollectionName() {
  return FIRESTORE_COLLECTION;
}

/**
 * Returns the Firebase project configuration.
 *
 * @returns {Readonly<Object>}
 */
export function getFirebaseConfig() {
  return FIREBASE_CONFIG;
}
