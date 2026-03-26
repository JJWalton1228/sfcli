import { fetchAll, fetchPage } from '../utils/paginator.js';
import { SF_PAGE_SIZE } from './constants.js';

export function createTechniciansApi(client) {
  return {
    async list(params = {}, options = {}) {
      if (options.all) return fetchAll(client, '/techs', params);
      if (options.limit) {
        return (await fetchAll(client, '/techs', params, {
          maxPages: Math.ceil(options.limit / SF_PAGE_SIZE),
          showProgress: false,
        })).slice(0, options.limit);
      }
      const result = await fetchPage(client, '/techs', params);
      return result.items;
    },

    async get(id) {
      const response = await client.get(`/techs/${id}`);
      return response.data;
    },

    async search(params = {}) {
      const { q, ...rest } = params;
      const all = await fetchAll(client, '/techs', rest);
      if (!q) return all;
      const term = q.toLowerCase();
      return all.filter(t =>
        t.first_name?.toLowerCase().includes(term) ||
        t.last_name?.toLowerCase().includes(term) ||
        t.email?.toLowerCase().includes(term)
      );
    },
  };
}
