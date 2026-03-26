import { SF_PAGE_SIZE } from './constants.js';
import { fetchAll, fetchPage } from '../utils/paginator.js';

export function createInvoicesApi(client) {
  return {
    async list(params = {}, options = {}) {
      if (options.all) return fetchAll(client, '/invoices', params);
      if (options.limit) {
        return (await fetchAll(client, '/invoices', params, {
          maxPages: Math.ceil(options.limit / SF_PAGE_SIZE),
          showProgress: false,
        })).slice(0, options.limit);
      }
      const result = await fetchPage(client, '/invoices', params);
      return result.items;
    },

    async get(id) {
      const response = await client.get(`/invoices/${id}`);
      return response.data;
    },

    async search(params = {}) {
      const { q, ...rest } = params;
      const all = await fetchAll(client, '/invoices', rest);
      if (!q) return all;
      const term = q.toLowerCase();
      return all.filter(inv =>
        String(inv.number).includes(term) ||
        inv.customer?.toLowerCase().includes(term)
      );
    },
  };
}
