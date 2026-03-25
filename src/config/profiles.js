import { getConfig } from './index.js';

/**
 * List all saved profile names.
 */
export function listProfiles() {
  const config = getConfig();
  const profiles = config.get('profiles') || {};
  const defaultProfile = config.get('default_profile') || 'default';
  return Object.keys(profiles).map((name) => ({
    name,
    active: name === defaultProfile,
    base_url: profiles[name].base_url || 'https://api.servicefusion.com/v1',
  }));
}

/**
 * Add or update a profile.
 */
export function saveProfile(name, { client_id, client_secret, base_url }) {
  const config = getConfig();
  const profiles = config.get('profiles') || {};
  profiles[name] = {
    client_id,
    client_secret,
    base_url: base_url || 'https://api.servicefusion.com/v1',
  };
  config.set('profiles', profiles);
}

/**
 * Delete a profile.
 */
export function deleteProfile(name) {
  const config = getConfig();
  const profiles = config.get('profiles') || {};
  delete profiles[name];
  config.set('profiles', profiles);
}

/**
 * Set the active profile.
 */
export function switchProfile(name) {
  const config = getConfig();
  const profiles = config.get('profiles') || {};
  if (!profiles[name]) {
    throw new Error(`Profile "${name}" does not exist. Run 'sfcli auth add-profile ${name}' first.`);
  }
  config.set('default_profile', name);
}

/**
 * Check if a profile exists.
 */
export function profileExists(name) {
  const config = getConfig();
  const profiles = config.get('profiles') || {};
  return name in profiles;
}
