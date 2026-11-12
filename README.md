# ListingWatch

Monitors eBay and Vinted searches and collects every new listing into one feed, with notifications on your phone and desktop.

ListingWatch is a **self-hosted web app**: a Node server that polls the marketplaces around the clock, and an installable web app (PWA) for phone and desktop.

| Part | Location | Stack |
|---|---|---|
| Server | `apps/server` | Node 24 (runs TypeScript directly), Fastify, SQLite, Playwright + Chromium for Vinted, Web Push |
| Web app | `apps/web` | React 19, Vite, Tailwind CSS 4, shadcn/ui, TanStack Query |
| Shared | `packages/shared` | zod contracts, match-list matcher, marketplace tables, URL import |

## Develop

Requires Node 24 or later.

```bash
npm install
npx --prefix apps/server playwright install chromium   # browser used for Vinted
# Terminal 1: API server on :8095, data in apps/server/data
npm run dev:server
# Terminal 2: web app on http://localhost:5173 (proxies /api to the server)
npm run dev:web
```

Push notifications and offline loading need the production build, since the dev server doesn't build the service worker.

## Test and build

```bash
npm test               # all unit and API tests (Vitest)
npm run typecheck      # every workspace
npm run build          # builds apps/web/dist, which the server then serves
npm start              # run the server (production settings come from the environment)
```

## Deploy

CI (`.github/workflows/ci.yml`) checks every push and, on `main`, publishes a Docker image tagged `latest` and with the commit SHA. A server runs it with the Compose file in `deploy/`, behind an HTTPS reverse proxy. ListingWatch has no sign-in of its own, so put your own authentication in front of it. See [docs/deployment.md](docs/deployment.md).

## Configuration

Environment variables: `PORT` (8095), `HOST` (127.0.0.1; the image uses 0.0.0.0), `DATA_DIR`, `LOG_LEVEL`, `VINTED_HEADLESS`, and `VAPID_SUBJECT` (the contact Web Push requires; see `deploy/.env.example`). `LISTINGWATCH_REVISION` is set by the image build and reported by `/api/health`. eBay credentials are entered in Settings and stay on the server.

Everything the server keeps (SQLite database, Chromium profile, logs, uploaded sound) lives in `DATA_DIR`.
