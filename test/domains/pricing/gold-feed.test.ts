import { test } from "node:test";
import assert from "node:assert/strict";
import { createGoldFeed } from "../../../src/domains/pricing/gold-feed.ts";
import type { Quote } from "../../../src/domains/pricing/gold-price.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const quote = (source: "union" | "tgju", g: number): Quote => ({
  source,
  g_toman: g,
  quoted_at: new Date().toISOString(),
  fetched_at: new Date().toISOString(),
});

test("a slow source never holds up a request: the fast one answers now, the slow one fills in when it arrives", async () => {
  let unionCalls = 0;
  const feed = createGoldFeed({
    sources: { union: async () => (unionCalls++, await sleep(120), quote("union", 26_000_000)), tgju: async () => quote("tgju", 26_300_000) },
    ttlMs: 60_000,
    firstWaitMs: 40,
    log: () => {},
  });
  const t = Date.now();
  const first = await feed();
  assert.ok(Date.now() - t < 100, "the first request waits at most firstWaitMs");
  assert.equal(first?.source, "tgju");
  await sleep(150);
  const later = await feed();
  assert.equal(later?.source, "union");
  assert.equal(later?.other?.source, "tgju");
  await feed();
  assert.equal(unionCalls, 1, "within the TTL the cached price is reused");
});

test("a source that fails keeps its last good quote, and the failure is logged once per reason", async () => {
  let fail = false;
  const logged: string[] = [];
  const feed = createGoldFeed({
    sources: {
      union: async () => {
        if (fail) throw new Error("HTTP 503");
        return quote("union", 26_000_000);
      },
      tgju: async () => null,
    },
    ttlMs: 0,
    firstWaitMs: 50,
    log: (l) => logged.push(l),
  });
  assert.equal((await feed())?.source, "union");
  fail = true;
  await feed();
  await sleep(10);
  await feed();
  await sleep(10);
  assert.equal((await feed())?.g_toman, 26_000_000);
  assert.equal(logged.filter((l) => l.includes("union") && l.includes("HTTP 503")).length, 1);
  assert.equal(logged.filter((l) => l.includes("tgju")).length, 1);
});
