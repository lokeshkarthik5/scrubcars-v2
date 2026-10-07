# Detlio

Turborepo monorepo on bun workspaces.

```
apps/users      detlio.com          customer app        :3000
apps/vendors    vendor.detlio.com   vendor portal       :3001
apps/admin      admin.detlio.com    operations panel    :3002
apps/server     api.detlio.com      Hono API            :8080

packages/core   @repo/core          API client, types, stores, domain helpers
packages/ui     @repo/ui            shared components + globals.css
packages/typescript-config
packages/eslint-config
```

## Getting started

Requires **bun 1.3.x** — pinned in `packageManager`, and deliberately not
newer. Vercel's build image ships bun 1.3.14, which cannot read the
`lockfileVersion: 2` lockfile that bun 1.4 writes; it fails the install with
"Unknown lockfile version" and silently resolves fresh, so the committed
lockfile stops meaning anything. Bun older than 1.1.39 is also out — it writes
a binary `bun.lockb` that Turborepo cannot parse.

```bash
curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.14"
```

```bash
bun install
cp apps/server/.env.example apps/server/.env     # fill in DATABASE_URL etc.
for a in users vendors admin; do cp apps/$a/.env.example apps/$a/.env; done
bun run dev
```

`bun run dev` starts all four. Individually: `bun run dev:api`, `dev:users`,
`dev:vendors`, `dev:admin`.

## How the pieces fit:::

**Routing.** Each frontend is its own deployment and serves its routes at their
real public paths — a directory under `app/` *is* the URL. There is no
middleware rewriting `/vendor/*` or `/admin/*`; if you find yourself adding a
path map, something has gone wrong.

**API access.** The three frontends call `api.detlio.com` directly. This works
without weakening the session cookies because all four hosts share the
registrable domain `detlio.com`, which makes the requests same-site — the
API's `SameSite=Lax` cookies are still sent. Any new origin must be added to
`corsOrigin` in `apps/server/src/lib/env.ts`.

Preview deployments are the exception: `*.vercel.app` is on the Public Suffix
List, so a preview URL is a *different site* and those cookies would be
dropped. Each app therefore keeps a proxy at `app/api/v1/[...path]/route.ts`.
Point Preview at it with `NEXT_PUBLIC_API_URL=/api/v1` and
`BACKEND_URL=https://api.detlio.com`; Production uses the direct URL.

**Packages.** `packages/core` must never import from `packages/ui`. Surface
specific code belongs in its app; `packages/*` is for what two or more apps use.

## Commands

```bash
bun run build          # turbo run build
bun run typecheck      # tsc --noEmit everywhere
bun run lint
bun run migrate:status # read-only; production is migrated by CI, see Deploying
```

## Deploying

Four Vercel projects, each with **Root Directory** set and *Include files
outside the Root Directory* enabled so `packages/` is available at build time:

| Project | Root Directory | Domain |
|---|---|---|
| `scrubcars-v2` | `apps/server` | `api.detlio.com` |
| `detlio-users` | `apps/users` | `detlio.com` |
| `detlio-vendors` | `apps/vendors` | `vendor.detlio.com` |
| `detlio-admin` | `apps/admin` | `admin.detlio.com` |

Set Ignored Build Step to `bunx turbo-ignore` so a change in one app does not
redeploy the others.

`apps/server` keeps `framework: null` and an empty build command — see
`apps/server/vercel.json`. Do not set a framework preset on it.

### Releasing the API

The API is not deployed by Vercel's Git integration on `main`
(`git.deploymentEnabled.main: false` in `apps/server/vercel.json`); preview
deployments are unaffected, and the frontends still deploy from Git. Instead
`.github/workflows/release-api.yml` runs after E2E passes on `main`:

1. **Gate** — E2E passed on a push, and the commit is still `main`'s tip.
2. **Migrate** — `migrate.sh check`, then `migrate`. Each migration applies
   atomically; a failure stops the release before anything is deployed.
3. **Build and deploy** — `vercel build` in CI, then `vercel deploy --prebuilt
   --prod`.

So the schema always lands before the code that needs it. That covers additive
changes only: to drop or rename something the running code uses, ship a release
that stops using it first, then one that drops it.

Needs these repository secrets (Settings → Secrets and variables → Actions):
`DIRECT_URL` (the Supabase **session pooler** URL — the direct
`db.*.supabase.co` host is IPv6-only and unreachable from GitHub runners),
`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. They are repository
rather than environment secrets because the repo is private on GitHub Free,
where environment secrets and required reviewers are unavailable; any workflow
in the repo can read them, so treat new workflows as having production access.

To re-run a release — after fixing a failed migration, say — run the workflow
manually on `main`.

Migration files are linted on every pull request that touches them
(`migrations-lint.yml`; locally `bun run --filter server migrate:lint`):
numbers run `0000`, `0001`, … with no gaps or duplicates, the journal matches
the files, and nothing breaks the per-file transaction (no `BEGIN`/`COMMIT`,
`CONCURRENTLY` or `VACUUM`). Each migration waits at most 5s for a table lock
(`MIGRATE_LOCK_TIMEOUT`) and rolls back rather than stall live traffic.
