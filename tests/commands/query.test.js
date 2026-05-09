import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createCache } from '../../src/utils/cache.js';
import { executeQueryOnCache, validateQuerySql } from '../../src/commands/query.js';

describe('query command', () => {
  let dir;
  let db;
  let dbPath;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sfcli-q-'));
    dbPath = join(dir, 'cache.db');
    db = createCache({ dbPath });

    db.putMany('customers', [
      { id: 1, customer_name: 'Acme Corp', contacts: [],
        locations: [{ id: 50, city: 'Austin', state_prov: 'TX', is_primary: true }] },
      { id: 2, customer_name: 'Beta Inc', contacts: [],
        locations: [{ id: 60, city: 'Houston', state_prov: 'TX', is_primary: true }] },
    ]);
    db.putMany('jobs', [
      { id: 100, customer_id: 1, customer_name: 'Acme Corp', status: 'Completed', total: 500, start_date: '2025-03-15' },
      { id: 101, customer_id: 2, customer_name: 'Beta Inc', status: 'Open', total: 200, start_date: '2025-06-01' },
    ]);
    db.close();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('executes a simple SELECT query', () => {
    const result = executeQueryOnCache('SELECT customer_name FROM cache_customers ORDER BY id', dbPath);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].customer_name).toBe('Acme Corp');
    expect(result.columns).toContain('customer_name');
  });

  it('executes a JOIN query across tables', () => {
    const sql = `
      SELECT c.customer_name, j.status, j.total
      FROM cache_customers c
      JOIN cache_jobs j ON j.customer_id = c.id
      WHERE j.status = 'Completed'
    `;
    const result = executeQueryOnCache(sql, dbPath);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].customer_name).toBe('Acme Corp');
    expect(result.rows[0].total).toBe(500);
  });

  it('executes a query joining customers and locations', () => {
    const sql = `
      SELECT c.customer_name, l.city
      FROM cache_customers c
      JOIN cache_locations l ON l.customer_id = c.id
      WHERE l.city = 'Austin'
    `;
    const result = executeQueryOnCache(sql, dbPath);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].customer_name).toBe('Acme Corp');
  });

  it('rejects INSERT statements', () => {
    const result = validateQuerySql("INSERT INTO cache_customers (id) VALUES (999)");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects DELETE statements', () => {
    const result = validateQuerySql("DELETE FROM cache_customers");
    expect(result.valid).toBe(false);
  });

  it('rejects DROP statements', () => {
    const result = validateQuerySql("DROP TABLE cache_customers");
    expect(result.valid).toBe(false);
  });

  it('allows WITH (CTE) queries', () => {
    const sql = `
      WITH totals AS (SELECT customer_id, SUM(total) as rev FROM cache_jobs GROUP BY customer_id)
      SELECT c.customer_name, t.rev
      FROM cache_customers c
      JOIN totals t ON t.customer_id = c.id
    `;
    const result = executeQueryOnCache(sql, dbPath);
    expect(result.rows).toHaveLength(2);
  });

  it('returns error for bad SQL syntax', () => {
    const result = executeQueryOnCache('SELECT * FORM cache_customers', dbPath);
    expect(result.error).toBeDefined();
    expect(result.rows).toEqual([]);
  });

  it('returns empty result for no-match query', () => {
    const result = executeQueryOnCache("SELECT * FROM cache_customers WHERE customer_name = 'Nonexistent'", dbPath);
    expect(result.rows).toEqual([]);
    expect(result.error).toBeUndefined();
  });
});
