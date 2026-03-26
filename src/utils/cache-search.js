import { getLogger } from './logger.js';

/**
 * Create a cache-aware search function for an entity.
 *
 * Strategy:
 * 1. If cache is fresh → search cache only (instant)
 * 2. If cache is stale → fetch from API, update cache, then search
 * 3. If API fails and stale cache exists → use stale cache with warning
 * 4. If API fails and no cache → throw
 *
 * @param {Object} cache - Cache instance from createCache()
 * @param {string} entity - Entity name (customers, jobs, etc.)
 * @param {Function} apiFetcher - async () => items[] — fetches all records from API
 * @returns {Function} async (filters, options?) => items[]
 */
export function createCacheAwareSearch(cache, entity, apiFetcher) {
  const logger = getLogger();

  return async function search(filters = {}, options = {}) {
    const status = cache.status(entity);

    // Bypass cache if requested
    if (options.noCache) {
      const items = await apiFetcher();
      cache.putMany(entity, items);
      return cache.search(entity, filters);
    }

    // Fresh cache — use it directly
    if (!status.stale && status.count > 0) {
      return cache.search(entity, filters);
    }

    // Stale or empty — try API
    try {
      const items = await apiFetcher();
      cache.putMany(entity, items);
      return cache.search(entity, filters);
    } catch (err) {
      // API failed — fall back to stale cache if available
      if (status.count > 0) {
        logger.debug(`API fetch failed for ${entity}, using stale cache: ${err.message}`);
        return cache.search(entity, filters);
      }
      // No cache at all — propagate error
      throw err;
    }
  };
}
