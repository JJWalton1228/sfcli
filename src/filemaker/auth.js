import axios from 'axios';
import { getLogger } from '../utils/logger.js';

/**
 * Authenticate with FileMaker Data API and get a session token.
 */
export async function getFmToken({ host, database, username, password, apiVersion = 'vLatest' }) {
  const logger = getLogger();
  const url = `${host}/fmi/data/${apiVersion}/databases/${encodeURIComponent(database)}/sessions`;
  const auth = Buffer.from(`${username}:${password}`).toString('base64');

  logger.debug(`FM Auth: POST ${url}`);

  const response = await axios.post(url, {}, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    timeout: 15000,
  });

  const token = response.data?.response?.token;
  if (!token) throw new Error('FileMaker authentication failed: no token in response');

  logger.debug('FM Auth: token acquired');
  return token;
}

/**
 * Log out / destroy a FileMaker session.
 */
export async function destroyFmToken({ host, database, token, apiVersion = 'vLatest' }) {
  const url = `${host}/fmi/data/${apiVersion}/databases/${encodeURIComponent(database)}/sessions/${token}`;
  try {
    await axios.delete(url, { timeout: 10000 });
  } catch {
    // Ignore logout errors
  }
}
