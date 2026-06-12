/**
 * Database singleton for EVOQ Assistant.
 * Uses better-sqlite3 (synchronous SQLite bindings).
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { initializeSchema } from './schema.js';

// ── Resolve DB path ───────────────────────────────────────────────────────────

const dbPath = resolve(process.env.DB_PATH || './data/evoq-assistant.db');
const dbDir  = dirname(dbPath);

// Ensure the data directory exists before opening the database
mkdirSync(dbDir, { recursive: true });

// ── Open database ─────────────────────────────────────────────────────────────

const db = new Database(dbPath, {
  // verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
});

// WAL mode: readers don't block writers, much better for concurrent web use
db.pragma('journal_mode = WAL');

// Reasonable busy timeout so concurrent requests queue rather than immediately error
db.pragma('busy_timeout = 5000');

// Enforce referential integrity
db.pragma('foreign_keys = ON');

// Slightly relaxed sync — safe on most OS/hardware, much faster
db.pragma('synchronous = NORMAL');

// ── Apply schema ──────────────────────────────────────────────────────────────

initializeSchema(db);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Generate a collision-resistant unique identifier (UUID v4).
 * @returns {string}
 */
export function generateId() {
  return randomUUID();
}

/**
 * Serialize a value to JSON for storage, or return null if value is null/undefined.
 * @param {*} value
 * @returns {string|null}
 */
export function toJson(value) {
  if (value == null) return null;
  return JSON.stringify(value);
}

/**
 * Deserialize a JSON string from the database, or return null on failure.
 * @param {string|null} raw
 * @returns {*}
 */
export function fromJson(raw) {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * SQLite stores booleans as 0/1 integers; convert to JS boolean.
 * @param {number|null} val
 * @returns {boolean}
 */
export function fromBool(val) {
  return val === 1 || val === true;
}

/**
 * Wrap a function in a SQLite transaction. The returned function will run
 * entirely within a single transaction and automatically commit or roll back.
 *
 * @template T
 * @param {(...args: any[]) => T} fn
 * @returns {(...args: any[]) => T}
 */
export function withTransaction(fn) {
  return db.transaction(fn);
}

// ── Default export ────────────────────────────────────────────────────────────

export default db;
