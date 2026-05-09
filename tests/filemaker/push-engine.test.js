import { describe, it, expect, vi } from 'vitest';
import { push } from '../../src/filemaker/sync-engine.js';

/**
 * Integration-style test: exercises push() with fake FM and SF clients.
 * Verifies the push engine selects records via fm.find() with the correct
 * query when a sinceDate / five-year window / active-only filter applies,
 * and falls back to getAllRecords() when no filter applies.
 */

function fakeFmClient({ findResult = [], getAllResult = [] } = {}) {
  return {
    find: vi.fn(async (_layout, _query) => findResult),
    getAllRecords: vi.fn(async (_layout) => getAllResult),
    updateRecord: vi.fn(async () => {}),
  };
}

function fakeSfClient() {
  return {
    post: vi.fn(async () => ({ data: { id: 999 } })),
    put: vi.fn(async () => ({ data: {} })),
  };
}

describe('push() equipment uses customer-scoped endpoint', () => {
  const equipmentMapping = {
    sf_endpoint: '/customers/{customer_id}/equipment',
    fm_layout: 'API_Equipment',
    id_field: { sf: 'id', fm: 'SF_EquipmentID' },
    field_map: { customer_id: 'SF_CustomerID', name: 'EquipmentName' },
  };

  it('creates equipment via /customers/{customer_id}/equipment when template is used', async () => {
    const fmRecords = [
      { recordId: '1', fieldData: { SF_CustomerID: '42', EquipmentName: 'Trane XR16', SF_EquipmentID: '' } },
    ];
    const fm = {
      find: vi.fn(async () => []),
      getAllRecords: vi.fn(async () => fmRecords),
      updateRecord: vi.fn(async () => {}),
    };
    const sf = fakeSfClient();

    await push(sf, fm, 'equipment', equipmentMapping, {});

    expect(sf.post).toHaveBeenCalledTimes(1);
    const [path, body] = sf.post.mock.calls[0];
    expect(path).toBe('/customers/42/equipment');
    expect(body).not.toHaveProperty('customer_id'); // customer_id is used only for the path
  });

  it('updates equipment via /customers/{customer_id}/equipment/{id}', async () => {
    const fmRecords = [
      { recordId: '2', fieldData: { SF_CustomerID: '42', SF_EquipmentID: '500', EquipmentName: 'Updated' } },
    ];
    const fm = {
      find: vi.fn(async () => []),
      getAllRecords: vi.fn(async () => fmRecords),
      updateRecord: vi.fn(async () => {}),
    };
    const sf = fakeSfClient();

    await push(sf, fm, 'equipment', equipmentMapping, {});

    expect(sf.put).toHaveBeenCalledTimes(1);
    const [path] = sf.put.mock.calls[0];
    expect(path).toBe('/customers/42/equipment/500');
  });
});

describe('push() filters FM records', () => {
  const customersMapping = {
    sf_endpoint: '/customers',
    fm_layout: 'API_Customers',
    id_field: { sf: 'id', fm: 'SF_CustomerID' },
    fm_last_modified_field: 'ModifiedTS',
    field_map: { customer_name: 'CompanyName' },
  };

  const techsMapping = {
    sf_endpoint: '/technicians',
    fm_layout: 'API_Technicians',
    id_field: { sf: 'id', fm: 'SF_TechID' },
    fm_last_modified_field: 'ModifiedTS',
    fm_active_field: 'Status',
    fm_active_value: 'Active',
    field_map: { first_name: 'FirstName' },
  };

  it('calls fm.find with since-date query when sinceDate is provided', async () => {
    const fm = fakeFmClient({ findResult: [] });
    const sf = fakeSfClient();

    await push(sf, fm, 'customers', customersMapping, {
      sinceDate: '2026-03-01T00:00:00.000Z',
      dryRun: true,
    });

    expect(fm.find).toHaveBeenCalledWith('API_Customers', [
      { ModifiedTS: '>=2026-03-01T00:00:00.000Z' },
    ]);
    expect(fm.getAllRecords).not.toHaveBeenCalled();
  });

  it('calls fm.find with active-only query for technicians', async () => {
    const fm = fakeFmClient({ findResult: [] });
    const sf = fakeSfClient();

    await push(sf, fm, 'technicians', techsMapping, { dryRun: true });

    expect(fm.find).toHaveBeenCalledWith('API_Technicians', [
      { Status: '==Active' },
    ]);
    expect(fm.getAllRecords).not.toHaveBeenCalled();
  });

  it('calls fm.find with five-year window when fiveYearWindow is set', async () => {
    const fm = fakeFmClient({ findResult: [] });
    const sf = fakeSfClient();

    await push(sf, fm, 'customers', customersMapping, {
      fiveYearWindow: true,
      dryRun: true,
    });

    expect(fm.find).toHaveBeenCalledTimes(1);
    const [, query] = fm.find.mock.calls[0];
    expect(query[0].ModifiedTS).toMatch(/^>=\d{4}-\d{2}-\d{2}/);
  });

  it('falls back to getAllRecords when no filters apply', async () => {
    const fm = fakeFmClient({ getAllResult: [] });
    const sf = fakeSfClient();
    const noFilterMapping = { ...customersMapping };
    delete noFilterMapping.fm_last_modified_field;

    await push(sf, fm, 'customers', noFilterMapping, { dryRun: true });

    expect(fm.getAllRecords).toHaveBeenCalledWith('API_Customers');
    expect(fm.find).not.toHaveBeenCalled();
  });
});
