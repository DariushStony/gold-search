// Every setting the app reads from the environment, in one place; .env.example lists them with their defaults.
export type Env = {
  port: number;
  snapshotPath: string | undefined;
  avalaiKey: string | undefined;
  avalaiModel: string | undefined;
  eventsFile: string | null | undefined; // "-" means stdout, for a container without a disk (ADR-0012)
  trustProxy: boolean;
};

export function readEnv(env: NodeJS.ProcessEnv = process.env): Env {
  return {
    port: Number(env.PORT || 4321),
    snapshotPath: env.SNAPSHOT_PATH || undefined,
    avalaiKey: env.AVALAI_API_KEY || undefined,
    avalaiModel: env.AVALAI_MODEL || undefined,
    eventsFile: env.EVENTS_FILE === "-" ? null : env.EVENTS_FILE || undefined,
    trustProxy: env.TRUST_PROXY === "1",
  };
}
