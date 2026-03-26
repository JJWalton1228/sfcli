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
sfcli customers list --all
sfcli customers search "Acme"
sfcli customers search --phone "555-1234"
sfcli customers search --email "john@example.com"
sfcli customers search --city "Dublin" --state "CA"

# Get by ID
sfcli customers get 12345

# Create (interactive prompts, or pass JSON)
sfcli customers create
sfcli customers create --json '{"customer_name":"Acme Corp","phone":"555-1234"}'
sfcli customers create --from-file customer.json

# Update
sfcli customers update 12345 --set phone="555-9999"
sfcli customers update 12345 --json '{"notes":"Updated via CLI"}'
```

### Jobs

```bash
# List with filters (uses local cache when warm)
sfcli jobs list
sfcli jobs list --status "Scheduled"
sfcli jobs list --customer 12345
sfcli jobs list --sort id:desc --limit 100

# Shortcuts
sfcli jobs today
sfcli jobs this-week

# Get / create / update
sfcli jobs get 67890
sfcli jobs create --customer 12345 --description "HVAC Repair"
sfcli jobs update 67890 --set description="Updated"

# Quick status changes
sfcli jobs status 67890 "Completed"
sfcli jobs dispatch 67890
sfcli jobs assign 67890 --technician 789
```

### Estimates

```bash
sfcli estimates list
sfcli estimates list --customer 12345
sfcli estimates search "kitchen remodel"
sfcli estimates get 11111
sfcli estimates create
```

### Technicians

```bash
sfcli techs list
sfcli techs get 789
```

### Equipment

```bash
sfcli equipment list
sfcli equipment list --customer 12345
sfcli equipment get 55555
sfcli equipment search "Carrier"
```

### Invoices

```bash
sfcli invoices list
sfcli invoices list --status "unpaid"
sfcli invoices list --overdue
sfcli invoices list --customer 12345
sfcli invoices get 99999
```

### Reports

All reports support `--period`, `--format table|json|csv`, and `--output <file>`.

Period options: `this-week`, `this-month`, `this-quarter`, `this-year`, `2025-Q1`, or `2025-01-01..2025-03-31`.

```bash
# Job reports
sfcli report jobs-summary --period "2025-Q1"
sfcli report jobs-summary --from "2025-01-01" --to "2025-03-31"

# Revenue reports
sfcli report revenue --period "this-month"
sfcli report revenue --period "this-year" --format csv --output revenue.csv
sfcli report revenue-by-customer --top 20

# Technician reports
sfcli report tech-performance --period "this-month"

# Customer reports
sfcli report customer-aging
sfcli report customer-activity --inactive-days 90
```

### Local Cache

The CLI maintains a local SQLite cache at `~/.sfcli/cache.db` for instant search and list operations. All `list` and `search` commands use the cache when warm. The cache has a 12-hour TTL aligned with the sync schedule.

```bash
# Populate/refresh the cache (all entities)
sfcli cache refresh

# Check cache status (record counts, age)
sfcli cache status

# Clear the cache
sfcli cache clear

# Bypass cache for a single command
sfcli customers search "Acme" --no-cache
sfcli jobs list --no-cache
```

When the cache is warm, list and search commands query SQLite locally — results come back instantly even across 50k+ records.

### Configuration

```bash
sfcli config set slack.webhook_url "https://hooks.slack.com/services/T.../B.../xxx"
sfcli config get slack.webhook_url
sfcli config list
```

### FileMaker Sync

Requires FileMaker Server with Data API enabled. Set credentials via the setup wizard, environment variables (`FM_HOST`, `FM_DATABASE`, `FM_USERNAME`, `FM_PASSWORD`), or `~/.sfcli/config.json`.

The sync is **FM to SF push-only** — FileMaker is read-only source of truth.

```bash
# Test connection
sfcli sync fm-test

# Push: FileMaker -> Service Fusion
sfcli sync push customers
sfcli sync push all
sfcli sync push all --notify          # Post results to Slack

# Scheduled sync (cron at 6am + 6pm PST)
sfcli sync schedule enable
sfcli sync schedule disable
sfcli sync schedule status

# Status and history
sfcli sync status
sfcli sync log

# Field mapping
sfcli sync mapping show
sfcli sync mapping validate
sfcli sync mapping init
```

Edit `fm-mapping.json` to customize how fields map between Service Fusion and your FileMaker database.

### Interactive Mode

```bash
sfcli interactive
# or
sfcli shell
```

Launches a REPL with tab completion and persistent command history. Type `help` for a reference, `exit` to quit.

### API Schema Discovery

Fetch a sample record from any endpoint to see its actual field names and types:

```bash
sfcli discover              # All endpoints
sfcli discover customers    # Single endpoint
```

### Authentication

```bash
sfcli auth login
sfcli auth login --client-id X --client-secret Y
sfcli auth logout
sfcli auth whoami
sfcli auth profiles
sfcli auth add-profile staging
sfcli auth switch staging
```

### Output Formats

```bash
# Table (default, with colors)
sfcli customers list

# JSON (pipe-friendly)
sfcli customers list --output json

# CSV
sfcli customers list --output csv

# Quiet (just IDs)
sfcli customers list --output quiet
```

### Sorting

Any list or search output can be sorted with the `--sort` flag:

```bash
sfcli customers list --sort customer_name         # A-Z by name
sfcli customers list --sort customer_name:desc    # Z-A
sfcli jobs list --sort id:desc                    # Newest first
sfcli invoices list --sort total:desc             # Highest first
sfcli customers search "Kaiser" --sort city       # Sort by city
```

Format: `--sort <field>` (ascending) or `--sort <field>:desc` (descending).

### Global Flags

| Flag | What it does |
|------|-------------|
| `--profile <name>` | Use a specific saved account profile |
| `--output <format>` | Output as `table`, `json`, `csv`, or `quiet` |
| `--sort <field[:dir]>` | Sort output by field, e.g. `name`, `total:desc` |
| `--no-color` | Turn off colored output |
| `--no-cache` | Bypass local cache, always fetch from API |
| `--verbose` | Show API request/response details for debugging |
| `--dry-run` | Preview what would happen without making changes |
| `--help` | Show help for any command |

## Running Tests

```
npm test
```

68 tests across 10 test files.

## Project Structure

```
bin/sfcli.js              Entry point + first-run wizard + tab completion
src/
  index.js                CLI program setup (Commander.js)
  auth/                   OAuth token management + encrypted storage
  api/                    Service Fusion API wrappers (one per entity)
  commands/               CLI command definitions
    auth.js               Login, logout, profiles
    customers.js          Customer CRUD + search (cache-aware)
    jobs.js               Job CRUD + status shortcuts (cache-aware)
    estimates.js          Estimate CRUD (cache-aware)
    technicians.js        Technician list/get (cache-aware)
    equipment.js          Equipment list/get/search
    invoices.js           Invoice list/get (cache-aware)
    reports.js            Report generation commands
    sync.js               FileMaker sync commands
    cache.js              Cache refresh/status/clear
    config-cmd.js         Configuration management
    interactive.js        REPL mode
    discover.js           API schema discovery
    setup.js              First-run wizard
  config/                 Configuration + profile management
  filemaker/              FileMaker Data API bridge
    client.js             FM Data API client
    auth.js               FM session auth
    mapper.js             SF <-> FM field mapping
    sync-engine.js        Push sync orchestrator
    conflict-resolver.js  Conflict detection + resolution
  reports/                Report engine + templates
    engine.js             Period parser, formatters
    templates/            Individual report generators
  utils/
    output.js             Output formatting (table/json/csv/quiet)
    sort.js               Sort utility for --sort flag
    completions.js        Tab completion engine
    cache.js              SQLite cache layer
    cache-search.js       Cache-aware search (fresh cache -> SQLite, stale -> API)
    slack.js              Slack webhook notifications
    cron-scheduler.js     Crontab management for sync schedule
    paginator.js          Auto-pagination helper
    logger.js             Structured logging
    spinner.js            CLI spinner/progress
fm-mapping.json           Default FileMaker field mappings (customizable)
tests/                    Unit tests (vitest, 68 tests)
```
