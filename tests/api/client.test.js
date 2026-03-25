import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import nock from 'nock';
import { createClient } from '../../src/api/client.js';
import { storeTokens, clearTokens } from '../../src/auth/token-store.js';

const TEST_PROFILE = '__test_client__';
const BASE_URL = 'https://api.servicefusion.com/v1';

beforeEach(() => {
  storeTokens(TEST_PROFILE, {
    access_token: 'test_token',
    refresh_token: 'test_refresh',
    expires_in: 3600,
  });
  nock.cleanAll();
});

afterEach(() => {
  clearTokens(TEST_PROFILE);
  nock.cleanAll();
});

describe('API client', () => {
  it('should attach Authorization header', async () => {
    const scope = nock(BASE_URL)
      .get('/customers')
      .matchHeader('Authorization', 'Bearer test_token')
      .reply(200, { data: [{ id: 1 }] });

    const client = createClient(TEST_PROFILE, { baseUrl: BASE_URL });
    const response = await client.get('/customers');

    expect(response.data.data).toHaveLength(1);
    scope.done();
  });

  it('should retry on 429 with backoff', async () => {
    const scope = nock(BASE_URL)
      .get('/customers')
      .reply(429, {}, { 'Retry-After': '1' })
      .get('/customers')
      .reply(200, { data: [{ id: 1 }] });

    const client = createClient(TEST_PROFILE, { baseUrl: BASE_URL });
    const response = await client.get('/customers');

    expect(response.data.data).toHaveLength(1);
    scope.done();
  }, 10000);

  it('should throw user-friendly error on 404', async () => {
    nock(BASE_URL).get('/customers/99999').reply(404, {});

    const client = createClient(TEST_PROFILE, { baseUrl: BASE_URL });
    await expect(client.get('/customers/99999')).rejects.toThrow('Resource not found.');
  });

  it('should throw user-friendly error on 500', async () => {
    nock(BASE_URL).get('/customers').reply(500, {});

    const client = createClient(TEST_PROFILE, { baseUrl: BASE_URL });
    await expect(client.get('/customers')).rejects.toThrow('Service Fusion server error');
  });
});
