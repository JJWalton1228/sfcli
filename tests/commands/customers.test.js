import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createClient } from '../../src/api/client.js';
import { createCustomersApi } from '../../src/api/customers.js';
import { storeTokens, clearTokens } from '../../src/auth/token-store.js';

const TEST_PROFILE = '__test_customers__';
const BASE_URL = 'https://api.servicefusion.com/v1';

const MOCK_CUSTOMERS = [
  { id: 1, customer_name: 'Acme Corp', phone: '555-1234', email: 'acme@example.com', city: 'Dublin', state: 'CA' },
  { id: 2, customer_name: 'Beta Inc', phone: '555-5678', email: 'beta@example.com', city: 'San Jose', state: 'CA' },
];

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
      .reply(200, { data: MOCK_CUSTOMERS, total: 2, page: 1, total_pages: 1 });

    const client = createClient(TEST_PROFILE, { baseUrl: BASE_URL });
    const api = createCustomersApi(client);
    const items = await api.list();

    expect(items).toHaveLength(2);
    expect(items[0].customer_name).toBe('Acme Corp');
  });

  it('should get a customer by ID', async () => {
    nock(BASE_URL)
      .get('/customers/1')
      .reply(200, MOCK_CUSTOMERS[0]);

    const client = createClient(TEST_PROFILE, { baseUrl: BASE_URL });
    const api = createCustomersApi(client);
    const customer = await api.get(1);

    expect(customer.customer_name).toBe('Acme Corp');
  });

  it('should search customers with query params', async () => {
    nock(BASE_URL)
      .get('/customers')
      .query((q) => q.q === 'Acme')
      .reply(200, { data: [MOCK_CUSTOMERS[0]], total: 1, page: 1, total_pages: 1 });

    const client = createClient(TEST_PROFILE, { baseUrl: BASE_URL });
    const api = createCustomersApi(client);
    const items = await api.search({ q: 'Acme' });

    expect(items).toHaveLength(1);
    expect(items[0].customer_name).toBe('Acme Corp');
  });

  it('should list with limit', async () => {
    nock(BASE_URL)
      .get('/customers')
      .query((q) => q.per_page === '5')
      .reply(200, { data: MOCK_CUSTOMERS.slice(0, 1), total: 2, page: 1, total_pages: 1 });

    const client = createClient(TEST_PROFILE, { baseUrl: BASE_URL });
    const api = createCustomersApi(client);
    const items = await api.list({}, { limit: 5 });

    expect(items).toHaveLength(1);
  });
});
