import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createCache } from '../../src/utils/cache.js';

describe('techs enhanced filters', () => {
  let dir;
  let db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sfcli-te-'));
    db = createCache({ dbPath: join(dir, 'cache.db') });

    db.putMany('techs', [
      { id: 5, first_name: 'Mike', last_name: 'Johnson', email: 'mike@co.com', phone_1: '555-0001', department: 'HVAC' },
      { id: 8, first_name: 'Dan', last_name: 'Lee', email: 'dan@co.com', phone_1: '555-0002', department: 'Plumbing' },
      { id: 9, first_name: 'Mike', last_name: 'Williams', department: 'HVAC' },
    ]);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('filters by department', () => {
    const results = db.search('techs', { department: 'HVAC' });
    expect(results).toHaveLength(2);
  });

  it('filters by name', () => {
    const results = db.search('techs', { name: 'Mike' });
    expect(results).toHaveLength(2);
  });

  it('combines name and department', () => {
    const results = db.search('techs', { name: 'Dan', department: 'Plumbing' });
    expect(results).toHaveLength(1);
    expect(results[0].first_name).toBe('Dan');
  });
});

describe('estimates enhanced filters', () => {
  let dir;
  let db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sfcli-est-'));
    db = createCache({ dbPath: join(dir, 'cache.db') });

    db.putMany('estimates', [
      { id: 200, customer_id: 1, customer_name: 'Acme Corp', status: 'Approved', total: 3000, created_at: '2025-03-15' },
      { id: 201, customer_id: 2, customer_name: 'Beta Inc', status: 'Pending', total: 1500, created_at: '2025-06-01' },
      { id: 202, customer_id: 1, customer_name: 'Acme Corp', status: 'Rejected', total: 500, created_at: '2025-01-10' },
    ]);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('filters by status', () => {
    const results = db.search('estimates', { status: 'Approved' });
    expect(results).toHaveLength(1);
  });

  it('filters by customer name', () => {
    const results = db.search('estimates', { customerName: 'Beta' });
    expect(results).toHaveLength(1);
  });

  it('filters by date range', () => {
    const results = db.search('estimates', { dateFrom: '2025-03-01', dateTo: '2025-04-01' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(200);
  });

  it('combines filters', () => {
    const results = db.search('estimates', { status: 'Approved', customerName: 'Acme' });
    expect(results).toHaveLength(1);
  });
});
