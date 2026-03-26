# sfcli

CLI for the Service Fusion REST API with FileMaker Data API bridge.

## Stack
- Node.js ESM (`"type": "module"`)
- Commander.js for CLI, Axios for HTTP, vitest for tests

## Commands
- `npm test` — run tests
- `node bin/sfcli.js` — run CLI locally

## Conventions
- All source in `src/`, tests in `tests/` mirroring src structure
- API wrappers in `src/api/`, commands in `src/commands/`
- Output formatting via `src/utils/output.js` (table/json/csv/quiet)
- Tokens stored encrypted at `~/.sfcli/tokens.json`
- Config at `~/.sfcli/config.json` via `conf` library

## Service Fusion API Notes (discovered via testing)
- Response shape: `{ items: [...], _expandable: [...], _meta: { totalCount, pageCount, currentPage, perPage } }`
- `perPage` is fixed at 10 by the API — `per_page` query param is ignored
- Pagination via `?page=N`
- Customer contacts/locations are **nested** — use `?expand=contacts,contacts.phones,contacts.emails,locations`
- No server-side text search (`?q=` is ignored) — search is client-side (fetch all, filter)
- Jobs support `filters[status]=<status>` for server-side filtering
- Technicians endpoint is `/techs` (not `/technicians`)
- Equipment is nested under customers: `/customers/{id}/equipment`
- Invoices have `customer` as a string field (customer name), not an object
- Jobs/estimates have inline address fields: `city`, `state_prov`, `postal_code`
- Use `scripts/api-diagnostic.js` to test API behavior
