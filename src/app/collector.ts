// ADR-0013: twice a day the server collects into a temporary folder, builds a new snapshot from the one it serves plus
// that run, and serves the new one only if it is sound. A failed or partial run keeps what is there.
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadSnapshot, type Snapshot } from '../domains/catalog/snapshot.ts';
import { buildSnapshot } from '../domains/collection/build-snapshot.ts';
import { realDeps, runCollector, type Summary } from '../domains/collection/collect.ts';

const SLOTS = [
  [10, 15],
  [18, 15],
] as const; // Tehran time, as the owner's machine ran it
const TEHRAN_OFFSET_MIN = 210; // UTC+3:30, no daylight saving since 2022
const MIN_KEPT = 0.9; // a new snapshot must keep at least this share of the products

type Run = {
  run_id: string;
  started_at: string;
  finished_at: string;
  requests: number;
  results: number;
  details_fetched: number;
  stopped: string | null;
  swapped: boolean;
  products: number | null;
  reason: string | null;
};
type CollectorStatus = {
  running: boolean;
  next_run_at: string | null;
  last_run: Run | null;
};
type Served = { path: string; snapshot: Snapshot };
type Options = {
  workDir: string;
  first?: Date; // the first run, if it should not wait for the next slot
  served: () => Served;
  serve: (next: Served) => void;
  collect?: (rawDir: string, runId: string) => Promise<Summary>;
  now?: () => Date;
};

function nextSlot(now: Date): Date {
  const local = new Date(now.getTime() + TEHRAN_OFFSET_MIN * 60_000);
  for (let day = 0; day < 2; day++) {
    for (const [h, m] of SLOTS) {
      const t = Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate() + day,
        h,
        m,
      );
      const at = new Date(t - TEHRAN_OFFSET_MIN * 60_000);
      if (at > now) return at;
    }
  }
  throw new Error('no slot in the next two days');
}

const safe = (iso: string) => iso.replace(/[:.]/g, '-');

async function collectOnce(o: Options): Promise<Run> {
  const now = o.now ?? (() => new Date());
  const runId = now().toISOString();
  const rawDir = join(o.workDir, `raw-${safe(runId)}`);
  const run = (s: Summary, rest: Partial<Run>): Run => ({
    run_id: runId,
    started_at: runId,
    finished_at: now().toISOString(),
    requests: s.requests,
    results: s.results,
    details_fetched: s.details_fetched,
    stopped: s.stopped,
    swapped: false,
    products: null,
    reason: null,
    ...rest,
  });
  mkdirSync(rawDir, { recursive: true });
  let summary: Summary = { requests: 0, results: 0, details_fetched: 0, stopped: null };
  try {
    summary = await (o.collect ?? ((dir, id) => runCollector(realDeps(dir, id))))(
      rawDir,
      runId,
    );
    if (summary.results === 0) {
      return run(summary, { reason: `no search results (${summary.stopped ?? 'none'})` });
    }
    const current = o.served();
    const outPath = join(o.workDir, `snapshot-${safe(runId)}.sqlite`);
    buildSnapshot({ rawDir, outPath, base: current.path });
    const next = loadSnapshot(outPath);
    const kept = next.products.length / Math.max(1, current.snapshot.products.length);
    if (kept < MIN_KEPT) {
      rmSync(outPath, { force: true });
      return run(summary, {
        products: next.products.length,
        reason: `kept ${Math.round(kept * 100)}% of the products`,
      });
    }
    o.serve({ path: outPath, snapshot: next });
    if (current.path.startsWith(o.workDir)) rmSync(current.path, { force: true }); // an earlier server-built one
    return run(summary, { swapped: true, products: next.products.length });
  } catch (err) {
    return run(summary, { reason: String(err).slice(0, 200) });
  } finally {
    rmSync(rawDir, { recursive: true, force: true });
  }
}

function scheduleCollection(o: Options): () => CollectorStatus {
  const now = o.now ?? (() => new Date());
  let next = o.first ?? nextSlot(now());
  let running = false;
  let last: Run | null = null;
  const arm = () =>
    setTimeout(
      async () => {
        running = true;
        last = await collectOnce(o);
        running = false;
        process.stdout.write(`collector: ${JSON.stringify(last)}\n`);
        next = nextSlot(now());
        arm();
      },
      Math.max(0, next.getTime() - now().getTime()),
    );
  arm();
  return () => ({ running, next_run_at: next.toISOString(), last_run: last });
}

export { collectOnce, nextSlot, scheduleCollection, type CollectorStatus, type Served };
