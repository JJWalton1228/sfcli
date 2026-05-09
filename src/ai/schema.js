import Database from 'better-sqlite3';
import { join } from 'path';
import { getConfigDir } from '../config/index.js';

const MAX_DEPTH = 3;
const SAMPLE_ROWS = 5;

/**
 * Introspect the SQLite cache database schema and extract JSON field paths.
 * @param {string} [dbPath] - Path to cache.db (default: ~/.sfcli/cache.db)
 * @returns {{ tables: Array<{ name: string, columns: string[], jsonFields: string[] }>, schemaText: string }}
 */
export function introspectSchema(dbPath) {
  dbPath = dbPath || join(getConfigDir(), 'cache.db');
  const db = new Database(dbPath, { readonly: true });

  try {
    const ALLOWED_TABLES = [
      'cache_customers', 'cache_jobs', 'cache_estimates',
      'cache_invoices', 'cache_techs', 'cache_equipment', 'cache_meta',
    ];

    const tables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'cache_%' ORDER BY name`
    ).all()
      .filter(row => ALLOWED_TABLES.includes(row.name))
      .map(row => {
        const quotedName = `"${row.name.replace(/"/g, '""')}"`;
        const columns = db.prepare(`PRAGMA table_info(${quotedName})`)
          .all()
          .map(col => col.name);

        const hasDataColumn = columns.includes('data');
        const jsonFields = hasDataColumn ? extractJsonFields(db, row.name, quotedName) : [];

        return { name: row.name, columns, jsonFields };
      });

    const schemaText = formatSchemaText(tables);
    return { tables, schemaText };
  } finally {
    db.close();
  }
}

function extractJsonFields(db, tableName, quotedName) {
  const rows = db.prepare(`SELECT data FROM ${quotedName} LIMIT ?`).all(SAMPLE_ROWS);
  if (rows.length === 0) return [];

  const allKeys = new Set();
  for (const row of rows) {
    try {
      const obj = JSON.parse(row.data);
      collectKeys(obj, '', 0, allKeys);
    } catch {
      // skip malformed JSON
    }
  }
  return [...allKeys].sort();
}

function collectKeys(obj, prefix, depth, keys) {
  if (depth >= MAX_DEPTH || obj == null || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null) {
      collectKeys(obj[0], prefix, depth, keys);
    }
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(value)) {
      if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
        collectKeys(value[0], `${path}[]`, depth + 1, keys);
      } else {
        keys.add(`${path}[]`);
      }
    } else if (typeof value === 'object' && value !== null) {
      if (depth + 1 >= MAX_DEPTH) {
        keys.add(path);
      } else {
        collectKeys(value, path, depth + 1, keys);
      }
    } else {
      keys.add(path);
    }
  }
}

function formatSchemaText(tables) {
  return tables.map(t => {
    let text = `Table: ${t.name}\n  Columns: ${t.columns.join(', ')}`;
    if (t.jsonFields.length > 0) {
      text += `\n  JSON fields in data column:\n    ${t.jsonFields.join(', ')}`;
    }
    return text;
  }).join('\n\n');
}
