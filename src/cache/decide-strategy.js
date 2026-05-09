/**
 * Pure SWR strategy decision function.
 *
 * Given the current cache status and caller's mode, returns a tagged action
 * describing how the query should be resolved. No I/O, no wall clock — `now`
 * is injected so tests are fully deterministic.
 *
 * Actions:
 *   - 'use-cache'     — serve from cache, no fetch
 *   - 'revalidate-bg' — serve from cache now, refresh in background (SWR)
 *   - 'fetch-blocking'— fetch before returning; fall back to stale cache if API fails
 *   - 'fetch-or-fail' — fetch before returning; throw on failure (no usable cache)
 *
 * Modes:
 *   - 'auto'   — serve fresh, blocking-refresh stale
 *   - 'swr'    — serve fresh, background-refresh stale with items
 *   - 'fresh'  — like auto (explicit opt-out of any future SWR default)
 *   - 'bypass' — always fetch-or-fail (honors --no-cache)
 *
 * @param {Object} params
 * @param {{stale: boolean, count: number, refreshedAt?: number}} params.status
 * @param {'auto'|'swr'|'fresh'|'bypass'} params.mode
 * @param {number} params.now - current time in ms (injectable)
 * @param {number} [params.ttlSeconds] - optional TTL override; if set with refreshedAt, recomputes stale
 * @returns {'use-cache'|'revalidate-bg'|'fetch-blocking'|'fetch-or-fail'}
 */
export function decideStrategy({ status, mode, now, ttlSeconds }) {
  if (mode === 'bypass') return 'fetch-or-fail';
  if (status.count === 0) return 'fetch-or-fail';

  const stale = isStale(status, now, ttlSeconds);

  if (!stale) return 'use-cache';
  if (mode === 'swr') return 'revalidate-bg';
  return 'fetch-blocking';
}

function isStale(status, now, ttlSeconds) {
  if (ttlSeconds != null && status.refreshedAt != null) {
    return (now - status.refreshedAt) > ttlSeconds * 1000;
  }
  return !!status.stale;
}
