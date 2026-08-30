# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

# @rific/sync

Generic SQLite sync engine for Expo — schema management, upsert/delete, and cursor-based sync state persistence, built against `expo-sqlite`'s `SQLiteDatabase` shape out of the box.

Part of the `@rific`/`@tastic` package ecosystem. Published at https://www.npmjs.com/package/@rific/sync.

## Commands

```bash
npm run build        # tsup, outputs CJS + ESM + types to dist/
npm run build:watch  # tsup --watch
npm run lint         # ESLint
npm run fix          # ESLint --fix
npm test             # Jest (19 tests)
npm run test:watch   # Jest --watchAll
npm run typecheck    # TypeScript type check (tsc --noEmit)
npm run verify       # lint + test + typecheck + build, in that order
```

Always run `npm run lint` before finishing any task.

## Release

Tag-based, using npm trusted publishing (OIDC, no token required):

```bash
npm run release:patch   # npm version patch && git push --follow-tags (or release:minor / release:major)
```

`preversion` runs `npm run verify` (lint + test + typecheck + build) first. `prepublishOnly` runs `build`. The `publish.yml` workflow fires on `v*` tags and delegates to the shared reusable workflow (`infinitetoken/Workflows/.github/workflows/npm-publish.yml@v1`) with `id-token: write` permission for OIDC trusted publishing.

## Architecture

```
src/
  index.ts       - all public exports
  types.ts       - SQLiteValue, ColumnType, Database (minimal execAsync/runAsync/getFirstAsync interface), ChannelConfig<TRecord, TRow>
  SyncEngine.ts  - the engine: register/init/push/remove/getCursor/setCursor
  __tests__/
    SyncEngine.test.ts
```

`SyncEngine` holds a `Map<string, ChannelConfig>` of registered channels. `init()` creates a `_sync_state` table (`channel TEXT PRIMARY KEY, cursor TEXT, syncedAt TEXT`) plus one table per registered channel, built from that channel's `schema` map with the configured (or default `'id'`) `primaryKey` column marked `PRIMARY KEY`. `push()` runs a channel's optional `transform` over the incoming record, then `INSERT OR REPLACE`s the resulting row. `remove()` deletes by primary key. `getCursor`/`setCursor` read and upsert a channel's row in `_sync_state`, stamping `syncedAt` with `new Date().toISOString()` on every `setCursor` call. Unknown channel names throw `` `[expo-sync] Unknown channel: "${name}"` `` from `push`/`remove`.

## Public API

From `src/index.ts`:

- `SyncEngine` — the sync engine class (`register`, `init`, `push`, `remove`, `getCursor`, `setCursor`)
- `ChannelConfig`, `ColumnType`, `Database`, `SQLiteValue` (types only)

## Testing

- Framework: Jest via `@infinitetoken/jest-config/node` (Node test environment, not jsdom)
- No `__mocks__` directory — the `Database` interface is faked inline per-test with `jest.fn()`
- 19 tests, 1 suite (`src/__tests__/SyncEngine.test.ts`), covering `register`/`init`/`push`/`remove`/`getCursor`/`setCursor`
- 100% coverage (statements/branches/functions/lines) on `SyncEngine.ts`; the preset's enforced threshold is 70% across all four metrics

## Code Style

Enforced by ESLint + Prettier, run `npm run lint` before finishing any task.

**Prettier config:**
- Single quotes, JSX single quotes
- No semicolons
- No trailing commas
- Print width: 1000 (effectively disabled)

**ESLint rules (warnings unless noted):**
- `simple-import-sort` — imports and exports must be sorted
- `no-console` — no console statements
- `@typescript-eslint/no-unused-vars` — `varsIgnorePattern`/`argsIgnorePattern`/`caughtErrorsIgnorePattern` all `'^_'` (unused vars/args/caught errors prefixed `_` are allowed)
- `@typescript-eslint/no-require-imports` — off
- `package-json/order-properties`, `package-json/sort-collections` — on `package.json` itself
- `@typescript-eslint/no-explicit-any` — off inside `__tests__`/`__mocks__` files

`eslint.config.cjs` and `jest.config.cjs` are both bare `require()`s of the shared `@infinitetoken/eslint-config`/`@infinitetoken/jest-config` presets — no local overrides. `tsconfig.json` is a bare `extends` of `@infinitetoken/tsconfig/node` + `include` — no local overrides either.

`SyncEngine`'s two fields (`db`, `channels`) are declared `declare private readonly` rather than plain `private readonly`, and both are assigned inside the constructor rather than via a class-level initializer — this is load-bearing, not stylistic. Without `declare`, TypeScript emits these as real ES2022 native class-field declarations once the target is `esnext` (the fleet default): a bare `db;` line, and `channels`'s initializer hoisted out of the constructor into its own field declaration — both change tsup's bundled output. This used to be worked around with a local `target: "ES2020"` override (downleveling away the native-class-field behavior entirely), which fixed the symptom but not the cause, and meant this package alone diverged from the fleet's `esnext` default. `declare` fixes the actual cause: it tells TypeScript these are type-only annotations with no field-declaration semantics of their own, so the constructor assignment is the only thing that ever creates the property, at any target — confirmed byte-identical `dist/` output between the old `ES2020`-targeted build and the current `esnext` one.
