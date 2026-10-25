# Darkube builds this from the repo (ADR-0012). Node 24 runs the TypeScript sources directly and the app has
# no runtime dependencies, so the image needs no package install.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8000 \
    SNAPSHOT_PATH=/app/deploy/snapshot.sqlite \
    TRUST_PROXY=1 \
    EVENTS_FILE=- \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning
COPY package.json ./
COPY src ./src
COPY web ./web
COPY deploy/snapshot.sqlite ./deploy/snapshot.sqlite
USER node
EXPOSE 8000
CMD ["node", "src/app/server.ts"]
