# sfcli

A command-line interface for the [Service Fusion](https://www.servicefusion.com/) REST API, with a local SQLite cache for instant lookups and a sync bridge to Claris FileMaker.

## Prerequisites

- **Node.js 18 or later** — download from [nodejs.org](https://nodejs.org/) and run the installer. To check if you already have it, open Terminal and type `node --version`.

## Setup

1. Open Terminal and navigate to the project folder:

   ```
   cd ~/apps/sfcli
   ```

2. Install dependencies and link the CLI globally (only needed once, or after updates):

   ```
   npm install
   npm link
   ```

3. Run the CLI — on first launch with no config, an interactive setup wizard will walk you through connecting to Service Fusion and (optionally) FileMaker:

   ```
   sfcli
   ```

   Or skip the wizard and log in directly:

   ```
   sfcli auth login
   ```

   Credentials are stored encrypted on your machine at `~/.sfcli/tokens.json`.

4. Verify it worked:

   ```
   sfcli auth whoami
   ```

5. (Optional) Enable tab completion:

   ```bash
   # Zsh (macOS default):
   echo 'eval "$(sfcli completion zsh)"' >> ~/.zshrc
   source ~/.zshrc

   # Bash:
   echo 'eval "$(sfcli completion bash)"' >> ~/.bashrc
   source ~/.bashrc
   ```

## Usage

All commands follow the pattern: `sfcli <command> [options]`

### Customers

```bash
# List / search (uses local cache when warm — instant results)
sfcli customers list
sfcli customers list --limit 10
sfcli customers search "Acme"
sfcli customers search --phone "555-1234"
sfcli customers search --email "john@example.com"

# Search across ALL service locations (not just primary)
sfcli customers search --city "Austin"
sfcli customers search --city "Austin" --state "TX"
sfcli customers search --zip "78701"
sfcli customers search --street "Main St"

# Filter by contact name
sfcli customers search --contact-name "John"

# Find active/inactive customers by job history
sfcli customers search --has-jobs-since "2025-01-01"
sfcli customers search --no-jobs-since "2025-01-01"

# Combine filters
sfcli customers search --city "Austin" --has-jobs-since "2025-01-01"

# Control which columns to show
sfcli customers list --select customer_name,phone,city
sfcli customers search --city "Austin" --select customer_name,phone --output csv

# Get by ID
sfcli customers get 12345

# Create (interactive prompts, or pass JSON)
sfcli customers create
sfcli customers create --json '{"customer_name":"Acme Corp","phone":"555-1234"}'

# Update
sfcli customers update 12345 --set phone="555-9999"
```

### Service Locations

Search across all service locations for all customers. Each customer can have multiple locations.

```bash
# List all locations
sfcli locations list

# Filter by city, state, zip
sfcli locations list --city "Austin"
sfcli locations list --state "TX"
sfcli locations list --zip "78701"

# Search by street address
sfcli locations list --street "Oak Ave"

# Scope to a specific customer (by name or ID)
sfcli locations list --customer "Acme"
sfcli locations list --customer 12345

# Show only primary locations
sfcli locations list --is-primary

# Combine filters
sfcli locations list --city "Austin" --customer "Acme"

# Control output
sfcli locations list --select customer_name,street_1,city,zip --output csv
```

### Contacts

Search contacts (people) across all customer accounts, with phone and email lookup.

```bash
# List all contacts
sfcli contacts list

# Find a contact by name
sfcli contacts list --name "John"

# Look up who owns a phone number
sfcli contacts list --phone "555-1234"

# Find a contact by email
sfcli contacts list --email "john@acme.com"

# Scope to a customer
sfcli contacts list --customer "Acme"

# Combine filters
sfcli contacts list --customer "Acme" --name "John"
```

### Jobs

```bash
# List with filters (uses local cache when warm)
sfcli jobs list
sfcli jobs list --status "Scheduled"
sfcli jobs list --status "Completed" --sort total:desc

# Filter by technician name
sfcli jobs list --tech "Mike"

# Filter by customer name
sfcli jobs list --customer "Acme"

# Filter by service location
sfcli jobs list --city "Austin"
sfcli jobs list --city "Austin" --state "TX"

# Filter by date range
sfcli jobs list --date-range "2025-01-01..2025-03-31"
sfcli jobs list --date-range "2025-Q1..2025-Q1"

# Filter by total amount
sfcli jobs list --min-total 500 --max-total 2000

# Combine filters
sfcli jobs list --tech "Mike" --status "Completed" --date-range "2025-01-01..2025-06-30"

# Control columns
sfcli jobs list --select customer_name,status,total --output csv

# Shortcuts
sfcli jobs today
sfcli jobs this-week

# Get / create / update
sfcli jobs get 67890
sfcli jobs create --customer 12345 --description "HVAC Repair"
sfcli jobs status 67890 "Completed"
sfcli jobs dispatch 67890
sfcli jobs assign 67890 --technician 789
```

### Estimates

```bash
sfcli estimates list
sfcli estimates list --status "Approved"
sfcli estimates list --customer "Acme"
sfcli estimates list --date-range "2025-Q1..2025-Q1"
sfcli estimates list --select customer_name,status,total
sfcli estimates get 11111
sfcli estimates create
```

### Technicians

```bash
sfcli techs list
sfcli techs list --department "HVAC"
sfcli techs list --name "Mike"
sfcli techs get 789
```

### Equipment

```bash
# List all equipment (no customer ID required)
sfcli equipment list

# Filter by customer
sfcli equipment list --customer "Acme"
sfcli equipment list --customer 12345

# Filter by equipment attributes
sfcli equipment list --type "HVAC"
sfcli equipment list --make "Carrier"
sfcli equipment list --model "24ACC636"
sfcli equipment list --serial "SN-001"

# Filter by customer location
sfcli equipment list --city "Austin"
sfcli equipment list --state "TX"

# Combine filters
sfcli equipment list --type "HVAC" --city "Austin"
sfcli equipment list --select type,make,model,serial_number --output csv
```

### Invoices

```bash
sfcli invoices list
sfcli invoices list --paid
sfcli invoices list --unpaid
sfcli invoices list --customer "Acme"
sfcli invoices list --date-range "2025-01-01..2025-06-30"
sfcli invoices list --unpaid --min-total 1000
sfcli invoices list --select customer,total,is_paid,date --output csv
sfcli invoices get 99999
```

### Ad-Hoc Queries

Run raw SQL against the local cache for cross-entity analysis. All queries are validated as read-only.

```bash
# Simple queries
sfcli query "SELECT customer_name, total FROM cache_jobs WHERE status = 'Completed' ORDER BY total DESC LIMIT 10"

# Join across tables — customers + locations + jobs
sfcli query "SELECT c.customer_name, l.city, COUNT(j.id) as job_count, SUM(j.total) as revenue
  FROM cache_customers c
  JOIN cache_locations l ON l.customer_id = c.id
  JOIN cache_jobs j ON j.customer_id = c.id
  WHERE l.city = 'Austin'
  GROUP BY c.id"

# Find customers with no jobs in 90 days
sfcli query "SELECT c.customer_name, MAX(j.start_date) as last_job
  FROM cache_customers c
  LEFT JOIN cache_jobs j ON j.customer_id = c.id
  GROUP BY c.id
  HAVING last_job < date('now', '-90 days') OR last_job IS NULL"

# Revenue by technician
sfcli query "SELECT t.first_name || ' ' || t.last_name as tech, COUNT(j.id) as jobs, SUM(j.total) as revenue
  FROM cache_techs t
  JOIN cache_job_techs jt ON jt.tech_id = t.id
  JOIN cache_jobs j ON j.id = jt.job_id
  WHERE j.status = 'Completed'
  GROUP BY t.id
  ORDER BY revenue DESC"

# Output as CSV or JSON
sfcli query "SELECT ..." --output csv
sfcli query "SELECT ..." --output json --limit 50
```

### Saved Queries

Save frequently-used SQL as named, parameterized queries in `~/.sfcli/queries/`.

```bash
# Save a query
sfcli query "SELECT c.customer_name, l.city FROM cache_customers c JOIN cache_locations l ON l.customer_id = c.id WHERE l.city = 'Austin'" --save customers-in-austin

# List saved queries
sfcli query --list

# Run a saved query with parameters
sfcli query inactive-by-location --city Austin --days 90
```

Saved queries are `.sql` files with YAML frontmatter:

```sql
---
name: inactive-by-location
description: Customers with no jobs in N days at a given location
params:
  city: { type: string, required: true }
  days: { type: number, default: 90 }
---
SELECT c.customer_name, l.city, MAX(j.start_date) as last_job
FROM cache_customers c
JOIN cache_locations l ON l.customer_id = c.id
LEFT JOIN cache_jobs j ON j.customer_id = c.id
WHERE l.city = $city
GROUP BY c.id
HAVING last_job < date('now', '-' || $days || ' days') OR last_job IS NULL
```

### Reports

All reports support `--period`, `--format table|json|csv`, and `--output <file>`.

Period options: `this-week`, `this-month`, `this-quarter`, `this-year`, `2025-Q1`, or `2025-01-01..2025-03-31`.

```bash
sfcli report jobs-summary --period "2025-Q1"
sfcli report revenue --period "this-month"
sfcli report revenue --period "this-year" --format csv --output revenue.csv
sfcli report revenue-by-customer --top 20
sfcli report tech-performance --period "this-month"
sfcli report customer-aging
sfcli report customer-activity --inactive-days 90
```

### Natural Language Queries (AI-Powered)

Ask questions about your data in plain English. Uses a hybrid local/cloud AI approach:

- **Local (default):** Ollama + Llama 3.1 8B — free, private, runs on your machine
- **Cloud (`--deep`):** Claude API — stronger reasoning for complex analysis

The AI generates SQL against your local SQLite cache, executes it, and summarizes the results in natural language.

#### Setup

**Local (Ollama):**

```bash
# Install Ollama (if not already installed)
brew install ollama

# Start the service (auto-starts on login after first run)
ollama serve

# Pull the model (~4.9GB download)
ollama pull llama3.1
```

**Cloud (Claude API) — optional, for `--deep` queries:**

```bash
# Set your API key (one of these methods)
export ANTHROPIC_API_KEY=sk-ant-...
# or persist in config:
sfcli config set ai_api_key sk-ant-...
```

#### Examples

```bash
# Simple lookups (local Ollama)
sfcli ask "how many customers are there?"
sfcli ask "how many customers are in zip code 94062?"
sfcli ask "show me next week's scheduled jobs"
sfcli ask "which technicians have the most jobs?"

# See the generated SQL + data + summary
sfcli ask --show-sql "what is the total revenue from completed jobs?"

# Get raw data instead of a summary (works with --output)
sfcli ask --raw "customers in San Francisco"
sfcli ask --raw --output csv "all scheduled jobs" > scheduled.csv
sfcli ask --raw --output json "invoices over $1000"

# Complex analysis (cloud AI for better reasoning)
sfcli ask --deep "what are our sales projections based on the last 3 months of completed jobs? break down by region"
sfcli ask --deep "which customers haven't had service in over 6 months but had more than 3 jobs before that?"

# Refresh cache before querying for freshest data
sfcli ask --fresh "today's jobs"
```

#### Ask Command Flags

| Flag | What it does |
|------|-------------|
| `--deep` | Use cloud AI (Claude) instead of local Ollama |
| `--show-sql` | Show generated SQL, data table, and summary |
| `--raw` | Show raw data only (no AI summary) |
| `--fresh` | Refresh cache before querying |

If Ollama isn't running and a cloud API key is configured, the command automatically falls back to the cloud provider with a warning.

#### Configuration

```bash
# Ollama settings (defaults shown)
sfcli config set ollama_url "http://localhost:11434"
sfcli config set ollama_model "llama3.1"

# Cloud AI settings
sfcli config set ai_provider "claude"              # claude (default)
sfcli config set ai_api_key "sk-ant-..."           # or use ANTHROPIC_API_KEY env var
sfcli config set ai_model "claude-sonnet-4-20250514"  # default model
```

### Local Cache

The CLI maintains a local SQLite cache at `~/.sfcli/cache.db` with normalized relational tables — customers, locations, contacts, phones, emails, jobs, job_techs, estimates, invoices, techs, and equipment. All `list` and `search` commands use the cache when warm. The cache has a 12-hour TTL aligned with the sync schedule. Schema migrations are automatic on upgrade.

```bash
sfcli cache refresh          # Populate/refresh cache (all entities)
sfcli cache status           # Check cache record counts and age
sfcli cache clear            # Clear the cache
sfcli customers list --no-cache   # Bypass cache for one command
```

### Configuration

```bash
sfcli config set slack.webhook_url "https://hooks.slack.com/services/T.../B.../xxx"
sfcli config get slack.webhook_url
sfcli config list
```

### FileMaker Sync

FM to SF push-only. Requires FileMaker Server with Data API enabled. FileMaker is treated as read-only; customer identity is the exact `org_name` value, mapped to Service Fusion `customer_name`. Production syncs use a created-date gate of `2024-10-01` plus optional modified-since-last-sync filtering.

```bash
sfcli sync fm-test                    # Test connection
sfcli sync push customers --dry-run --audit-dir ./sync-audit
sfcli sync push all --created-since 2024-10-01 --since-last-sync --notify
sfcli sync schedule enable            # Install crontab: 6am + 6pm PST
sfcli sync schedule disable           # Remove crontab entry
sfcli sync schedule status            # Show current schedule
sfcli sync status                     # Last sync times
sfcli sync log                        # Sync history
sfcli sync mapping show               # Field mappings
```

### Interactive Mode

```bash
sfcli interactive    # or: sfcli shell
```

### API Schema Discovery

```bash
sfcli discover              # All endpoints
sfcli discover customers    # Single endpoint
```

### Sorting

```bash
sfcli customers list --sort customer_name         # A-Z
sfcli customers list --sort customer_name:desc    # Z-A
sfcli jobs list --sort id:desc                    # Newest first
sfcli invoices list --sort total:desc             # Highest first
```

### Global Flags

| Flag | What it does |
|------|-------------|
| `--profile <name>` | Use a specific saved account profile |
| `--output <format>` | Output as `table`, `json`, `csv`, or `quiet` |
| `--sort <field[:dir]>` | Sort output by field |
| `--select <fields>` | Choose output columns (comma-separated) |
| `--no-color` | Turn off colored output |
| `--no-cache` | Bypass local cache, always fetch from API |
| `--verbose` | Show API request/response details |
| `--dry-run` | Preview without making changes |
| `--help` | Show help for any command |

## Running Tests

```
npm test
```

284 tests across 36 test files.

## Project Structure

```
bin/sfcli.js              Entry point + tab completion
src/
  index.js                CLI program setup (Commander.js)
  auth/                   OAuth token management + encrypted storage
  api/                    Service Fusion API wrappers
  ai/                    Natural language query engine
    schema.js             Dynamic SQLite schema introspection
    prompt.js             LLM prompt templates (SQL gen + summarization)
    executor.js           Read-only SQL validation + execution
    ollama.js             Local Ollama client (Axios)
    claude.js             Claude API client (@anthropic-ai/sdk)
    provider.js           Hybrid routing + fallback logic
  cache/
    schema.js             Normalized SQLite schema (11 tables) + migrations
    normalizer.js         API record → normalized row decomposition
    entity-cache.js       SWR cache strategy engine
    decide-strategy.js    Cache freshness decision matrix
    refreshers.js         Per-entity API fetch + cache population
    index.js              Singleton cache factory
  commands/               CLI command definitions (all cache-aware)
    locations.js          Service location search (city/state/zip/street)
    contacts.js           Contact search (phone/email/name)
    query.js              Raw SQL + saved parameterized queries
  config/                 Configuration + profile management
  filemaker/              FileMaker Data API bridge (push-only)
  reports/                Report engine + templates
  utils/
    output.js             Output formatting (table/json/csv/quiet + --select)
    sort.js               Sort utility for --sort flag
    completions.js        Tab completion engine
    cache.js              SQLite cache layer (normalized tables)
    cache-search.js       Cache-aware search (fresh -> SQLite, stale -> API)
    slack.js              Slack webhook notifications
    cron-scheduler.js     Crontab management for sync schedule
    paginator.js          Auto-pagination helper
    logger.js             Structured logging
    spinner.js            CLI spinner/progress
fm-mapping.json           FileMaker field mappings (customizable)
~/.sfcli/queries/         Saved SQL queries with YAML frontmatter
tests/                    Integration tests (vitest, 284 tests)
```




// zip code query
node -e "
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const dbPath = path.join(os.homedir(), '.sfcli', 'cache.db');
const db = new Database(dbPath, { readonly: true });
const rows = db.prepare(\`
  SELECT c.customer_name, COUNT(DISTINCT l.zip) as zip_count, COUNT(l.id) as location_count 
  FROM cache_customers c 
  JOIN cache_locations l ON l.customer_id = c.id 
  WHERE l.zip IS NOT NULL 
  GROUP BY c.id 
  HAVING zip_count >= 2 
  ORDER BY zip_count DESC, location_count DESC
\`).all();
db.close();
console.log('Total:', rows.length);

// Write CSV
const fs = require('fs');
let csv = 'customer_name,zip_count,location_count\n';
for (const r of rows) {
  const name = r.customer_name.includes(',') ? '\"' + r.customer_name.replace(/\"/g, '\"\"') + '\"' : r.customer_name;
  csv += name + ',' + r.zip_count + ',' + r.location_count + '\n';
}
fs.writeFileSync('./customers-multi-zip.csv', csv);
console.log('Written to customers-multi-zip.csv');
" 2>&1
