import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { join } from 'path';
import { getConfigDir } from '../config/index.js';
import { initNormalizedSchema } from '../cache/schema.js';
import {
  normalizeCustomer, normalizeJob, normalizeEstimate,
  normalizeInvoice, normalizeTech, normalizeEquipment,
} from '../cache/normalizer.js';
import { getSyncLink, initSyncLinkSchema, upsertSyncLink } from '../filemaker/sync-links.js';

const DEFAULT_TTL_SECONDS = 43200; // 12 hours

const ENTITIES = ['customers', 'jobs', 'estimates', 'invoices', 'techs', 'equipment'];

/**
 * Create a cache instance backed by SQLite with normalized tables.
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

  // Initialize normalized schema (handles migration from legacy)
  initNormalizedSchema(db);
  initSyncLinkSchema(db);

  return {
    /**
     * Store a single record.
     */
    put(entity, id, data) {
      ensureEntity(entity);
      this.putMany(entity, [{ ...data, id }]);
    },

    /**
     * Store multiple records in a transaction using normalized tables.
     */
    putMany(entity, items) {
      ensureEntity(entity);
      const tx = db.transaction((records) => {
        for (const record of records) {
          insertNormalized(db, entity, record);
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
      const table = `cache_${entity}`;
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
      if (!row) return null;
      return rowToRecord(entity, row);
    },

    /**
     * Search cached records with normalized column queries.
     * @param {string} entity
     * @param {Object} filters - { q, city, state, phone, email, status, customer_id }
     */
    search(entity, filters = {}) {
      ensureEntity(entity);
      return searchNormalized(db, entity, filters);
    },

    /**
     * Search a specific normalized table directly (for locations, contacts commands).
     * @param {string} table - Table name without cache_ prefix (e.g. 'locations')
     * @param {Object} filters
     * @param {Object} [options] - { joins: [...], select: '...', groupBy: '...' }
     */
    searchTable(table, filters = {}, options = {}) {
      return searchTableDirect(db, table, filters, options);
    },

    /**
     * Get cache status for an entity.
     */
    status(entity) {
      ensureEntity(entity);
      const table = `cache_${entity}`;
      const countRow = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
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
        clearEntity(db, entity);
        db.prepare(`DELETE FROM cache_meta WHERE entity = ?`).run(entity);
      } else {
        for (const e of ENTITIES) {
          clearEntity(db, e);
        }
        db.prepare(`DELETE FROM cache_meta WHERE entity != '__schema_version'`).run();
      }
    },

    /**
     * Execute a raw read-only SQL query against the database.
     * @param {string} sql
     * @param {Array} [params]
     * @returns {Array<Object>}
     */
    rawQuery(sql, params = []) {
      return db.prepare(sql).all(...params);
    },

    getSyncLink(entityType, sourceKey) {
      return getSyncLink(db, entityType, sourceKey);
    },

    upsertSyncLink(link) {
      return upsertSyncLink(db, link);
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

/**
 * Insert a single record into normalized tables based on entity type.
 */
function insertNormalized(db, entity, record) {
  if (entity === 'customers') {
    const { customer, locations, contacts, phones, emails } = normalizeCustomer(record);
    upsertRow(db, 'cache_customers', customer);
    // Clear old child rows for this customer
    for (const child of ['cache_locations', 'cache_contacts', 'cache_phones', 'cache_emails']) {
      db.prepare(`DELETE FROM ${child} WHERE customer_id = ?`).run(customer.id);
    }
    for (const loc of locations) upsertRow(db, 'cache_locations', loc);
    for (const con of contacts) upsertRow(db, 'cache_contacts', con);
    for (const ph of phones) insertRow(db, 'cache_phones', ph);
    for (const em of emails) insertRow(db, 'cache_emails', em);
    return;
  }

  if (entity === 'jobs') {
    const { job, job_techs } = normalizeJob(record);
    upsertRow(db, 'cache_jobs', job);
    db.prepare(`DELETE FROM cache_job_techs WHERE job_id = ?`).run(job.id);
    for (const jt of job_techs) {
      db.prepare(`INSERT OR REPLACE INTO cache_job_techs (job_id, tech_id) VALUES (?, ?)`).run(jt.job_id, jt.tech_id);
    }
    return;
  }

  if (entity === 'estimates') {
    const { estimate } = normalizeEstimate(record);
    upsertRow(db, 'cache_estimates', estimate);
    return;
  }

  if (entity === 'invoices') {
    const { invoice } = normalizeInvoice(record);
    upsertRow(db, 'cache_invoices', invoice);
    return;
  }

  if (entity === 'techs') {
    const { tech } = normalizeTech(record);
    upsertRow(db, 'cache_techs', tech);
    return;
  }

  if (entity === 'equipment') {
    const { equipment } = normalizeEquipment(record);
    upsertRow(db, 'cache_equipment', equipment);
    return;
  }
}

/**
 * INSERT OR REPLACE a row into a table, using the row's own keys as columns.
 */
function upsertRow(db, table, row) {
  const keys = Object.keys(row);
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
  db.prepare(sql).run(...keys.map(k => row[k]));
}

/**
 * INSERT a row (for auto-increment tables like phones/emails).
 */
function insertRow(db, table, row) {
  const keys = Object.keys(row).filter(k => k !== 'id' || row[k] != null);
  const filteredRow = {};
  for (const k of keys) filteredRow[k] = row[k];
  const cols = Object.keys(filteredRow);
  const placeholders = cols.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
  db.prepare(sql).run(...cols.map(k => filteredRow[k]));
}

/**
 * Search normalized tables, returning reconstructed records.
 */
function searchNormalized(db, entity, filters) {
  const table = `cache_${entity}`;

  if (entity === 'customers') {
    return searchCustomers(db, filters);
  }

  if (entity === 'jobs') {
    return searchJobs(db, filters);
  }

  if (entity === 'invoices') {
    return searchInvoices(db, filters);
  }

  if (entity === 'equipment') {
    return searchEquipment(db, filters);
  }

  if (entity === 'techs') {
    return searchTechs(db, filters);
  }

  if (entity === 'estimates') {
    return searchEstimates(db, filters);
  }

  // Generic fallback
  let sql = `SELECT * FROM ${table} WHERE 1=1`;
  const params = [];

  const simpleFilters = { status: 'status', customer_id: 'customer_id' };
  for (const [filterKey, column] of Object.entries(simpleFilters)) {
    if (filters[filterKey] !== undefined) {
      sql += ` AND ${column} = ?`;
      params.push(filters[filterKey]);
    }
  }

  if (filters.q) {
    sql += ` AND LOWER(COALESCE(data,'')) LIKE ?`;
    params.push(`%${filters.q.toLowerCase()}%`);
  }

  const rows = db.prepare(sql).all(...params);
  return rows.map(row => rowToRecord(entity, row));
}

/**
 * Customer search with JOINs for location/contact/phone/email filtering.
 */
function searchCustomers(db, filters) {
  let joins = '';
  let where = '1=1';
  const params = [];
  let needsDistinct = false;

  // Location filters — JOIN cache_locations
  if (filters.city || filters.state || filters.zip || filters.street) {
    joins += ' JOIN cache_locations cl ON cl.customer_id = c.id';
    needsDistinct = true;
    if (filters.city) {
      where += ' AND LOWER(cl.city) = LOWER(?)';
      params.push(filters.city);
    }
    if (filters.state) {
      where += ' AND LOWER(cl.state) = LOWER(?)';
      params.push(filters.state);
    }
    if (filters.zip) {
      where += ' AND cl.zip = ?';
      params.push(filters.zip);
    }
    if (filters.street) {
      where += ' AND (LOWER(cl.street_1) LIKE LOWER(?) OR LOWER(cl.street_2) LIKE LOWER(?))';
      const term = `%${filters.street}%`;
      params.push(term, term);
    }
  }

  // Contact name filter — JOIN cache_contacts
  if (filters.contactName) {
    joins += ' JOIN cache_contacts cc ON cc.customer_id = c.id';
    needsDistinct = true;
    where += ' AND (LOWER(cc.first_name) LIKE LOWER(?) OR LOWER(cc.last_name) LIKE LOWER(?))';
    const term = `%${filters.contactName}%`;
    params.push(term, term);
  }

  // Phone filter — JOIN through cache_phones
  if (filters.phone) {
    joins += ' JOIN cache_phones cp ON cp.customer_id = c.id';
    needsDistinct = true;
    const normalized = filters.phone.replace(/\D/g, '');
    where += ` AND REPLACE(REPLACE(REPLACE(cp.phone, '-', ''), '(', ''), ')', '') LIKE ?`;
    params.push(`%${normalized}%`);
  }

  // Email filter — JOIN through cache_emails
  if (filters.email) {
    joins += ' JOIN cache_emails ce ON ce.customer_id = c.id';
    needsDistinct = true;
    where += ' AND LOWER(ce.email) = LOWER(?)';
    params.push(filters.email);
  }

  // has-jobs-since: customers with at least one job after date
  if (filters.hasJobsSince) {
    where += ' AND EXISTS (SELECT 1 FROM cache_jobs j WHERE j.customer_id = c.id AND j.start_date >= ?)';
    params.push(filters.hasJobsSince);
  }

  // no-jobs-since: customers with NO jobs after date
  if (filters.noJobsSince) {
    where += ' AND NOT EXISTS (SELECT 1 FROM cache_jobs j WHERE j.customer_id = c.id AND j.start_date >= ?)';
    params.push(filters.noJobsSince);
  }

  // Free-text search on customer name
  if (filters.q) {
    const term = `%${filters.q.toLowerCase()}%`;
    where += ' AND (LOWER(c.customer_name) LIKE ? OR LOWER(c.account_number) LIKE ?)';
    params.push(term, term);
  }

  const distinct = needsDistinct ? 'DISTINCT' : '';
  const sql = `SELECT ${distinct} c.* FROM cache_customers c${joins} WHERE ${where}`;
  const rows = db.prepare(sql).all(...params);
  return rows.map(row => rowToRecord('customers', row));
}

/**
 * Jobs search with tech, customer, city, date range, and total filters.
 */
function searchJobs(db, filters) {
  let sql = `SELECT DISTINCT j.* FROM cache_jobs j`;
  let joins = '';
  const params = [];
  let where = ' WHERE 1=1';

  if (filters.status) {
    where += ' AND j.status = ?';
    params.push(filters.status);
  }
  if (filters.customer_id !== undefined) {
    where += ' AND j.customer_id = ?';
    params.push(filters.customer_id);
  }
  if (filters.customerName) {
    where += ' AND LOWER(j.customer_name) LIKE LOWER(?)';
    params.push(`%${filters.customerName}%`);
  }
  if (filters.tech) {
    joins += ' JOIN cache_job_techs jt ON jt.job_id = j.id JOIN cache_techs t ON t.id = jt.tech_id';
    where += ' AND (LOWER(t.first_name) LIKE LOWER(?) OR LOWER(t.last_name) LIKE LOWER(?))';
    params.push(`%${filters.tech}%`, `%${filters.tech}%`);
  }
  if (filters.city) {
    where += ' AND LOWER(j.city) = LOWER(?)';
    params.push(filters.city);
  }
  if (filters.state) {
    where += ' AND LOWER(j.state) = LOWER(?)';
    params.push(filters.state);
  }
  if (filters.zip) {
    where += ' AND j.zip = ?';
    params.push(filters.zip);
  }
  if (filters.dateFrom) {
    where += ' AND j.start_date >= ?';
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    where += ' AND j.start_date <= ?';
    params.push(filters.dateTo);
  }
  if (filters.minTotal !== undefined) {
    where += ' AND j.total >= ?';
    params.push(filters.minTotal);
  }
  if (filters.maxTotal !== undefined) {
    where += ' AND j.total <= ?';
    params.push(filters.maxTotal);
  }
  if (filters.q) {
    const term = `%${filters.q.toLowerCase()}%`;
    where += ' AND (LOWER(j.description) LIKE ? OR LOWER(j.customer_name) LIKE ? OR j.number LIKE ?)';
    params.push(term, term, term);
  }

  const rows = db.prepare(sql + joins + where).all(...params);
  return rows.map(row => rowToRecord('jobs', row));
}

/**
 * Invoice search with paid/unpaid, customer, date range, and total filters.
 */
function searchInvoices(db, filters) {
  let sql = `SELECT * FROM cache_invoices WHERE 1=1`;
  const params = [];

  if (filters.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters.customer_id !== undefined) {
    sql += ' AND customer_id = ?';
    params.push(filters.customer_id);
  }
  if (filters.customerName) {
    sql += ' AND LOWER(customer) LIKE LOWER(?)';
    params.push(`%${filters.customerName}%`);
  }
  if (filters.paid !== undefined) {
    sql += ' AND is_paid = ?';
    params.push(filters.paid ? 1 : 0);
  }
  if (filters.dateFrom) {
    sql += ' AND date >= ?';
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    sql += ' AND date <= ?';
    params.push(filters.dateTo);
  }
  if (filters.minTotal !== undefined) {
    sql += ' AND total >= ?';
    params.push(filters.minTotal);
  }
  if (filters.maxTotal !== undefined) {
    sql += ' AND total <= ?';
    params.push(filters.maxTotal);
  }

  const rows = db.prepare(sql).all(...params);
  return rows.map(row => rowToRecord('invoices', row));
}

/**
 * Equipment search with type, make, model, serial, and location filters.
 */
function searchEquipment(db, filters) {
  let sql = `SELECT e.* FROM cache_equipment e`;
  let joins = '';
  let where = ' WHERE 1=1';
  const params = [];

  if (filters.customer_id !== undefined) {
    where += ' AND e.customer_id = ?';
    params.push(filters.customer_id);
  }
  if (filters.customerName) {
    joins += ' JOIN cache_customers c ON c.id = e.customer_id';
    where += ' AND LOWER(c.customer_name) LIKE LOWER(?)';
    params.push(`%${filters.customerName}%`);
  }
  if (filters.type) {
    where += ' AND LOWER(e.type) LIKE LOWER(?)';
    params.push(`%${filters.type}%`);
  }
  if (filters.make) {
    where += ' AND LOWER(e.make) LIKE LOWER(?)';
    params.push(`%${filters.make}%`);
  }
  if (filters.model) {
    where += ' AND LOWER(e.model) LIKE LOWER(?)';
    params.push(`%${filters.model}%`);
  }
  if (filters.serial) {
    where += ' AND LOWER(e.serial_number) LIKE LOWER(?)';
    params.push(`%${filters.serial}%`);
  }
  if (filters.city || filters.state) {
    if (!joins.includes('cache_customers')) {
      joins += ' JOIN cache_customers c ON c.id = e.customer_id';
    }
    joins += ' JOIN cache_locations l ON l.customer_id = c.id';
    if (filters.city) {
      where += ' AND LOWER(l.city) = LOWER(?)';
      params.push(filters.city);
    }
    if (filters.state) {
      where += ' AND LOWER(l.state) = LOWER(?)';
      params.push(filters.state);
    }
  }
  if (filters.q) {
    where += ' AND LOWER(COALESCE(e.data,"")) LIKE ?';
    params.push(`%${filters.q.toLowerCase()}%`);
  }

  const rows = db.prepare(sql + joins + where).all(...params);
  return rows.map(row => rowToRecord('equipment', row));
}

/**
 * Tech search with name and department filters.
 */
function searchTechs(db, filters) {
  let sql = `SELECT * FROM cache_techs WHERE 1=1`;
  const params = [];

  if (filters.name) {
    sql += ' AND (LOWER(first_name) LIKE LOWER(?) OR LOWER(last_name) LIKE LOWER(?))';
    params.push(`%${filters.name}%`, `%${filters.name}%`);
  }
  if (filters.department) {
    sql += ' AND LOWER(department) = LOWER(?)';
    params.push(filters.department);
  }
  if (filters.q) {
    const term = `%${filters.q.toLowerCase()}%`;
    sql += ' AND (LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ?)';
    params.push(term, term);
  }

  const rows = db.prepare(sql).all(...params);
  return rows.map(row => rowToRecord('techs', row));
}

/**
 * Estimate search with status, customer, and date range filters.
 */
function searchEstimates(db, filters) {
  let sql = `SELECT * FROM cache_estimates WHERE 1=1`;
  const params = [];

  if (filters.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters.customer_id !== undefined) {
    sql += ' AND customer_id = ?';
    params.push(filters.customer_id);
  }
  if (filters.customerName) {
    sql += ' AND LOWER(customer_name) LIKE LOWER(?)';
    params.push(`%${filters.customerName}%`);
  }
  if (filters.dateFrom) {
    sql += ' AND created_at >= ?';
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    sql += ' AND created_at <= ?';
    params.push(filters.dateTo);
  }

  const rows = db.prepare(sql).all(...params);
  return rows.map(row => rowToRecord('estimates', row));
}

/**
 * Direct table search for locations/contacts commands.
 */
function searchTableDirect(db, table, filters, options = {}) {
  const fullTable = `cache_${table}`;
  let select = options.select || `${fullTable}.*`;
  let joins = options.joins || '';
  let where = '1=1';
  const params = [];

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    if (key.startsWith('like:')) {
      const col = key.slice(5);
      where += ` AND LOWER(${col}) LIKE LOWER(?)`;
      params.push(`%${value}%`);
    } else {
      where += ` AND ${key} = ?`;
      params.push(value);
    }
  }

  let sql = `SELECT ${select} FROM ${fullTable}${joins ? ' ' + joins : ''} WHERE ${where}`;
  if (options.groupBy) sql += ` GROUP BY ${options.groupBy}`;
  if (options.orderBy) sql += ` ORDER BY ${options.orderBy}`;

  const rows = db.prepare(sql).all(...params);
  return rows;
}

/**
 * Convert a SQLite row back to a record object.
 * Uses the `data` JSON column if available to preserve full API fields,
 * otherwise returns the row's own columns.
 */
function rowToRecord(entity, row) {
  if (row.data) {
    try {
      return JSON.parse(row.data);
    } catch {
      // Fall through to column-based return
    }
  }
  // Strip internal columns, return rest
  const { data: _data, ...rest } = row;
  return rest;
}

function touchMeta(db, entity) {
  db.prepare(`
    INSERT OR REPLACE INTO cache_meta (entity, refreshed_at) VALUES (?, datetime('now'))
  `).run(entity);
}

/**
 * Clear an entity and its child tables.
 */
function clearEntity(db, entity) {
  db.prepare(`DELETE FROM cache_${entity}`).run();

  // Clear child tables for customers
  if (entity === 'customers') {
    for (const child of ['cache_locations', 'cache_contacts', 'cache_phones', 'cache_emails']) {
      db.prepare(`DELETE FROM ${child}`).run();
    }
  }
  if (entity === 'jobs') {
    db.prepare(`DELETE FROM cache_job_techs`).run();
  }
}

export default createCache;
