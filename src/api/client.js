import axios from 'axios';
import { getTokens, storeTokens, isTokenExpired } from '../auth/token-store.js';
import { refreshToken } from '../auth/oauth.js';
import { getLogger } from '../utils/logger.js';

/**
 * Create an Axios client for a given profile with auth, retry, and logging interceptors.
 */
export function createClient(profileName, { baseUrl, verbose = false } = {}) {
  const logger = getLogger();

  const client = axios.create({
    baseURL: baseUrl || 'https://api.servicefusion.com/v1',
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
  });

  // --- Request interceptor: attach Bearer token ---
  client.interceptors.request.use(async (config) => {
    let tokenData = getTokens(profileName);

    if (tokenData && isTokenExpired(tokenData) && tokenData.refresh_token) {
      logger.debug('Token near expiry, refreshing...');
      try {
        const newTokenData = await refreshToken(tokenData.refresh_token);
        storeTokens(profileName, newTokenData);
        tokenData = newTokenData;
      } catch (err) {
        logger.debug(`Token refresh failed: ${err.message}`);
      }
    }

    if (tokenData?.access_token) {
      config.headers.Authorization = `Bearer ${tokenData.access_token}`;
    }

    if (verbose) {
      logger.debug(`→ ${config.method?.toUpperCase()} ${config.baseURL}${config.url} ${JSON.stringify(config.params || {})}`);
    }

    return config;
  });

  // --- Response interceptor: retry on 401/429 ---
  let isRefreshing = false;

  client.interceptors.response.use(
    (response) => {
      if (verbose) {
        logger.debug(`← ${response.status} ${response.config.url} (${response.data?.length ?? '?'} items)`);
      }
      return response;
    },
    async (error) => {
      const config = error.config;
      const status = error.response?.status;

      // 401 — try refreshing token once
      if (status === 401 && !config._retried401 && !isRefreshing) {
        config._retried401 = true;
        isRefreshing = true;
        try {
          const tokenData = getTokens(profileName);
          if (tokenData?.refresh_token) {
            const newTokenData = await refreshToken(tokenData.refresh_token);
            storeTokens(profileName, newTokenData);
            config.headers.Authorization = `Bearer ${newTokenData.access_token}`;
            return client(config);
          }
        } catch (refreshErr) {
          logger.debug(`401 refresh failed: ${refreshErr.message}`);
        } finally {
          isRefreshing = false;
        }
        throw new Error('Authentication expired. Run `sfcli auth login` to re-authenticate.');
      }

      // 429 — exponential backoff with jitter
      if (status === 429) {
        const retryCount = config._retryCount || 0;
        if (retryCount < 3) {
          config._retryCount = retryCount + 1;
          const retryAfter = error.response?.headers?.['retry-after'];
          const baseDelay = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, retryCount) * 1000;
          const jitter = Math.random() * 500;
          const delay = baseDelay + jitter;
          logger.debug(`Rate limited. Retrying in ${Math.round(delay)}ms (attempt ${config._retryCount}/3)`);
          await sleep(delay);
          return client(config);
        }
        throw new Error('Rate limited. Maximum retries exceeded. Try again later.');
      }

      // Network errors — retry with backoff
      if (!error.response && !config._retryNetwork) {
        const retryCount = config._networkRetryCount || 0;
        if (retryCount < 3) {
          config._networkRetryCount = retryCount + 1;
          const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 500;
          logger.debug(`Network error. Retrying in ${Math.round(delay)}ms`);
          await sleep(delay);
          return client(config);
        }
      }

      // User-friendly error messages
      if (status === 403) {
        throw new Error('Insufficient permissions. Ensure your API credentials have the required scope.');
      }
      if (status === 404) {
        throw new Error('Resource not found.');
      }
      if (status >= 500) {
        throw new Error('Service Fusion server error. Try again later.');
      }

      throw error;
    }
  );

  return client;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
