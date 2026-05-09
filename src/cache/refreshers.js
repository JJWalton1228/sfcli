import { fetchAll } from '../utils/paginator.js';
import { flattenCustomer } from '../api/customers.js';

export const ENTITY_NAMES = ['customers', 'jobs', 'estimates', 'invoices', 'techs', 'equipment'];

/**
 * Refresh a single cache entity from the Service Fusion API.
 * Used by both `sfcli cache refresh` and the post-sync auto-refresh.
 *
 * @param {Object} client - SF HTTP client
 * @param {Object} db - cache instance from createCache()
 * @param {string} entity - one of ENTITY_NAMES
 * @param {Object} [options]
 * @param {Function} [options.onProgress] - optional progress callback (text)
 * @returns {Promise<number>} number of records cached
 */
export async function refreshEntity(client, db, entity, options = {}) {
  if (!ENTITY_NAMES.includes(entity)) {
    throw new Error(`Unknown entity: ${entity}. Valid: ${ENTITY_NAMES.join(', ')}`);
  }

  const { onProgress } = options;

  if (entity === 'customers') {
    const raw = await fetchAll(client, '/customers', {
      expand: 'contacts,contacts.phones,contacts.emails,locations',
    }, { maxPages: 10000 });
    const flattened = raw.map(c => ({
      ...flattenCustomer(c),
      contacts: c.contacts,
      locations: c.locations,
    }));
    db.putMany('customers', flattened);
    return flattened.length;
  }

  if (entity === 'jobs' || entity === 'estimates' || entity === 'invoices' || entity === 'techs') {
    const path = `/${entity}`;
    const items = await fetchAll(client, path, {}, { maxPages: 10000 });
    db.putMany(entity, items);
    return items.length;
  }

  if (entity === 'equipment') {
    // Equipment is nested under customers — iterate cached customers.
    const status = db.status('customers');
    if (status.count === 0) {
      return 0; // Caller should refresh customers first.
    }
    const allCustomers = db.search('customers', {});
    const allEquipment = [];
    let processed = 0;
    for (const cust of allCustomers) {
      processed++;
      if (onProgress && processed % 100 === 0) {
        onProgress(`Refreshing equipment... (${processed}/${allCustomers.length} customers, ${allEquipment.length} items)`);
      }
      try {
        const equipItems = await fetchAll(client, `/customers/${cust.id}/equipment`, {}, { maxPages: 100, showProgress: false });
        allEquipment.push(...equipItems);
      } catch {
        // Some customers may have no equipment — skip silently
      }
    }
    if (allEquipment.length > 0) {
      db.putMany('equipment', allEquipment);
    }
    return allEquipment.length;
  }

  return 0;
}
