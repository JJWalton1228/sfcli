import chalk from 'chalk';
import { output } from '../utils/output.js';
import { getEntityCache } from '../cache/index.js';

const LOCATION_COLUMNS = ['id', 'customer_name', 'street_1', 'city', 'state', 'zip', 'is_primary'];
const LOCATION_HEADERS = {
  id: 'ID',
  customer_name: 'Customer',
  street_1: 'Street',
  street_2: 'Street 2',
  city: 'City',
  state: 'State',
  zip: 'Zip',
  is_primary: 'Primary',
  customer_id: 'Cust ID',
};

/**
 * Search locations from the cache.
 * Exported for testability — commands wire this to CLI flags.
 * @param {Object} cacheDb - cache instance from createCache()
 * @param {Object} filters - { city, state, zip, street, customer, isPrimary }
 * @returns {Array<Object>}
 */
export function searchLocations(cacheDb, filters = {}) {
  let sql = `
    SELECT l.*, c.customer_name
    FROM cache_locations l
    JOIN cache_customers c ON c.id = l.customer_id
    WHERE 1=1
  `;
  const params = [];

  if (filters.city) {
    sql += ` AND LOWER(l.city) = LOWER(?)`;
    params.push(filters.city);
  }

  if (filters.state) {
    sql += ` AND LOWER(l.state) = LOWER(?)`;
    params.push(filters.state);
  }

  if (filters.zip) {
    sql += ` AND l.zip = ?`;
    params.push(filters.zip);
  }

  if (filters.street) {
    sql += ` AND (LOWER(l.street_1) LIKE LOWER(?) OR LOWER(l.street_2) LIKE LOWER(?))`;
    const term = `%${filters.street}%`;
    params.push(term, term);
  }

  if (filters.customer) {
    // Try as numeric ID first, then name substring
    const asNum = Number(filters.customer);
    if (!isNaN(asNum) && String(asNum) === filters.customer) {
      sql += ` AND l.customer_id = ?`;
      params.push(asNum);
    } else {
      sql += ` AND LOWER(c.customer_name) LIKE LOWER(?)`;
      params.push(`%${filters.customer}%`);
    }
  }

  if (filters.isPrimary !== undefined && filters.isPrimary !== null) {
    sql += ` AND l.is_primary = ?`;
    params.push(filters.isPrimary ? 1 : 0);
  }

  return cacheDb.rawQuery(sql, params);
}

export function registerLocationCommands(program) {
  const locations = program.command('locations').description('Search service locations');

  locations
    .command('list')
    .description('List service locations')
    .option('--city <city>', 'Filter by city')
    .option('--state <state>', 'Filter by state')
    .option('--zip <zip>', 'Filter by zip code')
    .option('--street <text>', 'Filter by street (substring)')
    .option('--customer <name-or-id>', 'Filter by customer name or ID')
    .option('--is-primary', 'Show primary locations only')
    .option('--limit <n>', 'Limit results', parseInt)
    .option('--select <fields>', 'Select specific fields (comma-separated)')
    .action(async (options) => {
      const globalOpts = program.opts();
      try {
        const ec = getEntityCache(globalOpts);
        await ec.withCache(async (ctx) => {
          const filters = {};
          if (options.city) filters.city = options.city;
          if (options.state) filters.state = options.state;
          if (options.zip) filters.zip = options.zip;
          if (options.street) filters.street = options.street;
          if (options.customer) filters.customer = options.customer;
          if (options.isPrimary) filters.isPrimary = true;

          let items = searchLocations(ctx.db, filters);
          if (options.limit) items = items.slice(0, options.limit);

          output(items, {
            format: globalOpts.output,
            sort: globalOpts.sort,
            columns: LOCATION_COLUMNS,
            headers: LOCATION_HEADERS,
            select: options.select,
          });
        });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });
}
