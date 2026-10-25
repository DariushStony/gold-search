// The live gold price for requests (BR-01 to BR-05), refreshed in the background so a slow source never holds up a
// request. On 2026-10-25 the union board took 10 to 12 s to answer, from Hamravesh and from the owner's machine alike.
import { selectReference, type Quote, type Reference } from "../core/gold-price.ts";

type Source = "union" | "tgju";
export type GoldFeedOptions = {
  sources: Record<Source, () => Promise<Quote | null>>;
  ttlMs: number; // a refresh starts once the last one is this old
  firstWaitMs: number; // with nothing cached yet, a request waits this long for the first answer
  log?: (line: string) => void;
};

export function createGoldFeed(o: GoldFeedOptions): () => Promise<Reference | null> {
  const latest: Partial<Record<Source, Quote>> = {}; // the last good quote per source survives a failed refresh
  const lastFailure = new Map<Source, string>();
  const log = o.log ?? ((line: string) => console.error(line));
  let ref: Reference | null = null;
  let refreshedAt = -Infinity;
  let inFlight: Promise<unknown> | null = null;

  const pull = async (source: Source) => {
    let reason: string;
    try {
      const q = await o.sources[source]();
      if (q) {
        latest[source] = q;
        lastFailure.delete(source);
        ref = selectReference(latest.union ?? null, latest.tgju ?? null, new Date());
        return;
      }
      reason = "no quote in the response";
    } catch (e) {
      reason = (e as Error).message;
    }
    // Once per new reason, so a source that stays down does not flood the log.
    if (lastFailure.get(source) !== reason) log(`gold price: ${source} failed (${reason}); keeping its last quote or using the other source`);
    lastFailure.set(source, reason);
  };

  return async () => {
    if (!inFlight && Date.now() - refreshedAt >= o.ttlMs) {
      refreshedAt = Date.now();
      inFlight = Promise.all([pull("union"), pull("tgju")]).finally(() => (inFlight = null));
    }
    if (!ref && inFlight) await Promise.race([inFlight, new Promise((r) => setTimeout(r, o.firstWaitMs))]);
    return ref;
  };
}
