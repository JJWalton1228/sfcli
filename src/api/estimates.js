import { SF_PAGE_SIZE } from './constants.js';
import { fetchAll, fetchPage } from '../utils/paginator.js';

export function createEstimatesApi(client) {
  return {
    async list(params = {}, options = {}) {
      if (options.all) return fetchAll(client, '/estimates', params);
      if (options.limit) {
        return (await fetchAll(client, '/estimates', params, {
          maxPages: Math.ceil(options.limit / SF_PAGE_SIZE),
          showProgress: false,
        })).slice(0, options.limit);
      }
      const result = await fetchPage(client, '/estimates', params);
      return result.items;
    },

    async get(id) {
      const response = await client.get(`/estimates/${id}`, {
        params: { expand: 'products,services,other_charges' },
      });
      return response.data;
    },

    async search(params = {}) {
      const { q, ...rest } = params;
      const all = await fetchAll(client, '/estimates', rest);
      if (!q) return all;
      const term = q.toLowerCase();
      return all.filter(e =>
        e.description?.toLowerCase().includes(term) ||
        e.customer_name?.toLowerCase().includes(term) ||
        String(e.number).includes(term)
      );
    },

    async create(data) {
      const response = await client.post('/estimates', data);
      return response.data;
    },
  };
}
