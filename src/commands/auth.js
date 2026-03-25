import chalk from 'chalk';
import inquirer from 'inquirer';
import { getToken } from '../auth/oauth.js';
import { storeTokens, getTokens, clearTokens } from '../auth/token-store.js';
import { getProfileConfig, getActiveProfileName } from '../config/index.js';
import { saveProfile, listProfiles, switchProfile } from '../config/profiles.js';

export function registerAuthCommands(program) {
  const auth = program.command('auth').description('Authentication management');

  // --- login ---
  auth
    .command('login')
    .description('Authenticate with Service Fusion')
    .option('--client-id <id>', 'OAuth client ID')
    .option('--client-secret <secret>', 'OAuth client secret')
    .action(async (options) => {
      const globalOpts = program.opts();
      const profileName = getActiveProfileName(globalOpts.profile);

      let clientId = options.clientId;
      let clientSecret = options.clientSecret;

      if (!clientId || !clientSecret) {
        // Try from profile/env config first
        const profileConfig = getProfileConfig(profileName);
        clientId = clientId || profileConfig.client_id;
        clientSecret = clientSecret || profileConfig.client_secret;
      }

      if (!clientId || !clientSecret) {
        // Interactive prompt
        const answers = await inquirer.prompt([
          { type: 'input', name: 'clientId', message: 'Client ID:', when: !clientId },
          { type: 'password', name: 'clientSecret', message: 'Client Secret:', when: !clientSecret },
        ]);
        clientId = clientId || answers.clientId;
        clientSecret = clientSecret || answers.clientSecret;
      }

      try {
        console.log(chalk.dim('Authenticating with Service Fusion...'));
        const tokenData = await getToken(clientId, clientSecret);
        storeTokens(profileName, tokenData);

        // Also save credentials to profile for future use
        saveProfile(profileName, {
          client_id: clientId,
          client_secret: clientSecret,
        });

        console.log(chalk.green(`Authenticated successfully as profile "${profileName}".`));
        console.log(chalk.dim(`Token expires in ${Math.round(tokenData.expires_in / 60)} minutes.`));
      } catch (err) {
        const msg = err.response?.data?.message || err.response?.data?.error || err.message;
        console.error(chalk.red(`Authentication failed: ${msg}`));
        process.exitCode = 1;
      }
    });

  // --- logout ---
  auth
    .command('logout')
    .description('Clear stored tokens')
    .action(() => {
      const globalOpts = program.opts();
      const profileName = getActiveProfileName(globalOpts.profile);
      clearTokens(profileName);
      console.log(chalk.yellow(`Tokens cleared for profile "${profileName}".`));
    });

  // --- whoami ---
  auth
    .command('whoami')
    .description('Show current auth info')
    .action(() => {
      const globalOpts = program.opts();
      const profileName = getActiveProfileName(globalOpts.profile);
      const profileConfig = getProfileConfig(profileName);
      const tokenData = getTokens(profileName);

      console.log(chalk.bold('Profile:'), profileName);
      console.log(chalk.bold('Base URL:'), profileConfig.base_url || 'https://api.servicefusion.com/v1');

      if (tokenData) {
        const expiresAt = new Date(tokenData.stored_at + tokenData.expires_in * 1000);
        const isExpired = Date.now() >= expiresAt.getTime();
        console.log(chalk.bold('Token:'), isExpired ? chalk.red('EXPIRED') : chalk.green('Active'));
        console.log(chalk.bold('Expires:'), expiresAt.toLocaleString());
      } else {
        console.log(chalk.bold('Token:'), chalk.red('Not authenticated'));
        console.log(chalk.dim('Run `sfcli auth login` to authenticate.'));
      }
    });

  // --- profiles ---
  auth
    .command('profiles')
    .description('List saved profiles')
    .action(() => {
      const profiles = listProfiles();
      if (profiles.length === 0) {
        console.log(chalk.yellow('No profiles configured. Run `sfcli auth login` to create one.'));
        return;
      }
      for (const p of profiles) {
        const marker = p.active ? chalk.green(' (active)') : '';
        console.log(`  ${chalk.bold(p.name)}${marker} — ${p.base_url}`);
      }
    });

  // --- add-profile ---
  auth
    .command('add-profile <name>')
    .description('Add a new named profile')
    .action(async (name) => {
      const answers = await inquirer.prompt([
        { type: 'input', name: 'clientId', message: 'Client ID:' },
        { type: 'password', name: 'clientSecret', message: 'Client Secret:' },
        { type: 'input', name: 'baseUrl', message: 'Base URL:', default: 'https://api.servicefusion.com/v1' },
      ]);

      saveProfile(name, {
        client_id: answers.clientId,
        client_secret: answers.clientSecret,
        base_url: answers.baseUrl,
      });

      console.log(chalk.green(`Profile "${name}" saved. Use --profile ${name} or run 'sfcli auth switch ${name}'.`));
    });

  // --- switch ---
  auth
    .command('switch <name>')
    .description('Switch active profile')
    .action((name) => {
      try {
        switchProfile(name);
        console.log(chalk.green(`Switched to profile "${name}".`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });
}
