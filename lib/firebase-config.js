// lib/firebase-config.js — Firebase configuration and initialization

const FIREBASE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyB5opq-EkDOCI6Ga8fv-IG0IL6RFmqm4C4',
  authDomain: 'taskvavut.firebaseapp.com',
  projectId: 'taskvavut',
  storageBucket: 'taskvavut.appspot.com',
  messagingSenderId: '',
  appId: '',
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
