import { createCipheriv, createDecipheriv, scryptSync, randomBytes } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { hostname, userInfo } from 'os';
import { getConfigDir } from '../config/index.js';

const ALGORITHM = 'aes-256-gcm';
const TOKENS_FILE = 'tokens.json';

function deriveKey() {
  const seed = `sfcli:${hostname()}:${userInfo().username}`;
  return scryptSync(seed, 'sfcli-salt-v1', 32);
}

function encrypt(plaintext) {
  const key = deriveKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return { iv: iv.toString('hex'), encrypted, tag };
}

function decrypt({ iv, encrypted, tag }) {
  const key = deriveKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function getTokensPath() {
  return join(getConfigDir(), TOKENS_FILE);
}

function readAllTokens() {
  const path = getTokensPath();
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeAllTokens(tokens) {
  const dir = getConfigDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(getTokensPath(), JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

/**
 * Store tokens for a profile (encrypted).
 */
export function storeTokens(profileName, tokenData) {
  const tokens = readAllTokens();
  const payload = JSON.stringify({
    ...tokenData,
    stored_at: Date.now(),
  });
  tokens[profileName] = encrypt(payload);
  writeAllTokens(tokens);
}

/**
 * Retrieve tokens for a profile.
 * @returns {Object|null} Token data or null if not found/expired
 */
export function getTokens(profileName) {
  const tokens = readAllTokens();
  const entry = tokens[profileName];
  if (!entry) return null;
  try {
    return JSON.parse(decrypt(entry));
  } catch {
    return null;
  }
}

/**
 * Remove tokens for a profile.
 */
export function clearTokens(profileName) {
  const tokens = readAllTokens();
  delete tokens[profileName];
  writeAllTokens(tokens);
}

/**
 * Check if the access token is expired or about to expire (within 5 min).
 */
export function isTokenExpired(tokenData) {
  if (!tokenData || !tokenData.stored_at || !tokenData.expires_in) return true;
  const expiresAt = tokenData.stored_at + tokenData.expires_in * 1000;
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  return Date.now() >= expiresAt - bufferMs;
}
