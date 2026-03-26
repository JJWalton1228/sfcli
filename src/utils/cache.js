import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { join } from 'path';
import { getConfigDir } from '../config/index.js';

const DEFAULT_TTL_SECONDS = 43200; // 12 hours

const ENTITIES = ['customers', 'jobs', 'estimates', 'invoices', 'techs', 'equipment'];

/**
 * Create a cache instance backed by SQLite.
 * @param {Object} [options]
 * @param {string} [options.dbPath] - Path to SQLite file (default: ~/.sfcli/cache.db)
 * @param {number} [options.ttlSeconds] - Cache TTL in seconds (default: 43200 = 12h)
 */
export function createCache(options = {}) {
  const dbPath = options.dbPath || join(getConfigDir(), 'cache.db');
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;

  // Ensure directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // Initialize schema
  initSchema(db);

  return {
    /**
     * Store a single record.
     */
    put(entity, id, data) {
      ensureEntity(entity);
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO cache_${entity} (id, data, searchable_text, cached_at)
        VALUES (?, ?, ?, datetime('now'))
      `);
      stmt.run(id, JSON.stringify(data), buildSearchableText(entity, data));
      touchMeta(db, entity);
    },

    /**
     * Store multiple records in a transaction.
     */
    putMany(entity, items) {
      ensureEntity(entity);
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO cache_${entity} (id, data, searchable_text, cached_at)
        VALUES (?, ?, ?, datetime('now'))
      `);
      const tx = db.transaction((records) => {
        for (const record of records) {
          stmt.run(record.id, JSON.stringify(record), buildSearchableText(entity, record), );
        }
      });
      tx(items);
      touchMeta(db, entity);
    },

    /**
     * Retrieve a single record by ID.
     */
    get(entity, id) {
      ensureEntity(entity);
      const row = db.prepare(`SELECT data FROM cache_${entity} WHERE id = ?`).get(id);
      return row ? JSON.parse(row.data) : null;
    },

    /**
     * Search cached records.
     * @param {string} entity
     * @param {Object} filters - { q, city, state, phone, email, status, customer_id }
     */
    search(entity, filters = {}) {
      ensureEntity(entity);
      let sql = `SELECT data FROM cache_${entity} WHERE 1=1`;
      const params = [];

      if (filters.q) {
        sql += ` AND searchable_text LIKE ?`;
        params.push(`%${filters.q.toLowerCase()}%`);
      }

      // Field-specific filters — match against JSON data
      const fieldFilters = ['city', 'state', 'status', 'customer_id', 'email'];
      for (const field of fieldFilters) {
        if (filters[field]) {
          sql += ` AND json_extract(data, '$.${field}') = ?`;
          params.push(filters[field]);
        }
      }

      if (filters.phone) {
        // Partial phone match against searchable text
        sql += ` AND searchable_text LIKE ?`;
        params.push(`%${filters.phone.replace(/\D/g, '')}%`);
      }

      const rows = db.prepare(sql).all(...params);
      return rows.map(r => JSON.parse(r.data));
    },

    /**
     * Get cache status for an entity.
     */
    status(entity) {
      ensureEntity(entity);
      const countRow = db.prepare(`SELECT COUNT(*) as count FROM cache_${entity}`).get();
      const meta = db.prepare(`SELECT refreshed_at FROM cache_meta WHERE entity = ?`).get(entity);

      const count = countRow.count;
      let stale = true;

      if (meta?.refreshed_at && count > 0) {
        const refreshedAt = new Date(meta.refreshed_at + 'Z').getTime();
        const now = Date.now();
        stale = (now - refreshedAt) / 1000 > ttlSeconds;
      }

      return {
        count,
        stale,
        refreshedAt: meta?.refreshed_at ?? null,
      };
    },

    /**
     * Clear cached data.
     * @param {string} [entity] - Clear specific entity, or all if omitted
     */
    clear(entity) {
      if (entity) {
        ensureEntity(entity);
        db.prepare(`DELETE FROM cache_${entity}`).run();
        db.prepare(`DELETE FROM cache_meta WHERE entity = ?`).run(entity);
      } else {
        for (const e of ENTITIES) {
          db.prepare(`DELETE FROM cache_${e}`).run();
        }
        db.prepare(`DELETE FROM cache_meta`).run();
      }
    },

    /**
     * Close the database connection.
     */
    close() {
      db.close();
    },
  };
}

function ensureEntity(entity) {
  if (!ENTITIES.includes(entity)) {
    throw new Error(`Unknown cache entity: ${entity}. Valid: ${ENTITIES.join(', ')}`);
  }
}

function initSchema(db) {
  // Meta table for tracking refresh times
  db.exec(`
    CREATE TABLE IF NOT EXISTS cache_meta (
      entity TEXT PRIMARY KEY,
      refreshed_at TEXT
    )
  `);

  // One table per entity with JSON data and searchable text
  for (const entity of ENTITIES) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cache_${entity} (
        id INTEGER PRIMARY KEY,
        data TEXT NOT NULL,
        searchable_text TEXT,
        cached_at TEXT NOT NULL
      )
    `);
    // Index for text search
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_${entity}_search ON cache_${entity}(searchable_text)
    `);
  }
}

function touchMeta(db, entity) {
  db.prepare(`
    INSERT OR REPLACE INTO cache_meta (entity, refreshed_at) VALUES (?, datetime('now'))
  `).run(entity);
}

/**
 * Build a lowercase searchable text blob from the record's key fields.
 */
function buildSearchableText(entity, data) {
  const parts = [];

  // Common fields
  if (data.customer_name) parts.push(data.customer_name);
  if (data.contact_first_name) parts.push(data.contact_first_name);
  if (data.contact_last_name) parts.push(data.contact_last_name);
  if (data.description) parts.push(data.description);
  if (data.account_number) parts.push(String(data.account_number));

  // Nested contacts (raw data)
  if (Array.isArray(data.contacts)) {
    for (const c of data.contacts) {
      if (c.fname) parts.push(c.fname);
      if (c.lname) parts.push(c.lname);
      if (Array.isArray(c.phones)) {
        for (const p of c.phones) {
          if (p.phone) parts.push(p.phone.replace(/\D/g, ''));
        }
      }
      if (Array.isArray(c.emails)) {
        for (const e of c.emails) {
          if (e.email) parts.push(e.email);
        }
      }
    }
  }

  // Flattened fields
  if (data.phone) parts.push(data.phone.replace(/\D/g, ''));
  if (data.email) parts.push(data.email);
  if (data.city) parts.push(data.city);
  if (data.state) parts.push(data.state);
  if (data.state_prov) parts.push(data.state_prov);

  // Job/estimate fields
  if (data.number) parts.push(String(data.number));
  if (data.status) parts.push(data.status);
  if (data.customer) parts.push(data.customer); // invoice customer string

  // Tech fields
  if (data.first_name) parts.push(data.first_name);
  if (data.last_name) parts.push(data.last_name);

  // Equipment fields
  if (data.type) parts.push(data.type);
  if (data.make) parts.push(data.make);
  if (data.model) parts.push(data.model);
  if (data.serial_number) parts.push(data.serial_number);

  return parts.join(' ').toLowerCase();
}

export default createCache;
