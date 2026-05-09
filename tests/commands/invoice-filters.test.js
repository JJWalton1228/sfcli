import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createCache } from '../../src/utils/cache.js';

describe('invoice enhanced filters', () => {
  let dir;
  let db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sfcli-inv-'));
    db = createCache({ dbPath: join(dir, 'cache.db') });

    db.putMany('invoices', [
      { id: 300, customer_id: 1, customer: 'Acme Corp', number: 'INV-001', is_paid: true, total: 1000, date: '2025-03-15' },
      { id: 301, customer_id: 1, customer: 'Acme Corp', number: 'INV-002', is_paid: false, total: 500, date: '2025-06-01' },
      { id: 302, customer_id: 2, customer: 'Beta Inc', number: 'INV-003', is_paid: false, total: 2000, date: '2025-01-10' },
    ]);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('filters by paid', () => {
    const results = db.search('invoices', { paid: true });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(300);
  });

  it('filters by unpaid', () => {
    const results = db.search('invoices', { paid: false });
    expect(results).toHaveLength(2);
  });

  it('filters by customer name', () => {
    const results = db.search('invoices', { customerName: 'Beta' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(302);
  });

  it('filters by date range', () => {
    const results = db.search('invoices', { dateFrom: '2025-03-01', dateTo: '2025-04-01' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(300);
  });

  it('filters by min and max total', () => {
    const results = db.search('invoices', { minTotal: 800, maxTotal: 1500 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(300);
  });

  it('combines filters', () => {
    const results = db.search('invoices', { paid: false, customerName: 'Acme' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(301);
  });
});
