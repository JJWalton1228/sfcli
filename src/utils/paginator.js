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
 * @param {number} [options.concurrency=1] - Number of pages to fetch in parallel
 * @param {boolean} [options.showProgress=true]
 * @returns {Promise<Array>}
 */
export async function fetchAll(client, path, params = {}, options = {}) {
  const { maxPages = 100, concurrency = 1, showProgress = true } = options;

  if (concurrency > 1) {
    return fetchAllConcurrent(client, path, params, { maxPages, concurrency, showProgress });
  }

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
 * Fetch pages concurrently in batches.
 * Fetches page 1 first to discover totalPages, then fetches remaining pages
 * in batches of `concurrency` size.
 */
async function fetchAllConcurrent(client, path, params, { maxPages, concurrency, showProgress }) {
  const spinner = showProgress ? createSpinner('Fetching...') : null;
  if (spinner) spinner.start();

  try {
    // Fetch page 1 to discover totalPages
    const firstResponse = await client.get(path, { params: { ...params, page: 1 } });
    const firstParsed = parseResponse(firstResponse.data);

    if (firstParsed.items.length === 0) return [];

    const totalPages = Math.min(firstParsed.pageCount ?? maxPages, maxPages);
    const resultsByPage = new Array(totalPages);
    resultsByPage[0] = firstParsed.items;
    let fetched = firstParsed.items.length;

    if (spinner) {
      spinner.text = `Fetching page 1 of ${totalPages}... (${fetched} records)`;
    }

    if (totalPages <= 1) return firstParsed.items;

    // Fetch remaining pages in concurrent batches
    const remaining = [];
    for (let p = 2; p <= totalPages; p++) {
      remaining.push(p);
    }

    for (let i = 0; i < remaining.length; i += concurrency) {
      const batch = remaining.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async (p) => {
          const response = await client.get(path, { params: { ...params, page: p } });
          return { page: p, parsed: parseResponse(response.data) };
        })
      );

      for (const { page, parsed } of results) {
        resultsByPage[page - 1] = parsed.items;
        fetched += parsed.items.length;
      }

      if (spinner) {
        const lastPage = batch[batch.length - 1];
        spinner.text = `Fetching page ${lastPage} of ${totalPages}... (${fetched} records)`;
      }
    }

    return resultsByPage.flat();
  } finally {
    if (spinner) spinner.stop();
  }
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
