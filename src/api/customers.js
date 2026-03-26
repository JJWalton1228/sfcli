import { fetchAll, fetchPage } from '../utils/paginator.js';
import { SF_PAGE_SIZE } from './constants.js';

const DEFAULT_EXPAND = 'contacts,contacts.phones,contacts.emails,locations';

/**
 * Flatten a customer record: extract primary contact phone/email
 * and primary location city/state into top-level fields.
 */
export function flattenCustomer(c) {
  const primaryContact = c.contacts?.find(ct => ct.is_primary) ?? c.contacts?.[0];
  const primaryLocation = c.locations?.find(l => l.is_primary) ?? c.locations?.[0];
  const primaryPhone = primaryContact?.phones?.[0]?.phone ?? null;
  const primaryEmail = primaryContact?.emails?.[0]?.email ?? null;

  return {
    ...c,
    contact_first_name: primaryContact?.fname ?? null,
    contact_last_name: primaryContact?.lname ?? null,
    phone: primaryPhone,
    email: primaryEmail,
    street_1: primaryLocation?.street_1 ?? null,
    street_2: primaryLocation?.street_2 ?? null,
    city: primaryLocation?.city ?? null,
    state: primaryLocation?.state_prov ?? null,
    zip_code: primaryLocation?.postal_code ?? null,
  };
}

/**
 * Customers API wrapper.
 */
export function createCustomersApi(client) {
  return {
    /**
     * List customers with pagination.
     */
    async list(params = {}, options = {}) {
      const queryParams = { ...params, expand: DEFAULT_EXPAND };
      let items;
      if (options.all) {
        items = await fetchAll(client, '/customers', queryParams);
      } else if (options.limit) {
        // Fetch pages until we have enough
        items = await fetchAll(client, '/customers', queryParams, {
          maxPages: Math.ceil(options.limit / SF_PAGE_SIZE),
          showProgress: false,
        });
        items = items.slice(0, options.limit);
      } else {
        const result = await fetchPage(client, '/customers', queryParams);
        items = result.items;
      }
      return items.map(flattenCustomer);
    },

    /**
     * Get a single customer by ID with expanded contacts/locations.
     */
    async get(id) {
      const response = await client.get(`/customers/${id}`, {
        params: { expand: DEFAULT_EXPAND },
      });
      return flattenCustomer(response.data);
    },

    /**
     * Search customers by name (client-side filter since API doesn't support it).
     * Fetches all pages and filters by customer_name match.
     */
    async search(params = {}) {
      const { q, phone, email, city, state, created_after, created_before, tag, ...rest } = params;
      const queryParams = { ...rest, expand: DEFAULT_EXPAND };

      // Fetch all and filter client-side
      const all = await fetchAll(client, '/customers', queryParams);
      let results = all.map(flattenCustomer);

      if (q) {
        const term = q.toLowerCase();
        results = results.filter(c =>
          c.customer_name?.toLowerCase().includes(term) ||
          c.contact_first_name?.toLowerCase().includes(term) ||
          c.contact_last_name?.toLowerCase().includes(term) ||
          String(c.account_number ?? '').toLowerCase().includes(term)
        );
      }
      if (phone) {
        const normalized = phone.replace(/\D/g, '');
        results = results.filter(c => c.phone?.replace(/\D/g, '').includes(normalized));
      }
      if (email) {
        const term = email.toLowerCase();
        results = results.filter(c => c.email?.toLowerCase().includes(term));
      }
      if (city) {
        const term = city.toLowerCase();
        results = results.filter(c => c.city?.toLowerCase().includes(term));
      }
      if (state) {
        const term = state.toLowerCase();
        results = results.filter(c => c.state?.toLowerCase().includes(term));
      }
      if (tag) {
        results = results.filter(c => c.tags?.some(t => t.toLowerCase().includes(tag.toLowerCase())));
      }
      if (created_after) {
        results = results.filter(c => c.created_at && c.created_at >= created_after);
      }
      if (created_before) {
        results = results.filter(c => c.created_at && c.created_at <= created_before);
      }

      return results;
    },

    async create(data) {
      const response = await client.post('/customers', data);
      return response.data;
    },

    async update(id, data) {
      const response = await client.put(`/customers/${id}`, data);
      return response.data;
    },
  };
}
