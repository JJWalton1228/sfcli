import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { validateSql, executeQuery } from '../../src/ai/executor.js';

let tempDir;
let dbPath;

function seedDb() {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE cache_customers (
      id INTEGER PRIMARY KEY,
      data TEXT NOT NULL,
      searchable_text TEXT,
      cached_at TEXT NOT NULL
    )
  `);
  const stmt = db.prepare(`INSERT INTO cache_customers (id, data, searchable_text, cached_at) VALUES (?, ?, ?, datetime('now'))`);
  stmt.run(1, JSON.stringify({ id: 1, customer_name: 'Acme Corp', city: 'Dublin', zip_code: '94568' }), 'acme corp dublin');
  stmt.run(2, JSON.stringify({ id: 2, customer_name: 'Beta Inc', city: 'Pleasanton', zip_code: '94566' }), 'beta inc pleasanton');
  stmt.run(3, JSON.stringify({ id: 3, customer_name: 'Gamma LLC', city: 'Dublin', zip_code: '94568' }), 'gamma llc dublin');
  db.close();
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'sfcli-exec-test-'));
  dbPath = join(tempDir, 'cache.db');
  seedDb();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('validateSql', () => {
  it('accepts SELECT statements', () => {
    expect(validateSql('SELECT * FROM cache_customers').valid).toBe(true);
  });

  it('accepts WITH...SELECT (CTEs)', () => {
    expect(validateSql('WITH cte AS (SELECT 1) SELECT * FROM cte').valid).toBe(true);
  });

  it('rejects INSERT', () => {
    const result = validateSql("INSERT INTO cache_customers VALUES (1, '{}', '', '')");
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects UPDATE', () => {
    expect(validateSql("UPDATE cache_customers SET data = '{}'").valid).toBe(false);
  });

  it('rejects DELETE', () => {
    expect(validateSql('DELETE FROM cache_customers').valid).toBe(false);
  });

  it('rejects DROP', () => {
    expect(validateSql('DROP TABLE cache_customers').valid).toBe(false);
  });

  it('rejects ALTER', () => {
    expect(validateSql('ALTER TABLE cache_customers ADD COLUMN x TEXT').valid).toBe(false);
  });

  it('rejects CREATE', () => {
    expect(validateSql('CREATE TABLE evil (id INT)').valid).toBe(false);
  });

  it('rejects ATTACH', () => {
    expect(validateSql("ATTACH DATABASE '/tmp/evil.db' AS evil").valid).toBe(false);
  });

  it('rejects DETACH', () => {
    expect(validateSql('DETACH DATABASE evil').valid).toBe(false);
  });

  it('is case-insensitive in rejection', () => {
    expect(validateSql('drop table cache_customers').valid).toBe(false);
    expect(validateSql('Delete From cache_customers').valid).toBe(false);
  });

  it('rejects empty or whitespace-only SQL', () => {
    expect(validateSql('').valid).toBe(false);
    expect(validateSql('   ').valid).toBe(false);
  });
});

describe('executeQuery', () => {
  it('returns rows, columns, and rowCount for valid SELECT', () => {
    const result = executeQuery('SELECT id, data FROM cache_customers', dbPath);
    expect(result.error).toBeUndefined();
    expect(result.rowCount).toBe(3);
    expect(result.columns).toContain('id');
    expect(result.columns).toContain('data');
    expect(result.rows).toHaveLength(3);
  });

  it('works with json_extract queries', () => {
    const sql = "SELECT json_extract(data, '$.customer_name') as name FROM cache_customers WHERE json_extract(data, '$.city') = 'Dublin'";
    const result = executeQuery(sql, dbPath);
    expect(result.rowCount).toBe(2);
    expect(result.rows[0].name).toBe('Acme Corp');
  });

  it('returns empty result for no matches', () => {
    const sql = "SELECT * FROM cache_customers WHERE json_extract(data, '$.city') = 'Nowhere'";
    const result = executeQuery(sql, dbPath);
    expect(result.rowCount).toBe(0);
    expect(result.rows).toEqual([]);
    expect(result.columns).toEqual([]);
  });

  it('returns error for invalid SQL', () => {
    const result = executeQuery('SELECT * FROM nonexistent_table', dbPath);
    expect(result.error).toBeTruthy();
    expect(result.rows).toEqual([]);
  });

  it('caps at 500 rows and sets truncated flag', () => {
    // Insert 510 rows
    const db = new Database(dbPath);
    for (let i = 10; i < 520; i++) {
      db.prepare(`INSERT INTO cache_customers (id, data, searchable_text, cached_at) VALUES (?, ?, ?, datetime('now'))`)
        .run(i, JSON.stringify({ id: i, customer_name: `Customer ${i}` }), `customer ${i}`);
    }
    db.close();

    const result = executeQuery('SELECT * FROM cache_customers', dbPath);
    expect(result.rows).toHaveLength(500);
    expect(result.truncated).toBe(true);
    expect(result.rowCount).toBe(500);
  });

  it('opens DB in read-only mode — mutation attempt fails', () => {
    const result = executeQuery("INSERT INTO cache_customers VALUES (99, '{}', '', '')", dbPath);
    expect(result.error).toBeTruthy();
  });
});
