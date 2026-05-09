import { createCache } from '../utils/cache.js';
import { createClient } from '../api/client.js';
import { getActiveProfileName, getProfileConfig } from '../config/index.js';
import { createEntityCache } from './entity-cache.js';

/**
 * Default singleton for command use. Wires the real SQLite cache and a lazy
 * SF client built from the currently-active profile. Tests should call
 * `createEntityCache` directly with their own dependency stubs instead.
 */
let _singleton = null;
let _clientFactoryOverride = null;

function defaultClientFactory(globalOpts = {}) {
  const profileName = getActiveProfileName(globalOpts.profile);
  const profileConfig = getProfileConfig(profileName);
  return createClient(profileName, {
    baseUrl: profileConfig.base_url,
    verbose: globalOpts.verbose,
  });
}

/**
 * Get the default entity-cache instance, optionally bound to the current
 * command's global options. Construction is lazy and idempotent per process.
 */
export function getEntityCache(globalOpts = {}) {
  if (_singleton) return _singleton;
  _singleton = createEntityCache({
    cacheFactory: () => createCache(),
    clientFactory: _clientFactoryOverride || (() => defaultClientFactory(globalOpts)),
  });
  return _singleton;
}

/**
 * Test seam — reset the singleton and optionally override the client factory.
 */
export function __resetEntityCacheForTests(clientFactoryOverride) {
  _singleton = null;
  _clientFactoryOverride = clientFactoryOverride ?? null;
}

export { createEntityCache } from './entity-cache.js';
export { ENTITIES } from './entity-cache.js';
