import { createSpinner } from './spinner.js';

/**
 * Extract items and pagination meta from an API response.
 * Service Fusion API returns: { items: [...], _expandable: [...], _meta: { totalCount, pageCount, currentPage, perPage } }
 */
function parseResponse(data) {
  const items = Array.isArray(data) ? data : data.items ?? data.data ?? [];
  const meta = data._meta ?? {};
  return {
    items,
    totalCount: meta.totalCount ?? data.total ?? null,
    pageCount: meta.pageCount ?? data.total_pages ?? data.last_page ?? null,
    currentPage: meta.currentPage ?? data.current_page ?? data.page ?? null,
    perPage: meta.perPage ?? data.per_page ?? null,
  };
}

/**
 * Fetch all pages from a paginated API endpoint.
 * @param {import('axios').AxiosInstance} client
 * @param {string} path - API path (e.g. '/customers')
 * @param {Object} [params] - Query parameters
 * @param {Object} [options]
 * @param {number} [options.maxPages=100]
 * @param {boolean} [options.showProgress=true]
 * @returns {Promise<Array>}
 */
export async function fetchAll(client, path, params = {}, options = {}) {
  const { maxPages = 100, showProgress = true } = options;
  const allResults = [];
  let page = 1;
  let totalPages = null;
  const spinner = showProgress ? createSpinner('Fetching...') : null;

  if (spinner) spinner.start();

  try {
    while (page <= maxPages) {
      const response = await client.get(path, {
        params: { ...params, page },
      });

      const parsed = parseResponse(response.data);
      allResults.push(...parsed.items);

      if (totalPages === null && parsed.pageCount) {
        totalPages = parsed.pageCount;
      }

      if (spinner) {
        spinner.text = `Fetching page ${page}${totalPages ? ` of ${totalPages}` : ''}... (${allResults.length} records)`;
      }

      // Stop if no items returned or we've reached the last page
      if (parsed.items.length === 0 || (totalPages !== null && page >= totalPages)) {
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
export async function fetchPage(client, path, params = {}, { page = 1 } = {}) {
  const response = await client.get(path, {
    params: { ...params, page },
  });
  const parsed = parseResponse(response.data);
  return {
    items: parsed.items,
    total: parsed.totalCount,
    page: parsed.currentPage ?? page,
    totalPages: parsed.pageCount,
  };
}
