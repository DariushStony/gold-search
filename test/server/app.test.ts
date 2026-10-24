import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { buildSnapshot } from "../../src/pipeline/build-snapshot.ts";
import { createApp } from "../../src/server/app.ts";

const RUN = "2026-10-23T06:56:00.000Z";

function rawFixture(): string {
  const raw = mkdtempSync(join(tmpdir(), "raw-"));
  mkdirSync(join(raw, "2026-10-23"));
  mkdirSync(join(raw, "details"));
  const line = (o: object) => JSON.stringify(o) + "\n";
  writeFileSync(join(raw, "2026-10-23", "torob-search.jsonl"), line({
    run_id: RUN, q: "النگو طلا", page: 0, fetched_at: "2026-10-23T06:57:00.000Z", results: [
      { random_key: "ring", name1: "النگو طلا ۱۸ عیار آیینه ای", name2: "", price: 49_179_516, shop_text: "در فرنیا گلد", web_client_absolute_url: "/p/ring/x/", image_url: "https://img/ring.jpg", is_adv: false },
      { random_key: "fake", name1: "النگو ژوپینگ طرح طلا", name2: "", price: 900_000, shop_text: "در ۲ فروشگاه", web_client_absolute_url: "/p/fake/x/", image_url: null, is_adv: false },
    ],
  }));
  writeFileSync(join(raw, "2026-10-23", "gold-price.jsonl"),
    line({ run_id: RUN, source: "https://call1.tgju.org/ajax.json", unit: "rial", fetched_at: "2026-10-23T06:56:01.000Z", prices: { geram18: { p: "270,170,000", ts: "2026-10-23 10:20:00" } } }));
  writeFileSync(join(raw, "2026-10-23", "runs.jsonl"),
    line({ run_id: RUN, step: "summary", started_at: RUN, finished_at: "2026-10-23T07:02:00.000Z", requests: 21, results: 2, stopped: null }));
  writeFileSync(join(raw, "details", "ring.json"), JSON.stringify({
    fetched_at: "2026-10-23T07:00:00.000Z",
    body: {
      name1: "النگو طلا ۱۸ عیار آیینه ای",
      structural_specs: { headers: [{ specs: { "وزن": "1.7 گرم", "عیار": "18" } }] },
      key_specs: [],
      products_info: { result: [
        { shop_name: "فرنیا گلد", shop_name2: "تهران", name1: "النگو طلا", price: 49_000_000, availability: true, page_url: "https://api.torob.com/v4/product-page/redirect/a", show_torobpay_badge: false, is_price_unreliable: false, shop_score_percentile: 71 },
        { shop_name: "زرین", shop_name2: "اصفهان", name1: "النگو طلا ۱۸", price: 52_000_000, availability: true, page_url: "https://api.torob.com/v4/product-page/redirect/b", show_torobpay_badge: true, is_price_unreliable: false, shop_score_percentile: 40 },
        { shop_name: "بسته", shop_name2: "تهران", name1: "النگو", price: 0, availability: false, page_url: "x" },
      ] },
      products_in_store_info: { result: [
        { shop_name: "طلای حضوری", shop_name2: "تهران", name1: "النگو طلا", price: 53_000_000, availability: null, page_url: "https://api.torob.com/v4/product-page/redirect/c" },
      ] },
    },
  }));
  return raw;
}

const G = { g_toman: 27_017_000, source: "union" as const, quoted_at: "2026-10-23T07:00:00.000Z", fetched_at: "2026-10-23T07:01:00.000Z", other: null, uncertain: false, market_open: true };

test("demo server: parse, search and product detail follow the API contract", async () => {
  const out = join(mkdtempSync(join(tmpdir(), "snap-")), "snapshot.sqlite");
  buildSnapshot({ rawDir: rawFixture(), outPath: out });
  const server = createApp(out, { goldPrice: async () => G }).listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const post = (path: string, body: unknown) => fetch(base + path, { method: "POST", body: JSON.stringify(body) });
  try {
    const parsed = await (await post("/parse", { text: "النگو طلا برای پس انداز" })).json();
    assert.equal(parsed.intent, "savings");
    const res = await post("/search", { chips: parsed.chips });
    assert.equal(res.headers.get("x-robots-tag"), "noindex");
    const s = await res.json();
    assert.deepEqual(s.results.map((c: any) => c.id), ["ring"]);
    assert.equal(s.results[0].offer.breakdown.gold_value, 45_928_900);
    assert.equal(s.results[0].offer.breakdown.resale_value, 45_316_515); // 1.7 g × 27,017,000 × 740/750, live G
    assert.equal(s.excluded_count, 1);
    assert.ok(s.savings_card.rows.length >= 5);
    const detail = await (await post("/products/ring", { chips: parsed.chips, snapshot_id: s.snapshot.id })).json();
    assert.equal(detail.offers.length, 3);
    assert.equal((await post("/parse", { text: "x".repeat(301) })).status, 422);
    assert.equal((await post("/search", { chips: [], snapshot_id: "old" })).status, 410);
  } finally {
    server.close();
  }
});
