import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { initNormalizedSchema, getSchemaVersion, SCHEMA_VERSION } from '../../src/cache/schema.js';

describe('normalized schema', () => {
  let dir;
  let db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sfcli-schema-'));
    db = new Database(join(dir, 'test.db'));
    db.pragma('journal_mode = WAL');
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('stores and retrieves the schema version', () => {
    initNormalizedSchema(db);
    expect(getSchemaVersion(db)).toBe(SCHEMA_VERSION);
  });

  it('returns version 0 on a fresh database before initialization', () => {
    expect(getSchemaVersion(db)).toBe(0);
  });

  it('is idempotent when called multiple times with matching version', () => {
    initNormalizedSchema(db);
    // Insert a row to prove data survives re-init
    db.prepare("INSERT INTO cache_customers (id, customer_name) VALUES (1, 'Acme')").run();

    initNormalizedSchema(db);

    const row = db.prepare("SELECT customer_name FROM cache_customers WHERE id = 1").get();
    expect(row.customer_name).toBe('Acme');
  });

  it('drops and recreates tables on version mismatch', () => {
    initNormalizedSchema(db);
    // Insert data
    db.prepare("INSERT INTO cache_customers (id, customer_name) VALUES (1, 'Acme')").run();

    // Simulate old version
    db.prepare(
      "UPDATE cache_meta SET refreshed_at = '1' WHERE entity = '__schema_version'"
    ).run();

    // Re-init should detect mismatch and rebuild
    initNormalizedSchema(db);

    // Data should be gone (tables were dropped)
    const count = db.prepare("SELECT COUNT(*) as c FROM cache_customers").get();
    expect(count.c).toBe(0);

    // But schema version should be current
    expect(getSchemaVersion(db)).toBe(SCHEMA_VERSION);
  });

  it('migrates from legacy JSON-blob schema', () => {
    // Simulate legacy schema (v0 — no version stored, old-style tables)
    db.exec(`
      CREATE TABLE cache_meta (entity TEXT PRIMARY KEY, refreshed_at TEXT);
      CREATE TABLE cache_customers (id INTEGER PRIMARY KEY, data TEXT, searchable_text TEXT, cached_at TEXT);
    `);
    db.prepare("INSERT INTO cache_customers (id, data, searchable_text, cached_at) VALUES (1, '{}', 'test', '2025-01-01')").run();

    // Init should detect version 0, drop legacy, create normalized
    initNormalizedSchema(db);

    // Should have normalized columns now
    const cols = db.prepare("PRAGMA table_info(cache_customers)").all().map(c => c.name);
    expect(cols).toContain('customer_name');
    expect(cols).not.toContain('searchable_text');
    expect(cols).not.toContain('cached_at');
    expect(getSchemaVersion(db)).toBe(SCHEMA_VERSION);
  });

  it('creates all normalized tables on a fresh database', () => {
    initNormalizedSchema(db);

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);

    expect(tables).toContain('cache_customers');
    expect(tables).toContain('cache_locations');
    expect(tables).toContain('cache_contacts');
    expect(tables).toContain('cache_phones');
    expect(tables).toContain('cache_emails');
    expect(tables).toContain('cache_jobs');
    expect(tables).toContain('cache_job_techs');
    expect(tables).toContain('cache_estimates');
    expect(tables).toContain('cache_invoices');
    expect(tables).toContain('cache_techs');
    expect(tables).toContain('cache_equipment');
    expect(tables).toContain('cache_meta');
  });
});
