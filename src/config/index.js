import { config as dotenvConfig } from 'dotenv';
import Conf from 'conf';
import { join } from 'path';
import { homedir } from 'os';

dotenvConfig();

const CONFIG_DIR = join(homedir(), '.sfcli');

const store = new Conf({
  projectName: 'sfcli',
  cwd: CONFIG_DIR,
  configName: 'config',
  defaults: {
    default_profile: 'default',
    profiles: {},
    defaults: {
      output_format: 'table',
      page_size: 50,
      max_pages: 100,
      cache_ttl_seconds: 300,
    },
  },
});

export function getConfigDir() {
  return CONFIG_DIR;
}

export function getConfig() {
  return store;
}

/**
 * Get the active profile name from --profile flag or config.
 */
export function getActiveProfileName(cliProfile) {
  return cliProfile || store.get('default_profile') || 'default';
}

/**
 * Get profile config, merging .env values for the default profile.
 */
export function getProfileConfig(profileName) {
  const profiles = store.get('profiles') || {};
  const profile = profiles[profileName] || {};

  // For default profile, merge in .env values as fallback
  if (profileName === 'default') {
    return {
      client_id: profile.client_id || process.env.SF_CLIENT_ID,
      client_secret: profile.client_secret || process.env.SF_CLIENT_SECRET,
      base_url: profile.base_url || process.env.SF_BASE_URL || 'https://api.servicefusion.com/v1',
      ...profile,
    };
  }

  return {
    base_url: 'https://api.servicefusion.com/v1',
    ...profile,
  };
}

export function getDefaults() {
  return store.get('defaults');
}
