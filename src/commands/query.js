import Database from 'better-sqlite3';
import chalk from 'chalk';
import { join } from 'path';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { getConfigDir } from '../config/index.js';
import { output } from '../utils/output.js';

const MAX_ROWS = 500;
const FORBIDDEN = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|PRAGMA)\b/i;

/**
 * Validate that SQL is a read-only SELECT statement.
 * @param {string} sql
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateQuerySql(sql) {
  const trimmed = (sql || '').trim();
  if (!trimmed) {
    return { valid: false, error: 'Empty SQL statement' };
  }

  const upper = trimmed.toUpperCase();
  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
    return { valid: false, error: 'Only SELECT statements are allowed' };
  }

  if (FORBIDDEN.test(trimmed)) {
    return { valid: false, error: 'Statement contains forbidden keywords (INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, ATTACH, DETACH, PRAGMA)' };
  }

  return { valid: true };
}

/**
 * Execute a read-only SQL query against the cache database.
 * @param {string} sql
 * @param {string} [dbPath]
 * @param {Array} [params]
 * @returns {{ rows: Array, columns: string[], rowCount: number, truncated: boolean, error?: string }}
 */
export function executeQueryOnCache(sql, dbPath, params = []) {
  dbPath = dbPath || join(getConfigDir(), 'cache.db');
  const empty = { rows: [], columns: [], rowCount: 0, truncated: false };

  const validation = validateQuerySql(sql);
  if (!validation.valid) {
    return { ...empty, error: validation.error };
  }

  let db;
  try {
    db = new Database(dbPath, { readonly: true });
    const rows = db.prepare(sql).all(...params);

    if (rows.length === 0) {
      return empty;
    }

    const columns = Object.keys(rows[0]);
    const truncated = rows.length > MAX_ROWS;
    const capped = truncated ? rows.slice(0, MAX_ROWS) : rows;

    return {
      rows: capped,
      columns,
      rowCount: capped.length,
      truncated,
    };
  } catch (err) {
    return { ...empty, error: err.message };
  } finally {
    if (db) db.close();
  }
}

/**
 * Get the saved queries directory path.
 */
export function getQueriesDir() {
  return join(getConfigDir(), 'queries');
}

/**
 * Parse a .sql file with YAML frontmatter.
 * @param {string} content - File contents
 * @returns {{ meta: Object, sql: string }}
 */
export function parseSavedQuery(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    return { meta: {}, sql: content.trim() };
  }

  const yamlBlock = fmMatch[1];
  const sql = fmMatch[2].trim();

  // Simple YAML parser for our specific format
  const meta = { params: {} };
  let currentParam = null;

  for (const line of yamlBlock.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const topMatch = trimmed.match(/^(\w+):\s*(.*)$/);
    if (topMatch && !line.startsWith('  ')) {
      const [, key, value] = topMatch;
      if (key === 'params') {
        continue; // params is a block
      }
      meta[key] = value.replace(/^['"]|['"]$/g, '');
    }

    // Param definition: "  city: { type: string, required: true }"
    const paramMatch = trimmed.match(/^(\w+):\s*\{(.+)\}$/);
    if (paramMatch && line.startsWith('  ')) {
      const [, paramName, paramDef] = paramMatch;
      const param = {};
      for (const part of paramDef.split(',')) {
        const kv = part.trim().match(/(\w+):\s*(.+)/);
        if (kv) {
          let val = kv[2].trim();
          if (val === 'true') val = true;
          else if (val === 'false') val = false;
          else if (!isNaN(Number(val))) val = Number(val);
          param[kv[1]] = val;
        }
      }
      meta.params[paramName] = param;
    }
  }

  return { meta, sql };
}

/**
 * Substitute $param placeholders with values from a params object.
 * Returns the SQL and an array of params for parameterized execution.
 * @param {string} sql
 * @param {Object} paramDefs - param definitions from frontmatter
 * @param {Object} values - user-provided values
 * @returns {{ sql: string, params: Array, error?: string }}
 */
export function substituteParams(sql, paramDefs, values) {
  const params = [];
  let result = sql;

  // Validate required params
  for (const [name, def] of Object.entries(paramDefs)) {
    if (def.required && values[name] === undefined && def.default === undefined) {
      return { sql: result, params: [], error: `Missing required parameter: --${name}` };
    }
  }

  // Replace $param with ? and collect values
  const paramPattern = /\$(\w+)/g;
  let match;
  const replacements = [];

  while ((match = paramPattern.exec(sql)) !== null) {
    const name = match[1];
    const def = paramDefs[name] || {};
    let value = values[name] ?? def.default;

    if (value === undefined) {
      return { sql: result, params: [], error: `Unknown parameter: $${name}` };
    }

    // Type coercion
    if (def.type === 'number') value = Number(value);

    replacements.push({ index: match.index, length: match[0].length, value });
  }

  // Replace from end to start to preserve indices
  for (let i = replacements.length - 1; i >= 0; i--) {
    const r = replacements[i];
    result = result.slice(0, r.index) + '?' + result.slice(r.index + r.length);
    params.unshift(r.value);
  }

  return { sql: result, params };
}

/**
 * List all saved queries.
 * @returns {Array<{ name, description, file }>}
 */
export function listSavedQueries() {
  const dir = getQueriesDir();
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter(f => f.endsWith('.sql'));
  return files.map(file => {
    const content = readFileSync(join(dir, file), 'utf8');
    const { meta } = parseSavedQuery(content);
    return {
      name: meta.name || file.replace('.sql', ''),
      description: meta.description || '',
      file,
    };
  });
}

/**
 * Save a query to disk.
 * @param {string} name
 * @param {string} sql
 * @param {Object} [paramDefs]
 */
export function saveQuery(name, sql, paramDefs = {}) {
  const dir = getQueriesDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let content = '---\n';
  content += `name: ${name}\n`;
  content += `description: \n`;
  if (Object.keys(paramDefs).length > 0) {
    content += `params:\n`;
    for (const [pName, pDef] of Object.entries(paramDefs)) {
      const parts = Object.entries(pDef).map(([k, v]) => `${k}: ${v}`).join(', ');
      content += `  ${pName}: { ${parts} }\n`;
    }
  }
  content += '---\n';
  content += sql.trim() + '\n';

  writeFileSync(join(dir, `${name}.sql`), content, 'utf8');
}

export function registerQueryCommands(program) {
  program
    .command('query [sql-or-name]')
    .description('Execute raw SQL or a saved query against the cache')
    .option('--save <name>', 'Save the query with a name')
    .option('--list', 'List saved queries')
    .option('--limit <n>', 'Limit results', parseInt)
    .allowUnknownOption(true)
    .action(async (sqlOrName, options, command) => {
      const globalOpts = program.opts();
      try {
        // --list mode
        if (options.list) {
          const queries = listSavedQueries();
          if (queries.length === 0) {
            console.log(chalk.yellow('No saved queries found.'));
            return;
          }
          output(queries, {
            format: globalOpts.output,
            columns: ['name', 'description'],
            headers: { name: 'Name', description: 'Description' },
          });
          return;
        }

        if (!sqlOrName) {
          console.error(chalk.red('Provide a SQL query or saved query name.'));
          process.exitCode = 1;
          return;
        }

        let sql;
        let params = [];

        // Check if it's a saved query name (no spaces, no SQL keywords)
        const isSql = sqlOrName.toUpperCase().startsWith('SELECT') ||
                      sqlOrName.toUpperCase().startsWith('WITH');

        if (isSql) {
          sql = sqlOrName;
        } else {
          // Load saved query
          const dir = getQueriesDir();
          const filePath = join(dir, `${sqlOrName}.sql`);
          if (!existsSync(filePath)) {
            console.error(chalk.red(`Saved query not found: ${sqlOrName}`));
            process.exitCode = 1;
            return;
          }

          const content = readFileSync(filePath, 'utf8');
          const { meta, sql: querySql } = parseSavedQuery(content);

          // Parse unknown options as param values
          const rawArgs = command.args || [];
          const paramValues = {};
          for (let i = 0; i < rawArgs.length; i++) {
            if (rawArgs[i].startsWith('--')) {
              const key = rawArgs[i].slice(2);
              paramValues[key] = rawArgs[i + 1];
              i++;
            }
          }

          const subResult = substituteParams(querySql, meta.params || {}, paramValues);
          if (subResult.error) {
            console.error(chalk.red(subResult.error));
            process.exitCode = 1;
            return;
          }

          sql = subResult.sql;
          params = subResult.params;
        }

        const result = executeQueryOnCache(sql, undefined, params);

        if (result.error) {
          console.error(chalk.red(result.error));
          process.exitCode = 1;
          return;
        }

        if (result.truncated) {
          console.error(chalk.yellow(`Results truncated to ${MAX_ROWS} rows.`));
        }

        let rows = result.rows;
        if (options.limit) rows = rows.slice(0, options.limit);

        output(rows, {
          format: globalOpts.output,
          sort: globalOpts.sort,
          columns: result.columns,
        });

        // Save if requested
        if (options.save && isSql) {
          saveQuery(options.save, sql);
          console.log(chalk.green(`Query saved as "${options.save}".`));
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exitCode = 1;
      }
    });
}
