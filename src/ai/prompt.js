const MAX_SUMMARY_ROWS = 50;

/**
 * Build the SQL generation prompt.
 * @param {string} schemaText - Formatted schema from introspectSchema()
 * @param {string} question - User's natural language question
 * @param {string} currentDate - ISO date string (YYYY-MM-DD)
 * @returns {{ system: string, user: string }}
 */
export function buildSqlPrompt(schemaText, question, currentDate) {
  const system = `You are a SQLite query generator for a field service management database.
Today's date is ${currentDate}.

DATABASE SCHEMA:
${schemaText}

RULES:
- Output ONLY a single valid SQLite SELECT statement. No markdown, no explanation, no code fences.
- Access JSON fields using: json_extract(data, '$.fieldname')
- For nested arrays, use json_each(): SELECT ... FROM cache_customers, json_each(json_extract(data, '$.contacts')) AS c
- Tables: cache_customers, cache_jobs, cache_estimates, cache_invoices, cache_techs, cache_equipment
- The cache_meta table has columns: entity TEXT, refreshed_at TEXT
- NEVER use INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, or ATTACH — SELECT only
- Use LIMIT 100 unless the user explicitly asks for all results
- For date comparisons use ISO format: 'YYYY-MM-DD'
- For monetary aggregations, cast with CAST(json_extract(data, '$.total') AS REAL)
- For case-insensitive text matching use LOWER()
- To join across entities, use: json_extract(cache_jobs.data, '$.customer_id') = cache_customers.id
- When grouping by geographic region, use json_extract(data, '$.state_prov') or json_extract(data, '$.city')

COMMON MISTAKES — these are NOT valid SQLite, never use them:
- YEAR(col), MONTH(col), DAY(col) → use strftime('%Y', col), strftime('%m', col), strftime('%d', col)
- NOW(), CURDATE(), GETDATE() → use date('now') or datetime('now')
- ILIKE → use LIKE (SQLite LIKE is already case-insensitive for ASCII)
- LIMIT 10, 20 → use LIMIT 20 OFFSET 10
- Direct [] array syntax in SQL → use json_each(json_extract(data, '$.array_field'))
- BOOLEAN = TRUE/FALSE → use = 1 or = 0
- DATEADD(), DATEDIFF() → use date('now', '-30 days') or julianday(a) - julianday(b)
- GROUP_CONCAT without ORDER BY subquery → wrap in a subquery if ordering matters

EXAMPLE QUERIES:

Q: "How much revenue per month in Q4?"
SELECT strftime('%Y-%m', date) AS month,
       SUM(CAST(total AS REAL)) AS revenue
FROM cache_invoices
WHERE strftime('%m', date) IN ('10','11','12')
GROUP BY month
ORDER BY month;

Q: "List all customers with more than 2 zip codes in service locations"
SELECT c.customer_name,
       COUNT(DISTINCT json_extract(loc.value, '$.postal_code')) AS zip_count
FROM cache_customers c,
     json_each(json_extract(c.data, '$.locations')) AS loc
GROUP BY c.id, c.customer_name
HAVING zip_count > 2
ORDER BY zip_count DESC;

Q: "How many jobs in the last month? List them in descending order"
SELECT id, customer_name, status, description, start_date, total
FROM cache_jobs
WHERE start_date >= date('now', '-30 days')
ORDER BY start_date DESC
LIMIT 100;`;

  const user = question;

  return { system, user };
}

/**
 * Build the summarization prompt.
 * @param {string} question - Original user question
 * @param {string} sql - SQL that was executed
 * @param {Array<Object>} rows - Result rows
 * @param {string} currentDate - ISO date string
 * @returns {{ system: string, user: string }}
 */
export function buildSummaryPrompt(question, sql, rows, currentDate) {
  const system = `You are a helpful assistant summarizing data from a field service management system.
Today's date is ${currentDate}.

Provide a clear, concise natural language answer to the user's question based on the query results.
- Use specific numbers and names from the data
- Format currency as $X,XXX.XX
- If results are empty, say so clearly
- Keep the summary under 5 sentences unless the data warrants more detail`;

  const truncated = rows.length > MAX_SUMMARY_ROWS;
  const displayRows = truncated ? rows.slice(0, MAX_SUMMARY_ROWS) : rows;
  const rowCount = rows.length;

  let resultsText = JSON.stringify(displayRows, null, 2);
  if (truncated) {
    resultsText += `\n\n(Showing first ${MAX_SUMMARY_ROWS} of ${rowCount} total rows — results truncated)`;
  }

  const user = `The user asked: "${question}"

This SQL was executed:
${sql}

Results (${rowCount} row${rowCount !== 1 ? 's' : ''}):
${resultsText}`;

  return { system, user };
}
