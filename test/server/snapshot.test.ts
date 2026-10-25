import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSnapshot } from "../../src/pipeline/build-snapshot.ts";
import { loadSnapshot } from "../../src/server/snapshot.ts";
import { search } from "../../src/core/rank.ts";
import { parseQuery } from "../../src/core/parse.ts";

const RUN = "2026-10-23T06:56:00.000Z";

function rawFixture(): string {
  const raw = mkdtempSync(join(tmpdir(), "raw-"));
  mkdirSync(join(raw, "2026-10-23"));
  mkdirSync(join(raw, "details"));
  const line = (o: object) => JSON.stringify(o) + "\n";
  writeFileSync(
    join(raw, "2026-10-23", "torob-search.jsonl"),
    line({
      run_id: RUN,
      q: "النگو طلا",
      page: 0,
      fetched_at: "2026-10-23T06:57:00.000Z",
      results: [
        {
          random_key: "ring",
          name1: "النگو طلا ۱۸ عیار آیینه ای",
          name2: "",
          price: 49_179_516,
          shop_text: "در فرنیا گلد",
          web_client_absolute_url: "/p/ring/x/",
          image_url: "https://img/ring.jpg",
          is_adv: false,
        },
        {
          random_key: "fake",
          name1: "النگو ژوپینگ طرح طلا",
          name2: "",
          price: 900_000,
          shop_text: "در ۲ فروشگاه",
          web_client_absolute_url: "/p/fake/x/",
          image_url: null,
          is_adv: false,
        },
      ],
    }),
  );
  writeFileSync(
    join(raw, "2026-10-23", "gold-price.jsonl"),
    line({
      run_id: RUN,
      source: "https://call1.tgju.org/ajax.json",
      unit: "rial",
      fetched_at: "2026-10-23T06:56:01.000Z",
      prices: { geram18: { p: "270,170,000", ts: "2026-10-23 10:20:00" } },
    }),
  );
  writeFileSync(
    join(raw, "2026-10-23", "runs.jsonl"),
    line({ run_id: RUN, step: "summary", started_at: RUN, finished_at: "2026-10-23T07:02:00.000Z", requests: 21, results: 2, stopped: null }),
  );
  writeFileSync(
    join(raw, "details", "ring.json"),
    JSON.stringify({
      fetched_at: "2026-10-23T07:00:00.000Z",
      body: {
        name1: "النگو طلا ۱۸ عیار آیینه ای",
        structural_specs: { headers: [{ specs: { وزن: "1.7 گرم", عیار: "18" } }] },
        key_specs: [],
        products_info: {
          result: [
            {
              shop_name: "فرنیا گلد",
              shop_name2: "تهران",
              name1: "النگو طلا",
              price: 49_000_000,
              availability: true,
              page_url: "https://api.torob.com/v4/product-page/redirect/a",
              show_torobpay_badge: false,
              is_price_unreliable: false,
              shop_score_percentile: 71,
            },
            {
              shop_name: "زرین",
              shop_name2: "اصفهان",
              name1: "النگو طلا ۱۸",
              price: 52_000_000,
              availability: true,
              page_url: "https://api.torob.com/v4/product-page/redirect/b",
              show_torobpay_badge: true,
              is_price_unreliable: false,
              shop_score_percentile: 40,
            },
            { shop_name: "بسته", shop_name2: "تهران", name1: "النگو", price: 0, availability: false, page_url: "x" },
          ],
        },
        products_in_store_info: {
          result: [
            {
              shop_name: "طلای حضوری",
              shop_name2: "تهران",
              name1: "النگو طلا",
              price: 53_000_000,
              availability: null,
              page_url: "https://api.torob.com/v4/product-page/redirect/c",
            },
          ],
        },
      },
    }),
  );
  return raw;
}

test("loadSnapshot feeds the search core: sentence → chips → ranked real products from a snapshot", () => {
  const out = join(mkdtempSync(join(tmpdir(), "snap-")), "snapshot.sqlite");
  buildSnapshot({ rawDir: rawFixture(), outPath: out });
  const snap = loadSnapshot(out);
  assert.equal(snap.meta.run_id, RUN);
  assert.equal(snap.products.length, 2);
  const ring = snap.products.find((p) => p.id === "ring")!;
  assert.equal(ring.attrs.weight_g, 1.7);
  assert.equal(ring.offers.length, 3);
  assert.equal(ring.offers[0]!.g_at_fetch, 27_017_000);

  const r = search(snap.products, parseQuery("النگو طلا").chips, { finishedAt: snap.meta.finished_at, archive: false, gLive: 27_017_000 });
  assert.deepEqual(
    r.results.map((c) => c.id),
    ["ring"],
  );
  assert.equal(r.results[0]!.offer.price, 49_000_000);
  assert.equal(r.excluded_count, 1);
});
