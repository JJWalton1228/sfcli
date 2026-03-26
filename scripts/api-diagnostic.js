#!/usr/bin/env node
/**
 * API Diagnostic — Tests search params, nested resources, and response shapes.
 * Usage: node scripts/api-diagnostic.js
 */
import { createClient } from '../src/api/client.js';
import { getActiveProfileName, getProfileConfig } from '../src/config/index.js';

const profileName = getActiveProfileName();
const profileConfig = getProfileConfig(profileName);
const client = createClient(profileName, { baseUrl: profileConfig.base_url, verbose: false });

async function tryRequest(label, path, params = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${label}`);
  console.log(`  GET ${path} ${JSON.stringify(params)}`);
  console.log('='.repeat(60));
  try {
    const resp = await client.get(path, { params });
    const data = resp.data;
    const items = Array.isArray(data) ? data : data.data ?? data.items ?? [];
    console.log(`  Status: ${resp.status}`);
    console.log(`  Response keys: ${Object.keys(data).join(', ')}`);
    console.log(`  Items count: ${items.length}`);
    if (items.length > 0) {
      console.log(`  First item keys: ${Object.keys(items[0]).join(', ')}`);
      console.log(`  First item (truncated):`);
      const first = items[0];
      for (const [k, v] of Object.entries(first)) {
        const val = typeof v === 'object' ? JSON.stringify(v) : v;
        const display = String(val).length > 80 ? String(val).slice(0, 80) + '...' : val;
        console.log(`    ${k}: ${display}`);
      }
    }
    // Show pagination info
    if (data.total !== undefined) console.log(`  total: ${data.total}`);
    if (data.per_page !== undefined) console.log(`  per_page: ${data.per_page}`);
    if (data.current_page !== undefined) console.log(`  current_page: ${data.current_page}`);
    if (data.last_page !== undefined) console.log(`  last_page: ${data.last_page}`);
    return { success: true, data, items };
  } catch (err) {
    console.log(`  ERROR: ${err.response?.status ?? 'network'} — ${err.message}`);
    if (err.response?.data) console.log(`  Body: ${JSON.stringify(err.response.data).slice(0, 200)}`);
    return { success: false };
  }
}

async function main() {
  console.log('Service Fusion API Diagnostic');
  console.log(`Profile: ${profileName}`);
  console.log(`Base URL: ${profileConfig.base_url || 'https://api.servicefusion.com/v1'}`);

  // 1. Basic list — check response shape and pagination
  const listResult = await tryRequest('Basic customer list (page 1, per_page 2)', '/customers', { per_page: 2, page: 1 });

  // 2. Get first customer by ID to see full object
  if (listResult.success && listResult.items.length > 0) {
    const firstId = listResult.items[0].id;
    await tryRequest(`Get single customer (ID: ${firstId})`, `/customers/${firstId}`);

    // 3. Try nested resources
    await tryRequest(`Customer contacts`, `/customers/${firstId}/contacts`);
    await tryRequest(`Customer locations`, `/customers/${firstId}/locations`);
    await tryRequest(`Customer addresses`, `/customers/${firstId}/addresses`);
    await tryRequest(`Customer jobs`, `/customers/${firstId}/jobs`);
  }

  // 4. Search param variants — find which actually filter
  const searchName = 'Kaiser'; // user reported this doesn't work
  await tryRequest('Search: ?q=Kaiser', '/customers', { q: searchName, per_page: 5 });
  await tryRequest('Search: ?search=Kaiser', '/customers', { search: searchName, per_page: 5 });
  await tryRequest('Search: ?customer_name=Kaiser', '/customers', { customer_name: searchName, per_page: 5 });
  await tryRequest('Search: ?filters[customer_name]=Kaiser', '/customers', { 'filters[customer_name]': searchName, per_page: 5 });
  await tryRequest('Search: ?name=Kaiser', '/customers', { name: searchName, per_page: 5 });

  // 5. Try jobs response shape
  await tryRequest('Jobs list (page 1, per_page 2)', '/jobs', { per_page: 2, page: 1 });

  if (listResult.success && listResult.items.length > 0) {
    const firstId = listResult.items[0].id;
    // Check if the customer has nested contacts by getting the full object
    const fullResult = await tryRequest(`Full customer GET (check for nested objects)`, `/customers/${firstId}`);
    if (fullResult.success) {
      const obj = fullResult.data?.data ?? fullResult.data;
      // Check which fields are objects (potential nested resources)
      const nestedFields = Object.entries(obj).filter(([, v]) => v !== null && typeof v === 'object');
      if (nestedFields.length > 0) {
        console.log('\n  Nested/Object fields found:');
        for (const [k, v] of nestedFields) {
          console.log(`    ${k}: ${JSON.stringify(v).slice(0, 100)}`);
        }
      }
    }
  }

  console.log('\n\nDiagnostic complete.');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
