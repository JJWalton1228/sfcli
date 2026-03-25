import chalk from 'chalk';
import inquirer from 'inquirer';
import { existsSync } from 'fs';
import { join } from 'path';
import { getToken } from '../auth/oauth.js';
import { storeTokens } from '../auth/token-store.js';
import { saveProfile } from '../config/profiles.js';
import { getConfig, getConfigDir } from '../config/index.js';

/**
 * Check if first-run setup is needed and launch wizard if so.
 */
export async function checkFirstRun(program) {
  const configDir = getConfigDir();
  const configPath = join(configDir, 'config.json');
  const tokensPath = join(configDir, 'tokens.json');

  // If config or tokens exist, skip wizard
  if (existsSync(configPath) || existsSync(tokensPath)) return false;

  // Only run wizard for interactive commands (not --help, --version)
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h') || args.includes('-V') || args.includes('--version')) return false;

  console.log(chalk.bold('\n  Welcome to sfcli — Service Fusion CLI\n'));
  console.log(chalk.dim('  No configuration found. Let\'s set things up.\n'));

  const { proceed } = await inquirer.prompt([
    { type: 'confirm', name: 'proceed', message: 'Run setup wizard?', default: true },
  ]);
  if (!proceed) {
    console.log(chalk.dim('  Skipped. Run `sfcli auth login` when ready.\n'));
    return false;
  }

  // Step 1: Service Fusion credentials
  console.log(chalk.bold('\n  Step 1: Service Fusion API Credentials\n'));
  const sfCreds = await inquirer.prompt([
    { type: 'input', name: 'clientId', message: 'Client ID:' },
    { type: 'password', name: 'clientSecret', message: 'Client Secret:' },
  ]);

  console.log(chalk.dim('\n  Authenticating with Service Fusion...'));
  try {
    const tokenData = await getToken(sfCreds.clientId, sfCreds.clientSecret);
    storeTokens('default', tokenData);
    saveProfile('default', {
      client_id: sfCreds.clientId,
      client_secret: sfCreds.clientSecret,
    });
    console.log(chalk.green('  Authenticated successfully.\n'));
  } catch (err) {
    const msg = err.response?.data?.message || err.response?.data?.error || err.message;
    console.error(chalk.red(`  Authentication failed: ${msg}`));
    console.log(chalk.dim('  You can retry later with `sfcli auth login`.\n'));
  }

  // Step 2: FileMaker (optional)
  console.log(chalk.bold('  Step 2: FileMaker Sync (Optional)\n'));
  const { configureFm } = await inquirer.prompt([
    { type: 'confirm', name: 'configureFm', message: 'Configure FileMaker sync?', default: false },
  ]);

  if (configureFm) {
    const fmCreds = await inquirer.prompt([
      { type: 'input', name: 'host', message: 'FileMaker Server URL (https://...):' },
      { type: 'input', name: 'database', message: 'Database name:' },
      { type: 'input', name: 'username', message: 'API username:' },
      { type: 'password', name: 'password', message: 'API password:' },
    ]);

    const config = getConfig();
    config.set('filemaker', {
      host: fmCreds.host,
      database: fmCreds.database,
      username: fmCreds.username,
      password: fmCreds.password,
    });
    console.log(chalk.green('  FileMaker configured.\n'));
  }

  // Done
  console.log(chalk.green.bold('  Setup complete!\n'));
  console.log(`  Quick start:
    ${chalk.cyan('sfcli customers list')}          List your customers
    ${chalk.cyan('sfcli jobs today')}              See today's scheduled jobs
    ${chalk.cyan('sfcli report revenue')}          Revenue report for this month
    ${chalk.cyan('sfcli interactive')}             Launch interactive mode
    ${chalk.cyan('sfcli --help')}                  Full command reference
`);
  if (!configureFm) {
    console.log(chalk.dim(`  FileMaker sync: Not configured (run 'sfcli sync fm-test' after setting FM_ env vars)\n`));
  }

  return true;
}
