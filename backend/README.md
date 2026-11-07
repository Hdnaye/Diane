# Diane back-end

[PocketBase](https://pocketbase.io) (pinned version, see
`scripts/pocketbase-release.js`) extended with JS hooks.

## Prerequisites

- Linux x86_64 (dev) or arm64 (Raspberry Pi, 64-bit OS).
- Node.js >= 18.18 and npm (tooling only: PocketBase itself is a single binary).

## Commands

```sh
npm install
npm run setup   # download PocketBase into bin/ and generate pb_data/types.d.ts
npm run dev     # run PocketBase on http://127.0.0.1:8090 (admin UI: /_/)
npm test        # unit + integration tests (needs `npm run setup`)
npm run lint
npm run typecheck
npm run format  # or format:check
```

Extra flags are forwarded to PocketBase: `npm run dev -- --http=0.0.0.0:8090`.

## Layout

- `pb_hooks/` — PocketBase JS hooks (`*.pb.js`). They run in PocketBase's
  embedded JS engine, **not Node**: no `require`, `fs`, `process`... (enforced
  by ESLint). Typed through `pb_data/types.d.ts`.
- `pb_migrations/` — PocketBase JS migrations.
- `src/` — pure business logic, unit tested.
- `tests/unit/`, `tests/integration/` — Vitest. Integration tests run against
  a throwaway PocketBase instance (free port, temporary data dir, test
  superuser) started by `tests/integration/pocketbase.global-setup.ts`.
- `bin/` and `pb_data/` are git-ignored.
