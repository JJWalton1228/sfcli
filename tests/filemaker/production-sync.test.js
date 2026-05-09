import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createCache } from '../../src/utils/cache.js';
import { push } from '../../src/filemaker/sync-engine.js';

function fakeFmClient(records) {
  return {
    find: vi.fn(async () => records),
    getAllRecords: vi.fn(async () => records),
    updateRecord: vi.fn(async () => {
      throw new Error('FileMaker must remain read-only');
    }),
  };
}

function fakeSfClient({ customers = [] } = {}) {
  return {
    get: vi.fn(async (path) => {
      if (path === '/customers') return { data: { items: customers } };
      return { data: {} };
    }),
    post: vi.fn(async () => ({ data: { id: 9001 } })),
    put: vi.fn(async () => ({ data: {} })),
  };
}

describe('production FileMaker push', () => {
  let dir;
  let cache;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sfcli-prod-sync-'));
    cache = createCache({ dbPath: join(dir, 'cache.db') });
  });

  afterEach(() => {
    cache.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const customerMapping = {
    sf_endpoint: '/customers',
    fm_layout: 'API_Customers',
    production_key_field: 'org_name',
    fm_created_field: 'created_date',
    fm_last_modified_field: 'modified_date',
    id_field: { sf: 'id', fm: 'unused' },
    field_map: {
      org_name: 'org_name',
      phone: 'Phone',
      email: 'Email',
      street_1: 'Address1',
    },
  };

  it('maps exact FileMaker org_name to Service Fusion customer_name without writing to FileMaker', async () => {
    const fm = fakeFmClient([
      { recordId: '1', fieldData: { org_name: 'Acme Corp', Phone: '555-0100', Email: 'ops@acme.test' } },
    ]);
    const sf = fakeSfClient();

    const stats = await push(sf, fm, 'customers', customerMapping, {
      production: true,
      dryRun: false,
      syncDb: cache,
      skipLog: true,
    });

    expect(sf.post).toHaveBeenCalledWith('/customers', {
      customer_name: 'Acme Corp',
      phone: '555-0100',
      email: 'ops@acme.test',
    });
    expect(fm.updateRecord).not.toHaveBeenCalled();
    expect(stats.created).toBe(1);
    expect(cache.getSyncLink('customer', 'Acme Corp')).toMatchObject({
      entity_type: 'customer',
      source_key: 'Acme Corp',
      sf_id: '9001',
      status: 'linked',
    });
  });

  it('updates a linked Service Fusion customer by exact org_name', async () => {
    cache.upsertSyncLink({
      entityType: 'customer',
      sourceKey: 'Acme Corp',
      sfId: '42',
      originalKey: 'Acme Corp',
      matchEvidence: { source: 'test' },
      status: 'linked',
    });
    const fm = fakeFmClient([
      { recordId: '1', fieldData: { org_name: 'Acme Corp', Phone: '555-9999' } },
    ]);
    const sf = fakeSfClient();

    const stats = await push(sf, fm, 'customers', customerMapping, {
      production: true,
      dryRun: false,
      syncDb: cache,
      skipLog: true,
    });

    expect(sf.put).toHaveBeenCalledWith('/customers/42', {
      customer_name: 'Acme Corp',
      phone: '555-9999',
    });
    expect(fm.updateRecord).not.toHaveBeenCalled();
    expect(stats.updated).toBe(1);
  });

  it('skips duplicate exact Service Fusion customer_name matches during dry-run audit', async () => {
    const fm = fakeFmClient([
      { recordId: '1', fieldData: { org_name: 'Acme Corp' } },
    ]);
    const sf = fakeSfClient({
      customers: [
        { id: 10, customer_name: 'Acme Corp' },
        { id: 11, customer_name: 'Acme Corp' },
      ],
    });

    const stats = await push(sf, fm, 'customers', customerMapping, {
      production: true,
      dryRun: true,
      syncDb: cache,
      skipLog: true,
    });

    expect(sf.post).not.toHaveBeenCalled();
    expect(sf.put).not.toHaveBeenCalled();
    expect(stats.duplicates).toBe(1);
    expect(stats.skipped).toBe(1);
  });

  it('skips ambiguous composite rename matches', async () => {
    const fm = fakeFmClient([
      {
        recordId: '1',
        fieldData: {
          org_name: 'Acme Renamed',
          Phone: '555-0100',
          Email: 'ops@acme.test',
          Address1: '1 Main St',
        },
      },
    ]);
    const sf = fakeSfClient({
      customers: [
        {
          id: 10,
          customer_name: 'Acme Old',
          contacts: [{ phones: [{ phone: '(555) 0100' }], emails: [{ email: 'ops@acme.test' }] }],
          locations: [{ street_1: '1 Main St' }],
        },
        {
          id: 11,
          customer_name: 'Acme Other',
          contacts: [{ phones: [{ phone: '5550100' }], emails: [{ email: 'ops@acme.test' }] }],
          locations: [{ street_1: '1 Main St' }],
        },
      ],
    });

    const stats = await push(sf, fm, 'customers', customerMapping, {
      production: true,
      dryRun: true,
      syncDb: cache,
      skipLog: true,
    });

    expect(stats.duplicates).toBe(1);
    expect(stats.skipped).toBe(1);
    expect(sf.post).not.toHaveBeenCalled();
    expect(sf.put).not.toHaveBeenCalled();
  });

  it('blocks child entity writes in production until parent org_name mapping is confirmed', async () => {
    const fm = fakeFmClient([
      { recordId: '1', fieldData: { SF_EquipmentID: '', EquipmentName: 'RTU 1' } },
    ]);
    const sf = fakeSfClient();
    const equipmentMapping = {
      sf_endpoint: '/customers/{customer_id}/equipment',
      fm_layout: 'API_Equipment',
      id_field: { sf: 'id', fm: 'SF_EquipmentID' },
      field_map: { name: 'EquipmentName' },
    };

    const stats = await push(sf, fm, 'equipment', equipmentMapping, {
      production: true,
      dryRun: false,
      syncDb: cache,
      skipLog: true,
    });

    expect(sf.post).not.toHaveBeenCalled();
    expect(sf.put).not.toHaveBeenCalled();
    expect(stats.blocked).toBe(1);
    expect(stats.skipped).toBe(1);
  });
});
