import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { introspectSchema } from '../../src/ai/schema.js';

let tempDir;
let dbPath;

function seedDb(db) {
  // Create the same schema as src/utils/cache.js initSchema()
  db.exec(`
    CREATE TABLE IF NOT EXISTS cache_meta (
      entity TEXT PRIMARY KEY,
      refreshed_at TEXT
    )
  `);
  const entities = ['customers', 'jobs', 'estimates', 'invoices', 'techs', 'equipment'];
  for (const entity of entities) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cache_${entity} (
        id INTEGER PRIMARY KEY,
        data TEXT NOT NULL,
        searchable_text TEXT,
        cached_at TEXT NOT NULL
      )
    `);
  }
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'sfcli-schema-test-'));
  dbPath = join(tempDir, 'cache.db');
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('introspectSchema — table discovery', () => {
  it('returns all cache_* table names', () => {
    const db = new Database(dbPath);
    seedDb(db);
    db.close();

    const result = introspectSchema(dbPath);
    const tableNames = result.tables.map(t => t.name);
    expect(tableNames).toContain('cache_customers');
    expect(tableNames).toContain('cache_jobs');
    expect(tableNames).toContain('cache_meta');
    expect(tableNames).toHaveLength(7); // 6 entities + meta
  });

  it('returns column definitions for each table', () => {
    const db = new Database(dbPath);
    seedDb(db);
    db.close();

    const result = introspectSchema(dbPath);
    const customers = result.tables.find(t => t.name === 'cache_customers');
    expect(customers.columns).toContain('id');
    expect(customers.columns).toContain('data');
    expect(customers.columns).toContain('searchable_text');
    expect(customers.columns).toContain('cached_at');
  });
});

describe('introspectSchema — JSON field extraction', () => {
  it('discovers JSON field paths from sample data', () => {
    const db = new Database(dbPath);
    seedDb(db);
    db.prepare(`INSERT INTO cache_customers (id, data, searchable_text, cached_at) VALUES (?, ?, ?, datetime('now'))`)
      .run(1, JSON.stringify({ id: 1, customer_name: 'Acme', city: 'Dublin', zip_code: '94568' }), 'acme dublin', );
    db.close();

    const result = introspectSchema(dbPath);
    const customers = result.tables.find(t => t.name === 'cache_customers');
    expect(customers.jsonFields).toContain('id');
    expect(customers.jsonFields).toContain('customer_name');
    expect(customers.jsonFields).toContain('city');
    expect(customers.jsonFields).toContain('zip_code');
  });

  it('handles array fields with sub-keys', () => {
    const db = new Database(dbPath);
    seedDb(db);
    db.prepare(`INSERT INTO cache_customers (id, data, searchable_text, cached_at) VALUES (?, ?, ?, datetime('now'))`)
      .run(1, JSON.stringify({
        id: 1,
        customer_name: 'Kaiser',
        contacts: [
          { fname: 'David', lname: 'Faraone', phones: [{ phone: '4088510060' }] },
        ],
      }), 'kaiser', );
    db.close();

    const result = introspectSchema(dbPath);
    const customers = result.tables.find(t => t.name === 'cache_customers');
    expect(customers.jsonFields).toContain('contacts[].fname');
    expect(customers.jsonFields).toContain('contacts[].lname');
    expect(customers.jsonFields).toContain('contacts[].phones[].phone');
  });

  it('caps recursion at depth 3', () => {
    const db = new Database(dbPath);
    seedDb(db);
    db.prepare(`INSERT INTO cache_customers (id, data, searchable_text, cached_at) VALUES (?, ?, ?, datetime('now'))`)
      .run(1, JSON.stringify({
        id: 1,
        level1: { level2: { level3: { level4: 'too deep' } } },
      }), '', );
    db.close();

    const result = introspectSchema(dbPath);
    const customers = result.tables.find(t => t.name === 'cache_customers');
    expect(customers.jsonFields).toContain('level1.level2.level3');
    expect(customers.jsonFields).not.toContain('level1.level2.level3.level4');
  });

  it('handles empty tables — columns but no JSON fields', () => {
    const db = new Database(dbPath);
    seedDb(db);
    db.close();

    const result = introspectSchema(dbPath);
    const customers = result.tables.find(t => t.name === 'cache_customers');
    expect(customers.columns).toHaveLength(4);
    expect(customers.jsonFields).toEqual([]);
  });

  it('merges JSON fields from multiple sample rows', () => {
    const db = new Database(dbPath);
    seedDb(db);
    db.prepare(`INSERT INTO cache_customers (id, data, searchable_text, cached_at) VALUES (?, ?, ?, datetime('now'))`)
      .run(1, JSON.stringify({ id: 1, customer_name: 'Acme' }), '', );
    db.prepare(`INSERT INTO cache_customers (id, data, searchable_text, cached_at) VALUES (?, ?, ?, datetime('now'))`)
      .run(2, JSON.stringify({ id: 2, customer_name: 'Beta', email: 'beta@test.com' }), '', );
    db.close();

    const result = introspectSchema(dbPath);
    const customers = result.tables.find(t => t.name === 'cache_customers');
    expect(customers.jsonFields).toContain('customer_name');
    expect(customers.jsonFields).toContain('email');
  });
});

describe('introspectSchema — schemaText output', () => {
  it('returns a formatted schemaText string', () => {
    const db = new Database(dbPath);
    seedDb(db);
    db.prepare(`INSERT INTO cache_jobs (id, data, searchable_text, cached_at) VALUES (?, ?, ?, datetime('now'))`)
      .run(1, JSON.stringify({ id: 1, number: 'J-001', status: 'Scheduled', total: 150.00 }), '', );
    db.close();

    const result = introspectSchema(dbPath);
    expect(result.schemaText).toContain('Table: cache_jobs');
    expect(result.schemaText).toContain('Columns:');
    expect(result.schemaText).toContain('JSON fields in data column:');
    expect(result.schemaText).toContain('number');
    expect(result.schemaText).toContain('status');
  });

  it('includes cache_meta table in schemaText', () => {
    const db = new Database(dbPath);
    seedDb(db);
    db.close();

    const result = introspectSchema(dbPath);
    expect(result.schemaText).toContain('Table: cache_meta');
  });
});
