import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createCache } from '../../src/utils/cache.js';

describe('equipment enhanced filters', () => {
  let dir;
  let db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sfcli-eq-'));
    db = createCache({ dbPath: join(dir, 'cache.db') });

    db.putMany('customers', [
      { id: 1, customer_name: 'Acme Corp', contacts: [],
        locations: [{ id: 50, city: 'Austin', state_prov: 'TX', is_primary: true }] },
      { id: 2, customer_name: 'Beta Inc', contacts: [],
        locations: [{ id: 60, city: 'Houston', state_prov: 'TX', is_primary: true }] },
    ]);

    db.putMany('equipment', [
      { id: 400, customer_id: 1, type: 'HVAC', make: 'Carrier', model: '24ACC636', serial_number: 'SN-001' },
      { id: 401, customer_id: 1, type: 'HVAC', make: 'Trane', model: 'XR15', serial_number: 'SN-002' },
      { id: 402, customer_id: 2, type: 'Plumbing', make: 'Moen', model: 'Align', serial_number: 'SN-003' },
    ]);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists all equipment without customer filter', () => {
    const results = db.search('equipment', {});
    expect(results).toHaveLength(3);
  });

  it('filters by customer_id', () => {
    const results = db.search('equipment', { customer_id: 1 });
    expect(results).toHaveLength(2);
  });

  it('filters by type', () => {
    const results = db.search('equipment', { type: 'HVAC' });
    expect(results).toHaveLength(2);
  });

  it('filters by make', () => {
    const results = db.search('equipment', { make: 'Carrier' });
    expect(results).toHaveLength(1);
  });

  it('filters by model', () => {
    const results = db.search('equipment', { model: 'Align' });
    expect(results).toHaveLength(1);
  });

  it('filters by serial number', () => {
    const results = db.search('equipment', { serial: 'SN-002' });
    expect(results).toHaveLength(1);
  });

  it('filters by customer location city', () => {
    const results = db.search('equipment', { city: 'Austin' });
    expect(results).toHaveLength(2);
  });

  it('combines filters', () => {
    const results = db.search('equipment', { type: 'HVAC', make: 'Carrier' });
    expect(results).toHaveLength(1);
  });
});
