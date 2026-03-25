import { fetchAll, fetchPage } from '../utils/paginator.js';

/**
 * Customers API wrapper.
 */
export function createCustomersApi(client) {
  return {
    /**
     * List customers with pagination.
     * @param {Object} [params] - Query params (page, per_page, q, etc.)
     * @param {Object} [options] - { all: boolean, limit: number }
     */
    async list(params = {}, options = {}) {
      if (options.all) {
        return fetchAll(client, '/customers', params);
      }
      if (options.limit) {
        const result = await fetchPage(client, '/customers', params, { perPage: options.limit });
        return result.items;
      }
      const result = await fetchPage(client, '/customers', params);
      return result.items;
    },

    /**
     * Get a single customer by ID.
     */
    async get(id) {
      const response = await client.get(`/customers/${id}`);
      return response.data;
    },

    /**
     * Search customers.
     * @param {Object} params - Search params (q, phone, email, city, state, etc.)
     */
    async search(params = {}) {
      return fetchAll(client, '/customers', params, { showProgress: false });
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
