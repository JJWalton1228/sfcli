import chalk from 'chalk';
import { output } from '../utils/output.js';
import { getEntityCache } from '../cache/index.js';

const CONTACT_COLUMNS = ['id', 'customer_name', 'first_name', 'last_name', 'phone', 'email'];
const CONTACT_HEADERS = {
  id: 'ID',
  customer_name: 'Customer',
  first_name: 'First Name',
  last_name: 'Last Name',
  phone: 'Phone',
  email: 'Email',
  is_primary: 'Primary',
  customer_id: 'Cust ID',
};

/**
 * Search contacts from the cache, joining phones and emails.
 * @param {Object} cacheDb - cache instance
 * @param {Object} filters - { customer, name, phone, email }
 * @returns {Array<Object>}
 */
export function searchContacts(cacheDb, filters = {}) {
  let sql = `
    SELECT c.id, c.customer_id, c.first_name, c.last_name, c.is_primary,
           cust.customer_name,
           (SELECT p.phone FROM cache_phones p WHERE p.contact_id = c.id LIMIT 1) as phone,
           (SELECT e.email FROM cache_emails e WHERE e.contact_id = c.id LIMIT 1) as email
    FROM cache_contacts c
    JOIN cache_customers cust ON cust.id = c.customer_id
    WHERE 1=1
  `;
  const params = [];

  if (filters.customer) {
    const asNum = Number(filters.customer);
    if (!isNaN(asNum) && String(asNum) === filters.customer) {
      sql += ` AND c.customer_id = ?`;
      params.push(asNum);
    } else {
      sql += ` AND LOWER(cust.customer_name) LIKE LOWER(?)`;
      params.push(`%${filters.customer}%`);
    }
  }

  if (filters.name) {
    sql += ` AND (LOWER(c.first_name) LIKE LOWER(?) OR LOWER(c.last_name) LIKE LOWER(?))`;
    params.push(`%${filters.name}%`, `%${filters.name}%`);
  }

  if (filters.phone) {
    const normalized = filters.phone.replace(/\D/g, '');
    sql += ` AND EXISTS (
      SELECT 1 FROM cache_phones p
      WHERE p.contact_id = c.id
      AND REPLACE(REPLACE(REPLACE(REPLACE(p.phone, '-', ''), '(', ''), ')', ''), ' ', '') LIKE ?
    )`;
    params.push(`%${normalized}%`);
  }

  if (filters.email) {
    sql += ` AND EXISTS (
      SELECT 1 FROM cache_emails e
      WHERE e.contact_id = c.id
      AND LOWER(e.email) = LOWER(?)
    )`;
    params.push(filters.email);
  }

  return cacheDb.rawQuery(sql, params);
}

export function registerContactCommands(program) {
  const contacts = program.command('contacts').description('Search contacts');

  contacts
    .command('list')
    .description('List contacts')
    .option('--customer <name-or-id>', 'Filter by customer name or ID')
    .option('--name <text>', 'Filter by contact name')
    .option('--phone <number>', 'Filter by phone number')
    .option('--email <text>', 'Filter by email')
    .option('--limit <n>', 'Limit results', parseInt)
    .option('--select <fields>', 'Select specific fields (comma-separated)')
    .action(async (options) => {
      const globalOpts = program.opts();
      try {
        const ec = getEntityCache(globalOpts);
        await ec.withCache(async (ctx) => {
          const filters = {};
          if (options.customer) filters.customer = options.customer;
          if (options.name) filters.name = options.name;
          if (options.phone) filters.phone = options.phone;
          if (options.email) filters.email = options.email;

          let items = searchContacts(ctx.db, filters);
          if (options.limit) items = items.slice(0, options.limit);

          output(items, {
            format: globalOpts.output,
            sort: globalOpts.sort,
            columns: CONTACT_COLUMNS,
            headers: CONTACT_HEADERS,
            select: options.select,
          });
        });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });
}
