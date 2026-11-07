# Diane back-end

[PocketBase](https://pocketbase.io) (pinned version, see
`scripts/pocketbase-release.js`) extended with JS hooks.

## Prerequisites

- Linux x86_64 (dev) or arm64 (Raspberry Pi, 64-bit OS).
- Node.js >= 22 (LTS, see `.nvmrc`; `engines` requires >= 22.13) and npm
  (tooling only: PocketBase itself is a single binary).

## Commands

```sh
npm ci
npm run setup     # download PocketBase into bin/ and generate pb_data/types.d.ts
npm run dev       # run PocketBase on http://127.0.0.1:8090 (admin UI: /_/)
npm test          # unit + integration tests
npm run lint
npm run typecheck
npm run format    # or format:check
```

`npm test` and `npm run typecheck` need `npm run setup` first: integration
tests run the PocketBase binary, and the hooks typecheck uses the generated
`pb_data/types.d.ts`.

Extra flags are forwarded to PocketBase: `npm run dev -- --http=0.0.0.0:8090`.

### First superuser

On a fresh `pb_data/`, PocketBase prints an installer URL to create the first
superuser. `npm run dev` and the integration tests never let it open a
browser (PocketBase has no option for that: `scripts/no-browser.js` puts
no-op `xdg-open`/`open` commands first in its `PATH`). Open the printed URL
yourself, or create the superuser from the command line:

```sh
bin/pocketbase superuser upsert EMAIL PASSWORD --dir=pb_data
```

## Layout

- `pb_hooks/` (`*.pb.js` hooks) and `pb_migrations/` run in PocketBase's JSVM
  (goja), **not Node**: no Node modules (`fs`, `path`...), no ESM `import`,
  no `process`/`Buffer`/`__dirname`; use the PocketBase APIs (`$app`, `$os`,
  `$http`...). Typed through `pb_data/types.d.ts`.
- `pb_hooks/lib/*.cjs` — pure business logic (SMS parsing, deadlines, waiting
  list, message templates...), shared by hooks and unit tests:
  - CommonJS (`module.exports`) using neither Node nor PocketBase APIs
    (`$app`...): data in, data out. `.cjs` because `package.json` sets
    `"type": "module"`; PocketBase only loads `*.pb.js` files as hooks.
  - Hooks load it through a path rooted at `__hooks` (the JSVM resolves other
    paths against `node_modules` or the working directory), typed by a cast:

    ```js
    const { parseSmsReply } =
      /** @type {typeof import("./lib/sms-reply.cjs")} */ (
        require(`${__hooks}/lib/sms-reply.cjs`)
      );
    ```

  - Unit tests load it with `createRequire(import.meta.url)`. Lib modules
    require each other by relative path (`require("./other.cjs")`).
  - These rules are enforced by ESLint.
- `tests/unit/`, `tests/integration/` — Vitest. Integration tests run against
  a throwaway PocketBase instance (free port, temporary data dir, test
  superuser) started by `tests/integration/pocketbase.global-setup.ts`.
- `bin/` and `pb_data/` are git-ignored.
