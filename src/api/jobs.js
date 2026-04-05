import { SF_PAGE_SIZE } from './constants.js';
import { fetchAll, fetchPage } from '../utils/paginator.js';

export function createJobsApi(client) {
  return {
    async list(params = {}, options = {}) {
      // Build server-side filters where supported
      const queryParams = {};
      const clientFilters = {};

      // filters[status] is the only confirmed server-side filter
      if (params.status) {
        queryParams['filters[status]'] = params.status;
      }

      // These need client-side filtering
      if (params.customer_id) clientFilters.customer_id = parseInt(params.customer_id, 10);
      // Note: technician_id filtering requires expand=techs_assigned which is too slow on large datasets
      // For now, skip technician filtering at list level — use jobs get <id> for tech details
      if (params.scheduled_after) clientFilters.scheduled_after = params.scheduled_after;
      if (params.scheduled_before) clientFilters.scheduled_before = params.scheduled_before;
      if (params.completed_after) clientFilters.completed_after = params.completed_after;
      if (params.completed_before) clientFilters.completed_before = params.completed_before;

      let items;
      const needsClientFilter = Object.keys(clientFilters).length > 0;

      if (options.all || needsClientFilter) {
        items = await fetchAll(client, '/jobs', queryParams, { concurrency: 5 });
      } else if (options.limit) {
        items = await fetchAll(client, '/jobs', queryParams, {
          maxPages: Math.ceil(options.limit / SF_PAGE_SIZE),
          showProgress: false,
        });
        items = items.slice(0, options.limit);
      } else {
        const result = await fetchPage(client, '/jobs', queryParams);
        items = result.items;
      }

      // Apply client-side filters
      if (needsClientFilter) {
        items = filterJobsClientSide(items, clientFilters);
        if (options.limit) items = items.slice(0, options.limit);
      }

      return items;
    },

    async get(id) {
      const response = await client.get(`/jobs/${id}`, {
        params: { expand: 'techs_assigned,equipment,products,services' },
      });
      return response.data;
    },

    async search(params = {}) {
      const { q, ...rest } = params;
      const queryParams = {};

      // Use server-side status filter if provided
      if (rest.status) queryParams['filters[status]'] = rest.status;

      const all = await fetchAll(client, '/jobs', queryParams, { concurrency: 5 });
      let results = all;

      // Client-side text search
      if (q) {
        const term = q.toLowerCase();
        results = results.filter(j =>
          j.description?.toLowerCase().includes(term) ||
          j.customer_name?.toLowerCase().includes(term) ||
          String(j.number).includes(term)
        );
      }

      // Client-side date/ID filters
      results = filterJobsClientSide(results, rest);

      return results;
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

function filterJobsClientSide(items, filters) {
  let results = items;

  if (filters.customer_id) {
    results = results.filter(j => j.customer_id === filters.customer_id);
  }
  if (filters.scheduled_after) {
    results = results.filter(j => j.start_date && j.start_date >= filters.scheduled_after);
  }
  if (filters.scheduled_before) {
    results = results.filter(j => j.start_date && j.start_date <= filters.scheduled_before);
  }
  if (filters.completed_after) {
    results = results.filter(j => j.closed_at && j.closed_at >= filters.completed_after);
  }
  if (filters.completed_before) {
    results = results.filter(j => j.closed_at && j.closed_at <= filters.completed_before);
  }

  return results;
}
