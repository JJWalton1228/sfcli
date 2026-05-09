# Session Handoff — 2026-04-06

## What just shipped

Pushed to `development`:

- `801c618` feat: incremental FM→SF push, cache-aware equipment, cron next-run
- `445e3f1` chore(mapping): add fm_last_modified_field + active-tech fields

Closes JJWalton1228/sfcli#13, #14, #15, #16, #17, #18.

Test suite: **132 → 159 tests, all passing.**

## Open issues (in priority order)

1. **#20 — Replace placeholder FM field names in fm-mapping.json**
   The commit above added `fm_last_modified_field: "ModifiedTS"` to all entities and `fm_active_field: "Status"` / `fm_active_value: "Active"` to technicians. These are **placeholders** matching a typical FM convention — they need to be edited to match the production FileMaker layout field names before the cron is enabled. Until then, push falls back to fetching all FM records (safe but inefficient). Verification: `sfcli sync push <entity> --since-last-sync --dry-run` should report a plausible record count; 0 means the field name is wrong.

2. **#19 — Review and land in-progress `sfcli ask` AI command**
   Substantial uncommitted work in the working tree (not pushed):
   - `src/ai/` (6 files: provider/claude/ollama/executor/prompt/schema)
   - `src/commands/ask.js`
   - `tests/ai/` (6 test files, ~54 tests, all passing)
   - Modifications to `README.md` (~90 lines), `package.json` (+@anthropic-ai/sdk), `src/index.js` (registers ask command)
   These have been deliberately **left untouched** in the working tree pending review. Memory notes `project_ask_repl.md` and `project_modular_prompts.md` describe follow-up work that depends on this landing first.

## Working tree state at handoff

```
M README.md           (#19 — ask docs)
M package.json        (#19 — anthropic sdk)
M package-lock.json   (#19 — lockfile)
M src/index.js        (#19 — register ask)
?? src/ai/            (#19 — provider modules)
?? src/commands/ask.js (#19 — command)
?? tests/ai/          (#19 — tests)
```

Everything else is committed and pushed.

## Architectural notes for next session

### New shared modules (committed)

- **`src/cache/refreshers.js`** — `refreshEntity(client, db, entity, { onProgress })` is the canonical way to refresh a cache entity from the SF API. Used by both `sfcli cache refresh` and the post-sync auto-refresh in `sfcli sync push`. `ENTITY_NAMES` is the canonical entity list. Equipment iterates customers (requires customers cache to be warm first).

- **`src/filemaker/query-builder.js`** — `buildFmPushQuery({ entityType, mapping, sinceDate, fiveYearWindow, now })` returns a FileMaker `_find` query array (or null = "fetch all"). Pure function, fully unit-tested. Filter rules:
  - Technicians: active filter only (no five-year window per PRD).
  - All other entities: `sinceDate` overrides `fiveYearWindow`; both require `fm_last_modified_field`.
  - `fiveYearsAgoIso(anchor)` exported separately for testability.

### Modified push engine

`src/filemaker/sync-engine.js` `push()` now:
- Accepts `sinceDate` and `fiveYearWindow` options.
- Calls `fm.find()` with the query-builder output when filters apply, falls back to `getAllRecords()` otherwise.
- Resolves `{field}` placeholders in `sf_endpoint` (used by equipment's `/customers/{customer_id}/equipment`). Consumed placeholder fields are stripped from the request body — see `resolveEndpoint()` helper at the bottom of the file.

### Sync command (`src/commands/sync.js`)

- New flags on `sync push`: `--since-last-sync` (reads `last_push` from `~/.sfcli/sync-status.json` per entity), `--five-year-window`.
- Priority: explicit `--since` > `--since-last-sync` > none.
- Post-sync cache refresh: iterates entities in PRD order, calls `refreshEntity` for each successfully-pushed entity. The `SYNC_TO_CACHE_ENTITY` map handles the `technicians` → `techs` naming mismatch.
- `ENTITY_TYPES` reordered to PRD spec: customers → technicians → equipment → jobs → estimates → invoices.

### Cron scheduler (`src/utils/cron-scheduler.js`)

- `buildCronEntries` now emits `sync push all --since-last-sync --notify`.
- New `computeNextRun(now)` — DST-aware via `Intl.DateTimeFormat`, returns `{ iso, hourPacific }` for the next 6am or 6pm Pacific slot.
- New `isPacificTimezone(tz)` — accepts `America/Los_Angeles`, `US/Pacific`, `PST8PDT`.
- `sync schedule enable` shows TZ warning + next run; `sync schedule status` shows next run.

### Cache-aware equipment (`src/commands/equipment.js`)

- Both `list` and `search` now use `createCacheAwareSearch` with `staleWhileRevalidate: true`.
- Filters by `customer_id` (from the required `--customer` flag) at the cache layer.
- `--no-cache` bypasses cache (matches the global `--cache` flag inversion used by other entity commands).
- Note: equipment cache freshness is entity-wide, not per-customer. If user A's equipment was just refreshed, querying user B's may return empty until the next refresh. This is a known limitation — see "future work" below.

## Future work / known limitations

- **Per-customer equipment cache freshness** — current model treats equipment cache as a single bucket. A query for customer X that hits a "fresh" cache populated only by customer Y will return zero results. Acceptable today because the typical flow is bulk `cache refresh equipment`; could be revisited if it bites in practice.
- **FTS5 vs LIKE indexing** — `src/utils/cache.js` uses `searchable_text LIKE` with an index, not SQLite FTS5 as the original PRD #1 suggested. Behavior is equivalent for current user stories. Migration is straightforward if perf becomes an issue.
- **Slack notifier doesn't include "check logs" hint on failure** — `formatSyncFailure` is minimal. PRD #1 suggested including a hint. Low priority.
- **Performance rollout #12 still open** — concurrent pagination + SWR pattern from #13 should be applied to the remaining cached entities. Not part of this batch.

## Suggested next tasks

1. Get the real FM field names from the operator and resolve #20.
2. Triage #19 — decide ship-now vs draft-PR for the AI command work.
3. Consider #12 (perf rollout) once #20 is verified end-to-end against production FM.

## Memory notes

The user's auto-memory has two pointers worth being aware of:
- `project_ask_repl.md` — future REPL mode for `sfcli ask`
- `project_modular_prompts.md` — future composable prompt fragments

Both depend on #19 landing first.
