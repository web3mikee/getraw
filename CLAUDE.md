# dlpx

Fast media downloader CLI — yt-dlp replacement built natively in Bun/TypeScript.

## Bun

Default to using Bun instead of Node.js.

- `bun <file>` instead of `node <file>`
- `bun test` instead of jest/vitest
- `bun build` instead of webpack/esbuild
- `bun install` instead of npm/yarn/pnpm install
- `bunx <package>` instead of `npx`
- Bun automatically loads .env, no dotenv needed

### Bun APIs

- `Bun.file()` over `node:fs` readFile/writeFile
- `Bun.$` for shell commands (instead of execa)
- `bun:sqlite` for SQLite (not better-sqlite3)
- `bun:test` for testing
- `WebSocket` is built-in (not ws)

## Git

- One-liner commit messages ONLY
- NO co-authored-by lines ever
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`
- No multi-line commit bodies

## Code Style

- TypeScript strict mode, no `any` types
- No unnecessary comments or docstrings
- No console.log in production code (use logger)
- Named imports only, no wildcard *

## Architecture

- `src/cli/` — CLI entry point and options
- `src/core/` — orchestrator, types, format sorter
- `src/extractors/` — site-specific extractors (all implement BaseExtractor)
- `src/downloaders/` — protocol handlers (HTTP, HLS, DASH)
- `src/postprocessors/` — FFmpeg wrappers
- `src/networking/` — HTTP client, cookies, TLS
- `src/plugins/` — plugin loader and types
- `src/utils/` — shared helpers
- `tests/` — unit, integration, e2e tests
- `tools/` — dashboard and dev utilities

## Source of Truth

1. EXTRACTOR.md (in parent dir) — project plan, do not modify
2. src/core/types.ts — shared interfaces, changes need QA approval
3. STATUS.md — real-time progress
4. package.json — deps and scripts
5. Git main branch — merged truth
