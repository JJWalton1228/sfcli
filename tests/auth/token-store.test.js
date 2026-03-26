import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { storeTokens, getTokens, clearTokens, isTokenExpired } from '../../src/auth/token-store.js';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const TEST_PROFILE = '__test_profile__';
const TOKENS_PATH = join(homedir(), '.sfcli', 'tokens.json');

afterEach(() => {
  clearTokens(TEST_PROFILE);
});

describe('token-store', () => {
  it('should encrypt, store, and retrieve tokens', () => {
    const tokenData = {
      access_token: 'test_access_token_123',
      refresh_token: 'test_refresh_token_456',
      expires_in: 3600,
      token_type: 'Bearer',
    };

    storeTokens(TEST_PROFILE, tokenData);
    const retrieved = getTokens(TEST_PROFILE);

    expect(retrieved.access_token).toBe('test_access_token_123');
    expect(retrieved.refresh_token).toBe('test_refresh_token_456');
    expect(retrieved.expires_in).toBe(3600);
    expect(retrieved.stored_at).toBeTypeOf('number');
  });

  it('should return null for nonexistent profile', () => {
    const result = getTokens('__nonexistent__');
    expect(result).toBeNull();
  });

  it('should clear tokens for a profile', () => {
    storeTokens(TEST_PROFILE, { access_token: 'abc', expires_in: 3600 });
    clearTokens(TEST_PROFILE);
    expect(getTokens(TEST_PROFILE)).toBeNull();
  });

  it('should detect expired tokens', () => {
    expect(isTokenExpired(null)).toBe(true);
    expect(isTokenExpired({})).toBe(true);

    // Expired: stored 2 hours ago, expires_in was 1 hour
    expect(isTokenExpired({
      stored_at: Date.now() - 2 * 60 * 60 * 1000,
      expires_in: 3600,
    })).toBe(true);

    // Not expired: stored just now, expires in 1 hour
    expect(isTokenExpired({
      stored_at: Date.now(),
      expires_in: 3600,
    })).toBe(false);

    // Within 5-min buffer: stored 55 min ago, expires_in was 1 hour
    expect(isTokenExpired({
      stored_at: Date.now() - 55 * 60 * 1000,
      expires_in: 3600,
    })).toBe(true);
  });
});
