import { fetchAll, fetchPage } from '../utils/paginator.js';

export function createEstimatesApi(client) {
  return {
    async list(params = {}, options = {}) {
      if (options.all) return fetchAll(client, '/estimates', params);
      if (options.limit) {
        const result = await fetchPage(client, '/estimates', params, { perPage: options.limit });
        return result.items;
      }
      const result = await fetchPage(client, '/estimates', params);
      return result.items;
    },

    async get(id) {
      const response = await client.get(`/estimates/${id}`);
      return response.data;
    },

    async search(params = {}) {
      return fetchAll(client, '/estimates', params, { showProgress: false });
    },

    async create(data) {
      const response = await client.post('/estimates', data);
      return response.data;
    },
  };
}
