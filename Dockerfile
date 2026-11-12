# ListingWatch web app: the Node server (which runs its TypeScript directly) plus
# the built web app, with Playwright's Chromium for Vinted.
#
# Layers are ordered by how often they change, so a code-only commit reuses the
# dependency install and the Chromium download from the cache:
#   deps          npm ci                      (changes with the lockfile)
#   runtime-deps  deps minus dev dependencies (changes with the lockfile)
#   build         the web app bundle          (changes with the code)
#   final         runtime deps, Chromium, then only the files the server runs

FROM node:24-bookworm-slim AS deps
# better-sqlite3 compiles its native module during install.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

FROM deps AS runtime-deps
RUN npm prune --omit=dev --no-audit --no-fund

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN npm run build -w @listingwatch/web

FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    DATA_DIR=/data \
    HOST=0.0.0.0 \
    PORT=8095
WORKDIR /app
# Package manifests and production node_modules only: no source yet.
COPY --from=runtime-deps /app ./
# Chromium and the system libraries it needs, at the version the installed Playwright expects.
RUN ./node_modules/.bin/playwright install --with-deps chromium \
 && mkdir -p /data && chown node:node /data
# What the server runs: its own source, the shared package, and the built web app.
COPY packages/shared/src packages/shared/src
COPY apps/server/src apps/server/src
COPY --from=build /app/apps/web/dist apps/web/dist
# The commit CI built; /api/health reports it, so you can check which build a deploy is running.
# Declared last, so a new commit doesn't invalidate any earlier layer.
ARG GIT_SHA=local
ENV LISTINGWATCH_REVISION=${GIT_SHA}
USER node
VOLUME ["/data"]
EXPOSE 8095
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:8095/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "apps/server/src/main.ts"]
