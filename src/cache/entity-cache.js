import { decideStrategy } from './decide-strategy.js';
import { fetchAll } from '../utils/paginator.js';
import { flattenCustomer } from '../api/customers.js';
import { getLogger } from '../utils/logger.js';

export const ENTITIES = ['customers', 'jobs', 'estimates', 'invoices', 'techs', 'equipment'];

/**
 * Private fetcher table: entity → async (client, db) → items[].
 * Absorbs the per-entity fetch knowledge that used to live in refreshers.js.
 * This slice only lands the customers entry; other entities migrate in later slices.
 */
const FETCHERS = {
  customers: async (client) => {
    const raw = await fetchAll(client, '/customers', {
      expand: 'contacts,contacts.phones,contacts.emails,locations',
    }, { maxPages: 10000 });
    return raw.map(c => ({
      ...flattenCustomer(c),
      contacts: c.contacts,
      locations: c.locations,
    }));
  },
};

/**
 * Create an entity-cache instance. All dependencies are injectable for testing.
 *
 * @param {Object} [deps]
 * @param {Function} [deps.cacheFactory] - () => cache instance (default: real SQLite cache)
 * @param {Function} [deps.clientFactory] - () => SF client (lazy; called only when a fetch is needed)
 * @param {Function} [deps.now] - clock function (default: Date.now)
 */
export function createEntityCache({ cacheFactory, clientFactory, now = Date.now } = {}) {
  const logger = getLogger();

  if (!cacheFactory) throw new Error('cacheFactory is required');

  // In-flight background refreshes. Awaitable via pendingRefreshes() so tests
  // don't depend on timers and callers can shut down gracefully.
  const pending = new Set();

  function trackRefresh(promise) {
    pending.add(promise);
    promise.finally(() => pending.delete(promise));
    return promise;
  }

  return {
    ENTITIES,

    /**
     * Fetch filtered entity data, using the cache when possible.
     * Opens and closes its own db handle. For SWR background refresh, a second
     * short-lived db handle is opened inside the background promise — the
     * foreground handle is closed as soon as the synchronous search returns.
     */
    async findCached(entity, filters = {}, opts = {}) {
      assertEntity(entity);
      const db = cacheFactory();
      try {
        const mode = opts.noCache ? 'bypass' : (opts.mode || 'auto');
        const status = db.status(entity);
        const action = decideStrategy({ status, mode, now: now() });

        if (action === 'use-cache') {
          return db.search(entity, filters);
        }

        if (action === 'fetch-or-fail') {
          // No usable cache — any error bubbles up
          const client = clientFactory();
          const items = await FETCHERS[entity](client, db);
          db.putMany(entity, items);
          return db.search(entity, filters);
        }

        if (action === 'fetch-blocking') {
          // Stale cache exists — try fetch, fall back to stale on failure
          try {
            const client = clientFactory();
            const items = await FETCHERS[entity](client, db);
            db.putMany(entity, items);
            return db.search(entity, filters);
          } catch (err) {
            logger.debug(`Blocking fetch failed for ${entity}, using stale cache: ${err.message}`);
            return db.search(entity, filters);
          }
        }

        if (action === 'revalidate-bg') {
          // Snapshot stale items to return immediately
          const stale = db.search(entity, filters);
          // Schedule background refresh on its own db handle
          trackRefresh((async () => {
            const bgDb = cacheFactory();
            try {
              const client = clientFactory();
              const items = await FETCHERS[entity](client, bgDb);
              bgDb.putMany(entity, items);
            } catch (err) {
              logger.debug(`Background refresh failed for ${entity}: ${err.message}`);
            } finally {
              bgDb.close();
            }
          })());
          return stale;
        }

        throw new Error(`Unhandled action: ${action}`);
      } finally {
        db.close();
      }
    },

    /**
     * Force a blocking refresh of an entity. Returns the number of records cached.
     * Used by `sfcli cache refresh` and the post-sync refresh loop.
     */
    async refreshCached(entity, opts = {}) {
      assertEntity(entity);
      const db = cacheFactory();
      try {
        return await refreshInternal(entity, db, clientFactory, opts);
      } finally {
        db.close();
      }
    },

    /**
     * Run a caller-supplied async function with a scoped ctx that holds a
     * single db handle plus a refresh helper bound to it. Used by the
     * post-sync refresh loop (many entities, one handle) and the `ask` command
     * (schema introspection + query on the same handle).
     */
    async withCache(fn) {
      const db = cacheFactory();
      try {
        const ctx = {
          db,
          refresh: (entity, opts = {}) => refreshInternal(entity, db, clientFactory, opts),
        };
        return await fn(ctx);
      } finally {
        db.close();
      }
    },

    /**
     * Await all in-flight background refreshes. Used by tests and by graceful
     * CLI shutdown to avoid dropping background work.
     */
    async pendingRefreshes() {
      await Promise.allSettled([...pending]);
    },
  };
}

async function refreshInternal(entity, db, clientFactory, _opts) {
  const client = clientFactory();
  const items = await FETCHERS[entity](client, db);
  db.putMany(entity, items);
  return items.length;
}

function assertEntity(entity) {
  if (!ENTITIES.includes(entity)) {
    throw new Error(`Unknown entity: ${entity}. Valid: ${ENTITIES.join(', ')}`);
  }
}
