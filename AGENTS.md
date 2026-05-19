# AGENTS.md - Lifting Club Codebase Guide

For AI coding agents working in this repository. This file describes the actual app architecture, deployment path, and operating rules for making changes safely.

## Project Overview

**Lifting Club** is a vanilla HTML/CSS/JavaScript athletic testing dashboard for athlete profiles, team overview, leaderboards, sprint analysis, strength and power views, scorecards, comparisons, testing logs, and admin data management.

- **Primary production URL:** `https://lifting-club.pages.dev`
- **Repo remote:** `origin` points at `justindepierro/BCPersonalFitnessClub`
- **Hosting:** Cloudflare Pages with Pages Functions
- **Auth:** Cloudflare Pages Functions with signed session cookies
- **Shared data:** Cloudflare Workers KV via binding `LIFTING_CLUB_KV`
- **Local source data:** `data/athletes.json`
- **Build output:** `js/app.bundle.js` and `js/app.bundle.js.map`
- **Frontend stack:** Vanilla JS modules bundled with esbuild, Chart.js from CDN, Lucide icons from CDN

The secure entry point is Cloudflare Pages. The older GitHub Pages workflow may still exist, but it should not be treated as the canonical secure deployment path because it cannot enforce the Pages Functions login gate.

## Standing User Preference

When changes are made in this repo, the normal closeout should include all of the following unless the user explicitly says not to:

1. Run verification (`npm run lint` and `npm run build` at minimum).
2. Commit the completed changes to git with a clear message.
3. Push the branch to `origin/main`.
4. Deploy to Cloudflare with `./scripts/deploy-cloudflare.sh`.
5. Smoke-check the production Cloudflare URL after deploy.

If git push or Cloudflare deploy fails because of authentication, permissions, network issues, or a Cloudflare account problem, report the exact blocker and leave the repo in a clean, ready-to-push state.

## Important Commands

```sh
npm run build
npm run lint
npm run dev:cloudflare
npm run deploy:cloudflare
./scripts/deploy-cloudflare.sh
```

`npm run build` must be run after changing any source file under `js/` that feeds `js/main.js`.

## File Structure

```text
index.html                 Single-page dashboard shell and tab markup
css/styles.css             Full dashboard styling, responsive layout, auth role hiding
data/athletes.json         Static fallback athlete dataset and seed data
manifest.json              PWA manifest
sw.js                      Service worker and app shell cache list
package.json               Build, lint, Cloudflare dev/deploy scripts
wrangler.toml              Cloudflare Pages config and KV binding
_routes.json               Routes every request through Pages Functions
CLOUDFLARE_DEPLOY.md       Cloudflare setup, login, KV, and deploy notes

functions/
  _middleware.js           Login gate for all non-auth routes
  _lib/auth.js             Password verification, sessions, login page rendering
  auth/login.js            Login endpoint
  auth/logout.js           Logout endpoint
  auth/me.js               Current-session endpoint
  api/data.js              KV-backed shared athlete data endpoint

js/
  main.js                  esbuild entry point; imports app modules in order
  auth.js                  Frontend role UI and `/api/data` fetch/publish bridge
  state.js                 Shared `window.APP`, event delegation, tab state
  data.js                  Fetches athlete JSON and computes processed `window.CLUB`
  helpers.js               Formatting, escaping, table-cell helpers
  overview.js              Team overview rendering
  profile.js               Athlete profile rendering and charts
  tabs.js                  Leaderboards and secondary tabs
  test-history.js          Test history and weight history helpers
  test-views.js            Testing log/calendar/import-related views
  compare.js               Athlete/group comparison views
  data-mgmt.js             Snapshots, CSV export, rebuild, add/delete athlete
  edit-panel.js            Admin edit drawer and JSON import/export
  print.js                 Print/PDF report builders
  app.bundle.js            Generated bundle; do not hand-edit
  app.bundle.js.map        Generated source map; do not hand-edit
```

## Script and Build Model

The source files are ES modules only at build time. `js/main.js` imports the source modules, then esbuild outputs an IIFE bundle at `js/app.bundle.js`.

`index.html` loads:

```html
<script src="js/auth.js" defer></script>
<script src="js/app.bundle.js" defer></script>
```

`js/auth.js` intentionally loads before the app bundle so it can:

- Fetch `/auth/me` and set `document.documentElement.dataset.authRole`.
- Hide admin-only UI while the role is loading.
- Redirect unauthenticated production users to `/auth/login`.
- Wrap `fetch("data/athletes.json")` so the app reads from `/api/data` on Cloudflare.
- Expose `publishCloudData()` and `reloadCloudData()` for admin controls.

When changing app behavior, edit source modules and rebuild. Do not hand-edit `js/app.bundle.js` or `js/app.bundle.js.map`.

## Auth and Roles

The app has two logins:

- Admin username: `admin`
- Athlete username: `athlete`

Current requested passwords are documented in `CLOUDFLARE_DEPLOY.md`. Password hashes are supported through Cloudflare Pages secrets:

- `AUTH_ADMIN_PASSWORD_SHA256`
- `AUTH_ATHLETE_PASSWORD_SHA256`
- `AUTH_SESSION_SECRET`

Admin can edit/import/delete/publish data. Athlete is read-only. Athlete read-only access is enforced in both places:

- Frontend: admin controls are hidden/blocked by `js/auth.js` and CSS role selectors.
- Backend: `POST /api/data` checks the signed session role and rejects non-admin users.

Do not rely only on frontend hiding for authorization.

## Data Flow

Startup flow:

1. `js/data.js` calls `fetch("data/athletes.json")`.
2. `js/auth.js` intercepts that request and fetches `/api/data`.
3. `functions/api/data.js` returns the latest KV value if available.
4. If no KV value exists, the endpoint falls back to static `data/athletes.json`.
5. `js/data.js` processes the raw dataset into `window.CLUB`.

Admin publish flow:

1. Admin edits/imports data in the dashboard.
2. Admin clicks `Publish Cloud Data`.
3. `js/auth.js` builds a raw export from `window.CLUB` plus test history.
4. `POST /api/data` validates the payload and stores it in `LIFTING_CLUB_KV`.
5. Athlete logins receive the updated data on reload.

Local-only edits in `localStorage` are not shared until the admin publishes cloud data.

## Cloudflare

Cloudflare Pages project:

```text
lifting-club
```

KV binding:

```text
LIFTING_CLUB_KV
```

Configured namespace id:

```text
a37bbced560c447998fc114228203145
```

Deploy with:

```sh
./scripts/deploy-cloudflare.sh
```

The deploy script builds the bundle, stages only public app assets, uploads Pages Functions, and deploys to the `lifting-club` Pages project. Do not deploy the repo root manually with `wrangler pages deploy .`; the script avoids leaking local-only files.

## Service Worker

If adding public static files required at runtime, update `APP_SHELL` in `sw.js` where appropriate and bump `CACHE_NAME` when cache invalidation matters.

Current app shell includes `js/auth.js`, `js/app.bundle.js`, CSS, manifest, and `data/athletes.json`.

## Development Rules

- Preserve the existing vanilla JS style and global `window.APP` / `window.CLUB` patterns.
- Use `data-click`, `data-change`, and delegated actions where the app already does.
- Keep admin-only controls marked with `data-auth-admin-only` when they mutate shared or local data.
- Keep backend authorization in Pages Functions for any shared-data mutation.
- Prefer small, direct changes over broad refactors.
- Be careful with `data/athletes.json`: it is the static fallback and seed data, not the only production data source.
- Do not remove Cloudflare Functions or `_routes.json`; those are what protect the deployed app.
- Do not commit `.dev.vars`, `.wrangler/`, local cookies, or generated test output.

## Verification Checklist

Before finalizing a change:

```sh
npm run lint
npm run build
```

Expected current state: lint may report existing `no-unused-vars` warnings in older modules, but it should exit successfully with zero errors.

For auth/data changes, also verify:

```sh
npm run dev:cloudflare
curl -s -H 'Accept: application/json' http://localhost:8788/api/data
```

Unauthenticated API requests should be rejected. Admin login should be able to read and publish data. Athlete login should read data and receive `403` on publish.

After Cloudflare deploy, smoke-check:

```sh
curl -s -H 'Accept: text/html' https://lifting-club.pages.dev/ | rg "Team Login|Lifting Club"
curl -s -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"goeagles2026"}' \
  https://lifting-club.pages.dev/auth/login
```

## Git Closeout

Use normal non-interactive git commands:

```sh
git status --short
git add .
git commit -m "Clear, specific message"
git push origin main
./scripts/deploy-cloudflare.sh
```

If the worktree contains unrelated user changes, do not revert them. Either leave them out of the commit when possible or clearly explain why they are included.
