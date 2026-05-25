// utils/helpers.js — Shared utility functions: ID generation, time formatting, and URL truncation

import { WORKSPACE_ID_PREFIX, WORKSPACE_ID_LENGTH, TIME_UNITS } from './constants.js';

/**
 * Character set used for generating random workspace IDs.
 * Alphanumeric, URL-safe, no ambiguous characters (0/O, 1/l removed).
 * @type {string}
 */
const ID_CHARS = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Generates a unique workspace ID with the standard prefix.
 * Format: `ws_` followed by {@link WORKSPACE_ID_LENGTH} random alphanumeric characters.
 *
 * @returns {string} A new workspace ID (e.g. "ws_a7Xm3kR9pQwZ")
 */
export function generateId() {
  let id = WORKSPACE_ID_PREFIX;
  for (let i = 0; i < WORKSPACE_ID_LENGTH; i++) {
    id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  }
  return id;
}

/**
 * Formats a timestamp into a human-readable relative time string.
 * Examples: "just now", "3 minutes ago", "2 hours ago", "5 days ago".
 *
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Relative time string
 */
export function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 0) {
    return 'just now';
  }

  if (diff < TIME_UNITS.MINUTE) {
    return 'just now';
  }

  if (diff < TIME_UNITS.HOUR) {
    const minutes = Math.floor(diff / TIME_UNITS.MINUTE);
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  }

  if (diff < TIME_UNITS.DAY) {
    const hours = Math.floor(diff / TIME_UNITS.HOUR);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }

  if (diff < TIME_UNITS.WEEK) {
    const days = Math.floor(diff / TIME_UNITS.DAY);
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  }

  if (diff < TIME_UNITS.MONTH) {
    const weeks = Math.floor(diff / TIME_UNITS.WEEK);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  }

  if (diff < TIME_UNITS.YEAR) {
    const months = Math.floor(diff / TIME_UNITS.MONTH);
    return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  }

  const years = Math.floor(diff / TIME_UNITS.YEAR);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}

/**
 * Truncates a URL for display purposes.
 * Removes protocol, trailing slashes, and clips to the specified max length.
 *
 * @param {string} url - The full URL to truncate
 * @param {number} [maxLength=50] - Maximum character length of the result
 * @returns {string} Truncated URL string (with "…" suffix if clipped)
 */
export function truncateUrl(url, maxLength = 50) {
  if (!url || typeof url !== 'string') {
    return '';
  }

  let shortened = url.replace(/^https?:\/\//, '').replace(/\/+$/, '');

  if (shortened.startsWith('www.')) {
    shortened = shortened.slice(4);
  }

  if (shortened.length <= maxLength) {
    return shortened;
  }

  return shortened.slice(0, maxLength - 1) + '\u2026';
}

/**
 * Creates a debounced version of a function that delays invocation
 * until after the specified wait time has elapsed since the last call.
 *
 * @param {Function} fn - The function to debounce
 * @param {number} wait - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(fn, wait) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/**
 * Safely parses a JSON string, returning a fallback value on failure.
 *
 * @param {string} json - The JSON string to parse
 * @param {*} [fallback=null] - Value to return if parsing fails
 * @returns {*} Parsed value or fallback
 */
export function safeJsonParse(json, fallback = null) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}
