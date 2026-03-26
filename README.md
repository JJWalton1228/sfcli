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
sfcli customers search --city "Dublin" --state "CA"

# Get by ID
sfcli customers get 12345

# Create (interactive prompts, or pass JSON)
sfcli customers create
sfcli customers create --json '{"customer_name":"Acme Corp","phone":"555-1234"}'

# Update
sfcli customers update 12345 --set phone="555-9999"
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
sfcli report jobs-summary --period "2025-Q1"
sfcli report revenue --period "this-month"
sfcli report revenue --period "this-year" --format csv --output revenue.csv
sfcli report revenue-by-customer --top 20
sfcli report tech-performance --period "this-month"
sfcli report customer-aging
sfcli report customer-activity --inactive-days 90
```

### Local Cache

The CLI maintains a local SQLite cache at `~/.sfcli/cache.db` for instant search and list operations. All `list` and `search` commands use the cache when warm. The cache has a 12-hour TTL aligned with the sync schedule.

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

FM to SF push-only. Requires FileMaker Server with Data API enabled.

```bash
sfcli sync fm-test                    # Test connection
sfcli sync push customers             # Push FM changes to SF
sfcli sync push all --notify          # Push all + Slack notification
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
| `--no-color` | Turn off colored output |
| `--no-cache` | Bypass local cache, always fetch from API |
| `--verbose` | Show API request/response details |
| `--dry-run` | Preview without making changes |
| `--help` | Show help for any command |

## Running Tests

```
npm test
```

68 tests across 10 test files.

## Project Structure

```
bin/sfcli.js              Entry point + tab completion
src/
  index.js                CLI program setup (Commander.js)
  auth/                   OAuth token management + encrypted storage
  api/                    Service Fusion API wrappers
  commands/               CLI command definitions (all cache-aware)
  config/                 Configuration + profile management
  filemaker/              FileMaker Data API bridge (push-only)
  reports/                Report engine + templates
  utils/
    output.js             Output formatting (table/json/csv/quiet)
    sort.js               Sort utility for --sort flag
    completions.js        Tab completion engine
    cache.js              SQLite cache layer
    cache-search.js       Cache-aware search (fresh -> SQLite, stale -> API)
    slack.js              Slack webhook notifications
    cron-scheduler.js     Crontab management for sync schedule
    paginator.js          Auto-pagination helper
    logger.js             Structured logging
    spinner.js            CLI spinner/progress
fm-mapping.json           FileMaker field mappings (customizable)
tests/                    Unit tests (vitest)
```
