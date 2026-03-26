import { fetchAll, fetchPage } from '../utils/paginator.js';
import { SF_PAGE_SIZE } from './constants.js';

/**
 * Equipment API wrapper.
 * Equipment is a nested resource under customers: /customers/{id}/equipment
 * There is no top-level /equipment endpoint.
 */
export function createEquipmentApi(client) {
  return {
    /**
     * List equipment for a specific customer.
     * @param {number|string} customerId
     */
    async listForCustomer(customerId, params = {}, options = {}) {
      const path = `/customers/${customerId}/equipment`;
      if (options.all) return fetchAll(client, path, params);
      if (options.limit) {
        return (await fetchAll(client, path, params, {
          maxPages: Math.ceil(options.limit / SF_PAGE_SIZE),
          showProgress: false,
        })).slice(0, options.limit);
      }
      const result = await fetchPage(client, path, params);
      return result.items;
    },

    /**
     * Get a single equipment record.
     * Requires customerId since equipment is nested under customer.
     */
    async get(customerId, equipmentId) {
      const response = await client.get(`/customers/${customerId}/equipment/${equipmentId}`);
      return response.data;
    },

    /**
     * Search equipment across a customer's records.
     */
    async search(customerId, params = {}) {
      const { q, ...rest } = params;
      const all = await fetchAll(client, `/customers/${customerId}/equipment`, rest);
      if (!q) return all;
      const term = q.toLowerCase();
      return all.filter(e =>
        e.type?.toLowerCase().includes(term) ||
        e.make?.toLowerCase().includes(term) ||
        e.model?.toLowerCase().includes(term) ||
        e.serial_number?.toLowerCase().includes(term) ||
        e.location?.toLowerCase().includes(term)
      );
    },
  };
}
