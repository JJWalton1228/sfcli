import chalk from 'chalk';
import dayjs from 'dayjs';
import { createSpinner } from '../utils/spinner.js';
import { output } from '../utils/output.js';
import { createCache } from '../utils/cache.js';
import { introspectSchema } from '../ai/schema.js';
import { buildSqlPrompt, buildSummaryPrompt } from '../ai/prompt.js';
import { validateSql, executeQuery } from '../ai/executor.js';
import { resolveProvider } from '../ai/provider.js';

export function registerAskCommand(program) {
  program
    .command('ask <question>')
    .description('Ask a natural language question about your data')
    .option('--deep', 'Use cloud AI for complex analysis')
    .option('--raw', 'Show raw data instead of summary')
    .option('--show-sql', 'Show SQL, data, and summary')
    .option('--fresh', 'Refresh cache before querying')
    .action(async (question, options) => {
      const globalOpts = program.opts();
      const outputFormat = options.output || globalOpts.output || 'table';

      let cache;
      try {
        cache = createCache();

        // --fresh: refresh all entities
        if (options.fresh) {
          const refreshSpinner = createSpinner('Refreshing cache...').start();
          // Just show a warning — actual refresh requires API client which needs auth
          refreshSpinner.warn('Use "sfcli cache refresh" to update cached data before querying.');
        }

        // Introspect schema
        const { schemaText } = introspectSchema();

        // Resolve AI provider
        const spinner = createSpinner('Thinking...').start();
        let provider;
        try {
          provider = await resolveProvider({ deep: options.deep });
        } catch (err) {
          spinner.fail(err.message);
          process.exitCode = 1;
          return;
        }

        if (provider.fallback) {
          spinner.text = `Ollama unavailable, using ${provider.providerName} (cloud)...`;
        }

        // Step 1: Generate SQL
        const currentDate = dayjs().format('YYYY-MM-DD');
        const sqlPrompt = buildSqlPrompt(schemaText, question, currentDate);
        let sql;
        try {
          const rawSql = await provider.generate(sqlPrompt.user, {
            system: sqlPrompt.system,
            maxTokens: 1024,
          });
          // Strip markdown code fences if present
          sql = rawSql.replace(/^```(?:sql)?\n?/i, '').replace(/\n?```$/i, '').trim();
        } catch (err) {
          spinner.fail(`AI request failed: ${err.message}`);
          process.exitCode = 1;
          return;
        }

        // Validate SQL
        const validation = validateSql(sql);
        if (!validation.valid) {
          spinner.fail(`Generated invalid SQL: ${validation.error}\nTry rephrasing your question.`);
          process.exitCode = 1;
          return;
        }

        // Step 2: Execute SQL
        const result = executeQuery(sql);
        if (result.error) {
          spinner.fail(`SQL execution error: ${result.error}\nTry rephrasing your question.`);
          process.exitCode = 1;
          return;
        }

        // Step 3: Summarize (unless --raw only)
        let summary = '';
        if (!options.raw) {
          const summaryPrompt = buildSummaryPrompt(question, sql, result.rows, currentDate);
          try {
            summary = await provider.generate(summaryPrompt.user, {
              system: summaryPrompt.system,
              maxTokens: 2048,
            });
          } catch (err) {
            spinner.warn(`Summary generation failed: ${err.message}`);
            // Fall through — show raw data instead
          }
        }

        spinner.stop();

        // Output
        if (outputFormat === 'json' && !options.raw && !options.showSql) {
          console.log(JSON.stringify({
            query: question,
            sql,
            data: result.rows,
            summary: summary || null,
          }, null, 2));
        } else if (options.showSql) {
          console.log(chalk.dim('--- SQL ---'));
          console.log(chalk.cyan(sql));
          console.log(chalk.dim(`\n--- Data (${result.rowCount} rows${result.truncated ? ', truncated' : ''}) ---`));
          if (result.rows.length > 0) {
            output(result.rows, { format: outputFormat });
          } else {
            console.log(chalk.yellow('No results.'));
          }
          if (summary) {
            console.log(chalk.dim('\n--- Summary ---'));
            console.log(summary);
          }
        } else if (options.raw) {
          output(result.rows, { format: outputFormat });
        } else {
          // Default: summary only
          if (summary) {
            console.log(summary);
          } else if (result.rows.length > 0) {
            output(result.rows, { format: outputFormat });
          } else {
            console.log(chalk.yellow('No results found.'));
          }
        }

        // Footer: cache age + provider
        const entities = ['customers', 'jobs', 'estimates', 'invoices', 'techs', 'equipment'];
        const staleEntities = entities.filter(e => {
          const status = cache.status(e);
          return status.stale && status.count > 0;
        });

        if (staleEntities.length > 0) {
          console.log(chalk.dim(`\n⚠ Stale cache: ${staleEntities.join(', ')}. Run: sfcli cache refresh`));
        }

        console.log(chalk.dim(`Provider: ${provider.providerName}${provider.fallback ? ' (fallback)' : ''}`));
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exitCode = 1;
      } finally {
        if (cache) cache.close();
      }
    });
}
