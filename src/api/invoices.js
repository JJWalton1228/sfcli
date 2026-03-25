import { fetchAll, fetchPage } from '../utils/paginator.js';

export function createInvoicesApi(client) {
  return {
    async list(params = {}, options = {}) {
      if (options.all) return fetchAll(client, '/invoices', params);
      if (options.limit) {
        const result = await fetchPage(client, '/invoices', params, { perPage: options.limit });
        return result.items;
      }
      const result = await fetchPage(client, '/invoices', params);
      return result.items;
    },

    async get(id) {
      const response = await client.get(`/invoices/${id}`);
      return response.data;
    },
  };
}
