// utils/logger.js — Lightweight logging utility with tagged output for debugging

const PREFIX = '[TabVault]';

/**
 * Logs an informational message to the console.
 *
 * @param {string} tag - Module or context tag (e.g. "ServiceWorker", "TabManager")
 * @param {...*} args - Values to log
 */
export function info(tag, ...args) {
  console.log(`${PREFIX}[${tag}]`, ...args);
}

/**
 * Logs a warning message to the console.
 *
 * @param {string} tag - Module or context tag
 * @param {...*} args - Values to log
 */
export function warn(tag, ...args) {
  console.warn(`${PREFIX}[${tag}]`, ...args);
}

/**
 * Logs an error message to the console.
 *
 * @param {string} tag - Module or context tag
 * @param {...*} args - Values to log
 */
export function error(tag, ...args) {
  console.error(`${PREFIX}[${tag}]`, ...args);
}
