## Problem Statement

The sfcli tool currently makes live API calls for every search and list operation. With 7,000+ customers and 53,000+ jobs, a simple customer search requires fetching all records across hundreds of paginated API requests (10 records per page, fixed by the Service Fusion API). This makes searches painfully slow for daily operational use.

Additionally, the FileMaker database serves as the primary data entry point for field operations, but there is no automated mechanism to push updates from FileMaker into Service Fusion. Staff must manually trigger syncs or data falls out of date. A scheduled, automated sync from FileMaker to Service Fusion is needed to keep both systems consistent without manual intervention.

## Solution

Implement two interconnected capabilities:

1. **Local SQLite cache** that stores Service Fusion entity data locally, enabling instant search and lookup without hitting the API. The cache refreshes on a 12-hour cycle aligned with the sync schedule.

2. **Scheduled FM → SF sync cron** that runs twice daily (6am and 6pm PST/PDT), pushing updates from FileMaker into Service Fusion for customers, jobs, estimates, invoices, and active technicians. The sync triggers a cache refresh upon completion and sends status notifications to Slack.

## User Stories

1. As a CLI user, I want customer searches to return results in under 1 second, so that I can quickly look up account information during phone calls.
2. As a CLI user, I want job lookups to be instant from a local cache, so that I don't wait for hundreds of API pages to load.
3. As a CLI user, I want to run `sfcli cache refresh` to pre-populate the local cache on demand, so that I can warm the cache before a busy workday.
4. As a CLI user, I want to run `sfcli cache refresh customers` to refresh only a specific entity, so that I can update just what I need without waiting for all entities.
5. As a CLI user, I want the cache to automatically refresh after each FM → SF sync completes, so that my local data always reflects the latest pushed changes.
6. As a CLI user, I want cached search results to include phone, email, city, and state from nested contacts and locations, so that I see the same rich data as live API searches.
7. As a CLI user, I want to search cached customers by any contact name (not just the primary), so that I can find accounts even when I only know a secondary contact.
8. As a CLI user, I want to search cached customers by any location address, so that I can find accounts by secondary site locations.
9. As a CLI user, I want the cache to store raw nested data (all contacts, all locations) alongside flattened fields, so that detailed lookups are available without API calls.
10. As a CLI user, I want cache staleness to be transparent — if data is older than 12 hours, the CLI should warn me or auto-refresh, so that I don't unknowingly work with stale data.
11. As an operations manager, I want FileMaker changes to automatically sync to Service Fusion twice daily, so that the field team's data entry is reflected in SF without manual intervention.
12. As an operations manager, I want the sync to only push records modified since the last sync (incremental sync using FileMaker's last_modified field), so that syncs are fast and efficient.
13. As an operations manager, I want the sync to cover customers, jobs, estimates, invoices, equipment, and active technicians, so that all operational data stays current.
14. As an operations manager, I want customer and job syncs limited to records from the last 5 years (by last_modified), so that we don't waste time syncing ancient inactive records.
15. As an operations manager, I want estimate and invoice syncs limited to records from the last 5 years (by last_modified), so that sync scope is reasonable.
16. As an operations manager, I want only active technicians synced (regardless of date), so that we don't push inactive/terminated tech records.
17. As an operations manager, I want the sync schedule managed via a CLI command (`sfcli sync schedule --enable` / `--disable`), so that I don't have to manually edit crontab.
18. As an operations manager, I want the cron to run at 6am and 6pm Pacific time (PST/PDT), so that data is fresh at the start and middle of each business day.
19. As an operations manager, I want a Slack notification in #sfcli-sync on every sync completion, showing counts of created, updated, and errored records per entity, so that I have visibility into sync health.
20. As an operations manager, I want a Slack notification on sync failure with error details, so that I can investigate and resolve issues promptly.
21. As an operations manager, I want sync failures logged to a local log file with full error details, so that I can diagnose issues even if Slack is down.
22. As a CLI user, I want `sfcli sync schedule --status` to show whether the cron is active and when the next sync is, so that I can verify the schedule is working.
23. As a CLI user, I want the Slack webhook URL to be configurable via `sfcli config set slack_webhook_url <url>`, so that I can set up notifications without editing config files.
24. As a CLI user, I want a `sfcli cache status` command that shows cache age per entity and record counts, so that I know how fresh my local data is.
25. As a CLI user, I want the cache to be usable offline — if the API is unreachable, searches should still work from the local cache with a warning, so that I can work during network outages.
26. As a CLI user, I want `sfcli cache clear` to wipe the local cache, so that I can force a clean rebuild if data gets corrupted.

## Implementation Decisions

### SQLite Cache Layer

- **Database location**: `~/.sfcli/cache.db`
- **Dependency**: `better-sqlite3` (synchronous, fast, no native compilation issues on macOS with Node 18+)
- **Schema design**: One table per entity type (customers, jobs, estimates, invoices, techs). Each table stores:
  - The entity's SF ID as primary key
  - Flattened searchable fields as indexed columns (customer_name, city, state_prov, status, etc.)
  - A `raw_json` TEXT column containing the full API response (including nested contacts, locations, and all expandable data)
  - A `cached_at` TIMESTAMP column for staleness checks
- **Customer table** includes additional columns extracted from nested data for searchable access: all contact names (first/last), all phone numbers, all emails, all location cities/states — stored in auxiliary junction tables or as searchable text fields
- **Cache TTL**: 12 hours (aligned with 6am/6pm sync schedule). Configurable via `defaults.cache_ttl_seconds` in config (default: 43200)
- **Cache freshness behavior**: When a command queries an entity:
  1. If cache exists and is within TTL → use cache (instant)
  2. If cache is stale or missing → fetch from API, update cache, return results
  3. If API is unreachable and cache exists (even stale) → use stale cache with warning
- **Search implementation**: SQLite FTS5 (full-text search) for text queries, standard indexes for filtered lookups (status, customer_id, date ranges)
- **The cache module exposes a simple interface**: `get(entity, id)`, `search(entity, query, filters)`, `refresh(entity)`, `clear(entity?)`, `status()`
- **Existing API wrappers are modified** to check cache first, falling back to live API. The `--no-cache` flag bypasses the cache for any command.

### FM → SF Sync Cron

- **Direction**: One-way push only (FileMaker → Service Fusion). No SF → FM pull.
- **Entities synced**: Customers, Jobs, Estimates, Invoices, Technicians, Equipment
- **Date window**: Customers, Jobs, Estimates, Invoices, Equipment — last 5 years by FileMaker's `last_modified` field. Technicians — all active techs regardless of date.
- **Incremental sync**: Uses FileMaker's `last_modified` timestamp field compared against the last sync timestamp stored in `~/.sfcli/sync-status.json`. Only records modified since last sync are pushed.
- **Conflict resolution**: Not needed — FileMaker is read-only source of truth, SF is the target. FM data always wins.
- **Sync order**: Customers first (since jobs/estimates/invoices/equipment reference customer IDs), then Techs, then Equipment, then Jobs, Estimates, Invoices.
- **Post-sync action**: Automatically runs `cache refresh` for all synced entities so the local SQLite cache reflects the just-pushed data.
- **Equipment sync note**: Equipment is a nested resource in the SF API (`/customers/{id}/equipment`). The sync engine pushes equipment records by looking up the parent customer ID from the FM mapping, then calling the customer-scoped equipment endpoint. The FM equipment layout must include a customer reference field.

### Cron Management

- **CLI command**: `sfcli sync schedule --enable` writes two crontab entries (6am and 6pm Pacific). `--disable` removes them. `--status` shows current state.
- **Crontab entries** invoke `sfcli sync push all --since-last-sync --notify` with appropriate environment setup (PATH, node path).
- **Timezone handling**: Crontab entries use the system timezone. The CLI validates that the system timezone is America/Los_Angeles (or compatible) and warns if not.
- **The `--notify` flag** triggers Slack webhook notification on completion or failure.

### Slack Notifications

- **Webhook URL**: Stored in config at `slack.webhook_url`, set via `sfcli config set slack_webhook_url <url>`
- **Slack app/webhook setup**: User creates an Incoming Webhook in their Slack workspace for the #sfcli-sync channel. The PRD includes setup instructions.
- **Success message format**: Summary with entity-level counts (created, updated, skipped, errors) and total duration.
- **Failure message format**: Error details, which entity failed, stack trace summary, and instructions to check logs.
- **Implementation**: Simple HTTPS POST to the webhook URL using axios (already a dependency). No additional Slack SDK needed.

### Failure Handling

- **Sync failures are logged** to `~/.sfcli/sync-log.json` (existing mechanism) with full error details.
- **Partial failures**: If one entity fails, the sync continues with remaining entities. The Slack notification reports which entities succeeded and which failed.
- **Network failures**: Retry 3 times with exponential backoff (reuses existing client retry logic). If all retries fail, log error and send Slack failure notification.
- **FileMaker connection failure**: If FM token acquisition fails, abort sync early and notify via Slack.

## Testing Decisions

Good tests verify external behavior through the public interface, not implementation details. Tests should be resilient to refactoring — if the internal implementation changes but the behavior stays the same, tests should still pass.

### Modules to test:

1. **SQLite cache module** — Test the cache interface: `refresh()` populates data, `search()` returns correct results, `get()` retrieves by ID, stale cache triggers refresh, `clear()` wipes data, `status()` returns correct metadata. Mock the API client to avoid live calls.

2. **Cache-aware API wrappers** — Test that commands check cache first when fresh, fall back to API when stale, and handle API-down-with-stale-cache gracefully.

3. **Sync cron push logic** — Test that the push flow: queries FM for records modified since last sync, maps fields correctly, calls SF create/update APIs, updates sync status timestamp. Mock both FM and SF clients.

4. **Slack notification module** — Test that success and failure messages are formatted correctly and POST to the webhook URL. Mock the HTTP call.

5. **Cron schedule management** — Test that `--enable` produces valid crontab entries with correct times, `--disable` removes them, `--status` reports accurately. Mock the crontab read/write.

### Prior art:
- `tests/commands/customers.test.js` — pattern for mocking API responses with nock and testing command output
- `tests/api/client.test.js` — pattern for testing HTTP client behavior (retry, auth)

## Out of Scope

- **Writing to FileMaker** — FM is read-only; no SF → FM pull or FM record creation/updates from the CLI
- **Real-time equipment inventory tracking** — Equipment syncs as a batch operation alongside other entities, not as a real-time inventory system
- **Interactive REPL improvements** — No changes to the REPL mode
- **Report engine changes** — No modifications to report templates or formatting
- **SF → FM pull in the cron** — The scheduled sync is push-only (FM → SF)
- **Real-time sync / webhooks** — Only scheduled batch sync, no event-driven sync
- **Multi-machine sync coordination** — The cron runs on a single machine; no distributed locking or coordination
- **Historical data migration** — The 5-year window applies to ongoing sync; initial backfill of historical data is a separate effort if needed

## Further Notes

- The SQLite cache replaces the unused `cache_ttl_seconds: 300` config setting with a meaningful default of `43200` (12 hours).
- The existing `sync-status.json`, `sync-log.json`, and `sync-conflicts.json` files continue to function as-is. A future enhancement could migrate these into the SQLite database for unified storage.
- The `better-sqlite3` package is synchronous by design, which is ideal for a CLI tool — no async overhead for simple cache lookups.
- Slack Incoming Webhooks are free and require no OAuth or bot setup — just a webhook URL from the Slack app configuration page.
- The 5-year window is a rolling window — each sync considers records with `last_modified` within the last 5 years from the current date, not a fixed start date.
- Active technician filtering depends on a field in the FileMaker technician layout that indicates active/inactive status. The field name should be configurable in `fm-mapping.json`.
