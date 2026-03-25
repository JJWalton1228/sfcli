import { fetchAll, fetchPage } from '../utils/paginator.js';

export function createEquipmentApi(client) {
  return {
    async list(params = {}, options = {}) {
      if (options.all) return fetchAll(client, '/equipment', params);
      if (options.limit) {
        const result = await fetchPage(client, '/equipment', params, { perPage: options.limit });
        return result.items;
      }
      const result = await fetchPage(client, '/equipment', params);
      return result.items;
    },

    async get(id) {
      const response = await client.get(`/equipment/${id}`);
      return response.data;
    },

    async search(params = {}) {
      return fetchAll(client, '/equipment', params, { showProgress: false });
    },
  };
}
