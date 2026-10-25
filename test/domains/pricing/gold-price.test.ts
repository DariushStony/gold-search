import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseUnion, parseTgju, selectReference, type Quote } from "../../../src/domains/pricing/gold-price.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), "utf8"));
const NOW = new Date("2026-10-23T08:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const quote = (source: Quote["source"], g_toman: number, quotedMinutesAgo: number): Quote => ({
  source,
  g_toman,
  quoted_at: minutesAgo(quotedMinutesAgo),
  fetched_at: minutesAgo(0),
});

test("union board: 18k gram in toman, board time read as Tehran time", () => {
  const q = parseUnion(fixture("union-board-2026-10-23.json"), "2026-10-23T13:48:00.000Z");
  assert.deepEqual(q, { source: "union", g_toman: 26_247_800, quoted_at: "2026-10-23T13:47:03.000Z", fetched_at: "2026-10-23T13:48:00.000Z" });
});

test("union board: a body without IRG18 gives no quote", () => {
  assert.equal(parseUnion({ success: true, data: { date: "2026-10-23 17:17:03" } }, NOW.toISOString()), null);
  assert.equal(parseUnion({ success: false }, NOW.toISOString()), null);
});

test("tgju: geram18 in rial becomes toman, ts read as Tehran time", () => {
  const q = parseTgju(fixture("tgju-2026-10-23.json").current, "2026-10-23T06:56:01.326Z");
  assert.deepEqual(q, { source: "tgju", g_toman: 27_223_100, quoted_at: "2026-10-21T20:30:00.000Z", fetched_at: "2026-10-23T06:56:01.326Z" });
});

test("BR-01: a fresh union quote is the reference", () => {
  const ref = selectReference(quote("union", 27_000_000, 2), quote("tgju", 27_050_000, 1), NOW);
  assert.equal(ref?.source, "union");
  assert.equal(ref?.g_toman, 27_000_000);
  assert.equal(ref?.market_open, true);
  assert.deepEqual(ref?.other, { source: "tgju", g_toman: 27_050_000, quoted_at: minutesAgo(1) });
});

test("BR-03: union unchanged for 15 min while tgju moved ⇒ tgju is used", () => {
  const ref = selectReference(quote("union", 27_000_000, 15), quote("tgju", 27_050_000, 2), NOW);
  assert.equal(ref?.source, "tgju");
  assert.equal(ref?.g_toman, 27_050_000);
});

test("BR-03: no fallback to a tgju quote older than the union one", () => {
  const ref = selectReference(quote("union", 27_000_000, 15), quote("tgju", 27_050_000, 20), NOW);
  assert.equal(ref?.source, "union");
});

test("BR-03: union missing ⇒ tgju; nothing at all ⇒ no reference", () => {
  assert.equal(selectReference(null, quote("tgju", 27_050_000, 2), NOW)?.source, "tgju");
  assert.equal(selectReference(null, null, NOW), null);
});

test("BR-04: sources more than 1% apart are uncertain; 0.74% is not", () => {
  assert.equal(selectReference(quote("union", 27_000_000, 2), quote("tgju", 27_405_000, 2), NOW)?.uncertain, true);
  assert.equal(selectReference(quote("union", 27_000_000, 2), quote("tgju", 27_200_000, 2), NOW)?.uncertain, false);
  assert.equal(selectReference(quote("union", 27_000_000, 2), null, NOW)?.uncertain, false);
});

test("BR-05 / A-01: neither source changed for 30 min ⇒ market closed, last union price kept", () => {
  const ref = selectReference(quote("union", 27_000_000, 40), quote("tgju", 27_050_000, 35), NOW);
  assert.equal(ref?.market_open, false);
  assert.equal(ref?.source, "union");
});
