import { createSpinner } from './spinner.js';

/**
 * Fetch all pages from a paginated API endpoint.
 * @param {import('axios').AxiosInstance} client
 * @param {string} path - API path (e.g. '/customers')
 * @param {Object} [params] - Query parameters
 * @param {Object} [options]
 * @param {number} [options.perPage=50]
 * @param {number} [options.maxPages=100]
 * @param {boolean} [options.showProgress=true]
 * @returns {Promise<Array>}
 */
export async function fetchAll(client, path, params = {}, options = {}) {
  const { perPage = 50, maxPages = 100, showProgress = true } = options;
  const allResults = [];
  let page = 1;
  let totalPages = null;
  const spinner = showProgress ? createSpinner('Fetching...') : null;

  if (spinner) spinner.start();

  try {
    while (page <= maxPages) {
      const response = await client.get(path, {
        params: { ...params, page, per_page: perPage },
      });

      const data = response.data;
      const items = Array.isArray(data) ? data : data.data ?? data.items ?? [];
      allResults.push(...items);

      // Try to determine total pages from response
      if (totalPages === null) {
        totalPages = data.total_pages ?? data.last_page ?? Math.ceil((data.total ?? items.length) / perPage);
      }

      if (spinner) {
        spinner.text = `Fetching page ${page}${totalPages ? ` of ${totalPages}` : ''}... (${allResults.length} records)`;
      }

      if (items.length < perPage || page >= (totalPages ?? page)) {
        break;
      }

      page++;
    }
  } finally {
    if (spinner) spinner.stop();
  }

  return allResults;
}

/**
 * Fetch a single page.
 */
export async function fetchPage(client, path, params = {}, { page = 1, perPage = 50 } = {}) {
  const response = await client.get(path, {
    params: { ...params, page, per_page: perPage },
  });
  const data = response.data;
  return {
    items: Array.isArray(data) ? data : data.data ?? data.items ?? [],
    total: data.total ?? null,
    page: data.page ?? data.current_page ?? page,
    totalPages: data.total_pages ?? data.last_page ?? null,
  };
}
