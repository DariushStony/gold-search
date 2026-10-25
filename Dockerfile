# syntax=docker/dockerfile:1
# Darkube builds this from the repo (ADR-0012), in three stages:
#   deps     installs the dev tools from the lockfile
#   build    proves the code (typecheck, lint, tests) and bundles the server and the page
#   runtime  holds only the bundles and the snapshot: no node_modules, no sources, no tests

FROM node:24-alpine AS deps
WORKDIR /app
RUN npm install --global pnpm@12.9.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.json .oxlintrc.json ./
COPY configs ./configs
COPY scripts ./scripts
COPY eval ./eval
COPY src ./src
COPY test ./test
COPY docs/evidence/torob-robots-2026-10-21.txt ./docs/evidence/
# the Atlas is rendered from these at build time
COPY docs/atlas ./docs/atlas
COPY docs/engineering ./docs/engineering
RUN pnpm typecheck && pnpm lint && pnpm test && pnpm build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8000 \
    SNAPSHOT_PATH=/app/deploy/snapshot.sqlite \
    WEB_DIR=/app/dist/web \
    TRUST_PROXY=1 \
    EVENTS_FILE=- \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning
COPY --from=build /app/dist ./dist
# Last, because a data release changes only this file.
COPY deploy/snapshot.sqlite ./deploy/snapshot.sqlite
USER node
EXPOSE 8000
CMD ["node", "dist/server.js"]
