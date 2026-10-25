// Every setting the app reads from the environment, in one place; .env.example lists them with their defaults.
type Env = {
  port: number;
  snapshotPath: string | undefined;
  webDir: string | undefined; // the built page (pnpm build:web); default dist/web
  avalaiKey: string | undefined;
  avalaiModel: string | undefined;
  eventsFile: string | null | undefined; // "-" means stdout, for a container without a disk (ADR-0012)
  trustProxy: boolean;
};

function readEnv(env: NodeJS.ProcessEnv = process.env): Env {
  return {
    port: Number(env.PORT || 4321),
    snapshotPath: env.SNAPSHOT_PATH || undefined,
    webDir: env.WEB_DIR || undefined,
    avalaiKey: env.AVALAI_API_KEY || undefined,
    avalaiModel: env.AVALAI_MODEL || undefined,
    eventsFile: env.EVENTS_FILE === '-' ? null : env.EVENTS_FILE || undefined,
    trustProxy: env.TRUST_PROXY === '1',
  };
}

export { readEnv };
