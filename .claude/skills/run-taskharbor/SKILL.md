---
name: run-taskharbor
description: Build, launch, and drive the TaskHarbor (아르벤팩토리) full-stack web app — start the dev server, smoke-test the SPA + tRPC API, screenshot/verify reviewer, business (client), and admin portals. Use when asked to run, start, serve, smoke-test, or verify TaskHarbor.
---

# Run TaskHarbor (아르벤팩토리)

Full-stack web app: **Express + Vite (one port) + tRPC v11 + Drizzle/MySQL**,
React 19 client with `wouter` routing. `pnpm dev` runs `tsx watch` on
`server/_core/index.ts`, which serves the Vite-built SPA **and** the tRPC API
from **port 3000**.

There is no separate frontend port and no Electron/native shell — it's a
browser app. You drive it over HTTP: the committed driver
`.claude/skills/run-taskharbor/driver.mjs` fetches the SPA shell, checks the
client routes resolve, hits a public tRPC query (proves API + DB are alive),
and runs an optional login → authed-query flow.

All paths below are relative to the unit root (`taskharbor/`).

## Prerequisites

- Node 24, pnpm 10 (repo pins `pnpm@10.4.1` via `packageManager`).
- A `.env` at the unit root with `DATABASE_URL` (MySQL) — already present in
  this checkout. Without it the SPA still serves, but every API/auth check
  returns empty / fails (see Gotchas).

```bash
node -v   # v24.x
pnpm -v   # 10.x
```

## Build / install

```bash
pnpm install
```

(Production build is `pnpm build` → `vite build` + `esbuild` bundle into
`dist/`; not needed to drive the app and not exercised by this skill.)

## Run — agent path (do this)

1. Launch the dev server (backed by `.claude/launch.json`, name
   `TaskHarbor Dev Server`, port 3000):

```bash
pnpm dev      # serves SPA + API on http://localhost:3000
```

2. In another shell, drive it with the committed smoke driver:

```bash
node .claude/skills/run-taskharbor/driver.mjs
```

Verified output ends with `PASS — all checks green`. It checks:
`GET /` serves the SPA shell; client routes `/afreviewer/login`,
`/client/login`, `/admin`, `/home` return 200; the public tRPC query
`campaign.listPreview` returns an array.

3. To exercise a real **login → authenticated query** round-trip, pass
   reviewer credentials (any existing reviewer account):

```bash
REVIEWER_ID=rv_test01 REVIEWER_PW=test123 node .claude/skills/run-taskharbor/driver.mjs
```

This adds: `auth.login` issues a session cookie, and `auth.me` returns the
logged-in user with `role=user`. Override the target with
`BASE=http://localhost:3000`.

### Hand-driving the tRPC API (when the driver isn't enough)

tRPC uses `httpBatchLink` + superjson. **Queries** are GET, **mutations** are
POST, and the batch wrapper is always `{"0":{"json": <input>}}`:

```bash
# public query (GET)
curl -s "http://localhost:3000/api/trpc/campaign.listPreview?batch=1&input=%7B%7D" | head -c 200

# login (mutation, POST) → capture cookie → authed query
JAR=$(mktemp)
curl -s -c "$JAR" -X POST "http://localhost:3000/api/trpc/auth.login?batch=1" \
  -H "Content-Type: application/json" \
  -d '{"0":{"json":{"loginId":"rv_test01","password":"test123"}}}'
curl -s -b "$JAR" "http://localhost:3000/api/trpc/auth.me?batch=1&input=%7B%7D" | head -c 200
```

For pixel/DOM verification of UI changes, point a browser automation tool
(`chromium-cli`, Playwright, or the host's preview tooling) at
`http://localhost:3000` and the route under test. The four portals:

| Path | Portal |
|---|---|
| `/` | public marketing landing |
| `/afreviewer/login`, `/afreviewer/signup` | reviewer (role `user`) |
| `/client/login`, `/client/signup`, `/client/dashboard` | business/seller |
| `/admin`, `/admin/consulting`, `/admin/settlement` | admin |

## Run — human path

`pnpm dev`, then open `http://localhost:3000` in a browser. Same server as the
agent path; the only difference is you click instead of curl.

## Test

```bash
pnpm test     # vitest run
```

Sanity check only — not the verification path. In this container it reports
**16 passed / 5 failed**; the failures are pre-existing workflow-state tests in
`server/workflow.test.ts` (they assert an older participation state machine),
not a launch problem.

## Gotchas (battle scars)

- **Backend changes need a server restart.** `tsx watch` does not reliably pick
  up new tRPC procedures or routers. After editing `server/routers*.ts` or
  `server/db.ts`, a new endpoint returns `No procedure found on path "..."`
  until you **restart `pnpm dev`**. The client (Vite HMR) reloads fine; the
  server does not.
- **DB migrations are lazy and run once per process.** `getDb()` runs the
  `ALTER TABLE` / `CREATE TABLE IF NOT EXISTS` block on first connect, guarded
  by a module-level `_migrated` flag. A newly-added table/column only appears
  after a **fresh server start** — not on HMR.
- **A 200 from curl ≠ the route exists.** Any non-`/api` path returns the SPA
  shell (HTTP 200); `wouter` resolves the route client-side, and unknown paths
  render a 404 *component* while still returning 200. Bare `/afreviewer` and
  `/client` are explicit redirect routes to their `/login`; other unmatched
  paths fall through to the NotFound component.
- **No `DATABASE_URL` → silent empty API.** `server/db.ts` no-ops when the env
  var is unset: the SPA serves and routes are 200, but queries return
  `[]`/`undefined` and login fails. If `[2]`/`[3]` fail but `[1]` passes, check
  `.env`.
- **Portals are role-locked at login.** `/afreviewer/login` rejects `business`
  accounts and `/client/login` rejects `user` accounts (logs them back out with
  a toast). Use a reviewer account for the reviewer portal and a business
  account for the client portal, or auth will appear to "fail."

## Troubleshooting

| Symptom | Fix |
|---|---|
| `driver.mjs` exits 1 at `[1]` with "is the dev server up?" | Start `pnpm dev`; wait for it to bind port 3000. |
| `No procedure found on path "..."` | Restart `pnpm dev` — backend didn't hot-reload the new router. |
| New table/column missing in queries | Restart `pnpm dev` — lazy migration only runs on a fresh process. |
| `[2]`/`[3]` fail, `[1]` passes | `.env` missing/!`DATABASE_URL`; DB unreachable. |
| Login returns success but portal "rejects" you | Wrong portal for the account role (see Gotchas). |
