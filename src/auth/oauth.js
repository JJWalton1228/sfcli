import axios from 'axios';
import { getLogger } from '../utils/logger.js';

const OAUTH_URL = 'https://api.servicefusion.com/oauth/access_token';

/**
 * Exchange client credentials for an access token.
 */
export async function getToken(clientId, clientSecret) {
  const logger = getLogger();
  logger.debug(`OAuth: requesting token with client_credentials grant`);

  const response = await axios.post(OAUTH_URL, {
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  }, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
  });

  logger.debug(`OAuth: token received, expires_in=${response.data.expires_in}`);
  return response.data;
}

/**
 * Refresh an access token.
 */
export async function refreshToken(refreshTokenValue) {
  const logger = getLogger();
  logger.debug('OAuth: refreshing token');

  const response = await axios.post(OAUTH_URL, {
    grant_type: 'refresh_token',
    refresh_token: refreshTokenValue,
  }, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
  });

  logger.debug(`OAuth: token refreshed, expires_in=${response.data.expires_in}`);
  return response.data;
}
