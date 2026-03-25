import { fetchAll, fetchPage } from '../utils/paginator.js';

export function createJobsApi(client) {
  return {
    async list(params = {}, options = {}) {
      if (options.all) return fetchAll(client, '/jobs', params);
      if (options.limit) {
        const result = await fetchPage(client, '/jobs', params, { perPage: options.limit });
        return result.items;
      }
      const result = await fetchPage(client, '/jobs', params);
      return result.items;
    },

    async get(id) {
      const response = await client.get(`/jobs/${id}`);
      return response.data;
    },

    async search(params = {}) {
      return fetchAll(client, '/jobs', params, { showProgress: false });
    },

    async create(data) {
      const response = await client.post('/jobs', data);
      return response.data;
    },

    async update(id, data) {
      const response = await client.put(`/jobs/${id}`, data);
      return response.data;
    },
  };
}
