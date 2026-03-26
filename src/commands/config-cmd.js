import chalk from 'chalk';
import { getConfig } from '../config/index.js';

export function registerConfigCommands(program) {
  const config = program.command('config').description('Manage CLI configuration');

  config
    .command('set <key> <value>')
    .description('Set a config value (e.g. slack.webhook_url)')
    .action((key, value) => {
      try {
        const store = getConfig();
        store.set(key, value);
        console.log(chalk.green(`Set ${key} = ${value}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  config
    .command('get <key>')
    .description('Get a config value')
    .action((key) => {
      try {
        const store = getConfig();
        const value = store.get(key);
        if (value === undefined) {
          console.log(chalk.yellow(`${key} is not set`));
        } else {
          console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : value);
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });

  config
    .command('list')
    .description('Show all configuration')
    .action(() => {
      try {
        const store = getConfig();
        console.log(JSON.stringify(store.store, null, 2));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });
}
