import Database from 'better-sqlite3';
import { join } from 'path';
import { getConfigDir } from '../config/index.js';

const MAX_ROWS = 500;
const FORBIDDEN = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|PRAGMA)\b/i;

/**
 * Validate that SQL is a read-only SELECT statement.
 * @param {string} sql
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateSql(sql) {
  const trimmed = (sql || '').trim();
  if (!trimmed) {
    return { valid: false, error: 'Empty SQL statement' };
  }

  const upper = trimmed.toUpperCase();
  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
    return { valid: false, error: 'Only SELECT statements are allowed' };
  }

  if (FORBIDDEN.test(trimmed)) {
    return { valid: false, error: 'Statement contains forbidden keywords (INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, ATTACH, DETACH, PRAGMA)' };
  }

  return { valid: true };
}

/**
 * Execute a SQL query against the cache database in read-only mode.
 * @param {string} sql - SQL to execute
 * @param {string} [dbPath] - Path to cache.db
 * @returns {{ rows: Array<Object>, columns: string[], rowCount: number, truncated: boolean, error?: string }}
 */
export function executeQuery(sql, dbPath) {
  dbPath = dbPath || join(getConfigDir(), 'cache.db');
  const empty = { rows: [], columns: [], rowCount: 0, truncated: false };

  // Validate first
  const validation = validateSql(sql);
  if (!validation.valid) {
    return { ...empty, error: validation.error };
  }

  let db;
  try {
    db = new Database(dbPath, { readonly: true });
    const rows = db.prepare(sql).all();

    if (rows.length === 0) {
      return empty;
    }

    const columns = Object.keys(rows[0]);
    const truncated = rows.length > MAX_ROWS;
    const capped = truncated ? rows.slice(0, MAX_ROWS) : rows;

    return {
      rows: capped,
      columns,
      rowCount: capped.length,
      truncated,
    };
  } catch (err) {
    return { ...empty, error: err.message };
  } finally {
    if (db) db.close();
  }
}
