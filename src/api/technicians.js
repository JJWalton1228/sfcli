import { fetchAll, fetchPage } from '../utils/paginator.js';

export function createTechniciansApi(client) {
  return {
    async list(params = {}, options = {}) {
      if (options.all) return fetchAll(client, '/technicians', params);
      if (options.limit) {
        const result = await fetchPage(client, '/technicians', params, { perPage: options.limit });
        return result.items;
      }
      const result = await fetchPage(client, '/technicians', params);
      return result.items;
    },

    async get(id) {
      const response = await client.get(`/technicians/${id}`);
      return response.data;
    },
  };
}
