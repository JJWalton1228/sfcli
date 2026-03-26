import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createClient } from '../../src/api/client.js';
import { createCustomersApi } from '../../src/api/customers.js';
import { storeTokens, clearTokens } from '../../src/auth/token-store.js';

const TEST_PROFILE = '__test_customers__';
const BASE_URL = 'https://api.servicefusion.com/v1';

const MOCK_CUSTOMERS = [
  {
    id: 1, customer_name: 'Acme Corp',
    contacts: [{ fname: 'John', lname: 'Doe', is_primary: true, phones: [{ phone: '555-1234' }], emails: [{ email: 'acme@example.com' }] }],
    locations: [{ city: 'Dublin', state_prov: 'CA', is_primary: true }],
  },
  {
    id: 2, customer_name: 'Beta Inc',
    contacts: [{ fname: 'Jane', lname: 'Smith', is_primary: true, phones: [{ phone: '555-5678' }], emails: [{ email: 'beta@example.com' }] }],
    locations: [{ city: 'San Jose', state_prov: 'CA', is_primary: true }],
  },
];

function sfResponse(items, total) {
  return {
    items,
    _meta: { totalCount: total ?? items.length, pageCount: 1, currentPage: 1, perPage: 10 },
    _expandable: [],
  };
}

beforeEach(() => {
  storeTokens(TEST_PROFILE, { access_token: 'test_token', refresh_token: 'test_refresh', expires_in: 3600 });
  nock.cleanAll();
});

afterEach(() => {
  clearTokens(TEST_PROFILE);
  nock.cleanAll();
});

describe('Customers API', () => {
  it('should list customers', async () => {
    nock(BASE_URL)
      .get('/customers')
      .query(true)
      .reply(200, sfResponse(MOCK_CUSTOMERS));

    const client = createClient(TEST_PROFILE, { baseUrl: BASE_URL });
    const api = createCustomersApi(client);
    const items = await api.list();

    expect(items).toHaveLength(2);
    expect(items[0].customer_name).toBe('Acme Corp');
    // Flattened fields from contacts/locations
    expect(items[0].phone).toBe('555-1234');
    expect(items[0].email).toBe('acme@example.com');
    expect(items[0].city).toBe('Dublin');
    expect(items[0].state).toBe('CA');
  });

  it('should get a customer by ID', async () => {
    nock(BASE_URL)
      .get('/customers/1')
      .query(true)
      .reply(200, MOCK_CUSTOMERS[0]);

    const client = createClient(TEST_PROFILE, { baseUrl: BASE_URL });
    const api = createCustomersApi(client);
    const customer = await api.get(1);

    expect(customer.customer_name).toBe('Acme Corp');
    expect(customer.phone).toBe('555-1234');
  });

  it('should search customers with query and filter client-side', async () => {
    // Search fetches all pages then filters client-side
    nock(BASE_URL)
      .get('/customers')
      .query(true)
      .reply(200, sfResponse(MOCK_CUSTOMERS));

    const client = createClient(TEST_PROFILE, { baseUrl: BASE_URL });
    const api = createCustomersApi(client);
    const items = await api.search({ q: 'Acme' });

    expect(items).toHaveLength(1);
    expect(items[0].customer_name).toBe('Acme Corp');
  });

  it('should list with limit', async () => {
    nock(BASE_URL)
      .get('/customers')
      .query(true)
      .reply(200, sfResponse(MOCK_CUSTOMERS));

    const client = createClient(TEST_PROFILE, { baseUrl: BASE_URL });
    const api = createCustomersApi(client);
    const items = await api.list({}, { limit: 1 });

    expect(items).toHaveLength(1);
  });
});
