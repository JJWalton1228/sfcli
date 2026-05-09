import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createCache } from '../../src/utils/cache.js';
import { searchContacts } from '../../src/commands/contacts.js';

describe('contacts command', () => {
  let dir;
  let db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sfcli-con-'));
    db = createCache({ dbPath: join(dir, 'cache.db') });

    db.putMany('customers', [
      {
        id: 1, customer_name: 'Acme Corp',
        contacts: [
          { id: 10, fname: 'John', lname: 'Doe', is_primary: true,
            phones: [{ phone: '555-1234', type: 'work' }],
            emails: [{ email: 'john@acme.com', type: 'work' }] },
          { id: 11, fname: 'Jane', lname: 'Smith', is_primary: false,
            phones: [{ phone: '555-5678', type: 'mobile' }],
            emails: [{ email: 'jane@acme.com' }] },
        ],
        locations: [],
      },
      {
        id: 2, customer_name: 'Beta Inc',
        contacts: [
          { id: 20, fname: 'Bob', lname: 'Jones', is_primary: true,
            phones: [{ phone: '(512) 555-9999' }],
            emails: [{ email: 'bob@beta.com' }] },
        ],
        locations: [],
      },
    ]);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists all contacts with customer_name, phone, and email', () => {
    const results = searchContacts(db, {});
    expect(results).toHaveLength(3);
    expect(results[0]).toHaveProperty('customer_name');
    expect(results[0]).toHaveProperty('phone');
    expect(results[0]).toHaveProperty('email');
  });

  it('filters by customer name substring', () => {
    const results = searchContacts(db, { customer: 'Beta' });
    expect(results).toHaveLength(1);
    expect(results[0].first_name).toBe('Bob');
  });

  it('filters by customer ID', () => {
    const results = searchContacts(db, { customer: '1' });
    expect(results).toHaveLength(2);
  });

  it('filters by contact name substring', () => {
    const results = searchContacts(db, { name: 'Jane' });
    expect(results).toHaveLength(1);
    expect(results[0].last_name).toBe('Smith');
  });

  it('filters by phone with normalization', () => {
    const results = searchContacts(db, { phone: '5559999' });
    expect(results).toHaveLength(1);
    expect(results[0].first_name).toBe('Bob');
  });

  it('filters by email', () => {
    const results = searchContacts(db, { email: 'john@acme.com' });
    expect(results).toHaveLength(1);
    expect(results[0].first_name).toBe('John');
  });

  it('combines filters', () => {
    const results = searchContacts(db, { customer: 'Acme', name: 'John' });
    expect(results).toHaveLength(1);
    expect(results[0].email).toBe('john@acme.com');
  });

  it('returns empty when no match', () => {
    const results = searchContacts(db, { name: 'Nonexistent' });
    expect(results).toEqual([]);
  });
});
