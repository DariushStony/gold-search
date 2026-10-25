// Every setting the app reads from the environment, in one place; .env.example lists them with their defaults.
type Env = {
  port: number;
  snapshotPath: string | undefined;
  webDir: string | undefined; // the built page (pnpm build:web); default dist/web
  avalaiKey: string | undefined;
  avalaiModel: string | undefined;
  eventsFile: string | null | undefined; // "-" means stdout, for a container without a disk (ADR-0012)
  trustProxy: boolean;
  collect: boolean; // ADR-0013: the server collects twice a day, in production unless COLLECT=off
  collectDir: string | undefined; // where a server run keeps its raw files and new snapshots; default the temp folder
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
    collect: env.NODE_ENV === 'production' && env.COLLECT !== 'off',
    collectDir: env.COLLECT_DIR || undefined,
  };
}

export { readEnv };
