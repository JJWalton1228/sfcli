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
