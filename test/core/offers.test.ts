import { test } from "node:test";
import assert from "node:assert/strict";
import { eligibleOffers, isStale, mergeCard, type OfferRow } from "../../src/core/offers.ts";

const FINISHED = "2026-10-23T07:00:00.000Z";
const hoursBefore = (h: number) => new Date(Date.parse(FINISHED) - h * 3_600_000).toISOString();
const offer = (o: Partial<OfferRow>): OfferRow => ({
  id: "o", product_id: "p", source: "torob_details", shop: "s", city: "تهران", channel: "online", title: "انگشتر طلا",
  price: 10_000_000, url: "https://api.torob.com/v4/product-page/redirect/x", torob_pay: false, price_unreliable: false,
  shop_score_pct: null, fetched_at: hoursBefore(1), ...o,
});

const tehran = offer({ id: "t", shop: "زرین", price: 10_000_000 });
const isfahan = offer({ id: "i", shop: "آوا", city: "اصفهان", price: 10_200_000 });

test("AC-MT-05 (BR-84): the representative is the cheapest eligible offer; a city filter changes it", () => {
  assert.equal(eligibleOffers([isfahan, tehran], {}, FINISHED, false)[0]?.id, "t");
  assert.equal(eligibleOffers([isfahan, tehran], { city: "اصفهان" }, FINISHED, false)[0]?.id, "i");
});

test("BR-84: an offer Torob marks as unreliable is not eligible", () => {
  assert.equal(eligibleOffers([offer({ id: "u", price: 1, price_unreliable: true }), tehran], {}, FINISHED, false)[0]?.id, "t");
});

test("BR-14, BR-16: an offer older than 7 days is dropped, except in archive mode", () => {
  const old = offer({ id: "old", price: 9_000_000, fetched_at: hoursBefore(8 * 24) });
  assert.equal(eligibleOffers([old, tehran], {}, FINISHED, false)[0]?.id, "t");
  assert.equal(eligibleOffers([old, tehran], {}, FINISHED, true)[0]?.id, "old");
});

test("BR-14: stale after 24 h before finished_at; never stale in archive mode", () => {
  assert.equal(isStale(offer({ fetched_at: hoursBefore(30) }), FINISHED, false), true);
  assert.equal(isStale(offer({ fetched_at: hoursBefore(20) }), FINISHED, false), false);
  assert.equal(isStale(offer({ fetched_at: hoursBefore(30) }), FINISHED, true), false);
});

test("BR-84: on equal price the newer offer comes first", () => {
  const older = offer({ id: "older", fetched_at: hoursBefore(10) });
  const newer = offer({ id: "newer", fetched_at: hoursBefore(2) });
  assert.equal(eligibleOffers([older, newer], {}, FINISHED, false)[0]?.id, "newer");
});

test("BR-84: an unnamed card offer cannot represent under shop, city or Torob Pay filters", () => {
  const card = offer({ id: "card", source: "torob_search", shop: null, city: null, price: 9_500_000 });
  assert.equal(eligibleOffers([card, tehran], {}, FINISHED, false)[0]?.id, "card");
  assert.equal(eligibleOffers([card, tehran], { city: "تهران" }, FINISHED, false)[0]?.id, "t");
  assert.equal(eligibleOffers([card, tehran], { shop: "زرین" }, FINISHED, false)[0]?.id, "t");
  assert.equal(eligibleOffers([card, offer({ id: "tp", torob_pay: true, price: 11_000_000 })], { torob_pay: true }, FINISHED, false)[0]?.id, "tp");
});

test("BR-84: the in-person filter keeps only in-person offers", () => {
  const store = offer({ id: "store", channel: "in_person", price: 12_000_000 });
  assert.equal(eligibleOffers([tehran, store], { in_person: true }, FINISHED, false)[0]?.id, "store");
});

test("DM-08: a card naming a shop merges into that shop's details offer, keeping the newer price and time", () => {
  const details = [offer({ id: "d1", shop: "فرنیا گلد", price: 49_000_000, fetched_at: hoursBefore(20) })];
  const card = offer({ id: "c", source: "torob_search", shop: "فرنیا گلد", city: null, url: "https://torob.com/p/x/", price: 49_179_516, fetched_at: hoursBefore(1) });
  const merged = mergeCard(card, details);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.price, 49_179_516);
  assert.equal(merged[0]?.fetched_at, hoursBefore(1));
  assert.equal(merged[0]?.url, details[0]!.url);
  assert.equal(merged[0]?.city, "تهران");
});

test("AC-MT-06 (DM-08): a «در N فروشگاه» card equal to a details price merges into that offer", () => {
  const details = [offer({ id: "a", shop: "آوا", price: 10_000_000, fetched_at: hoursBefore(20) }), offer({ id: "b", shop: "زرین", price: 10_500_000 })];
  const card = offer({ id: "c", source: "torob_search", shop: null, city: null, url: "https://torob.com/p/x/", price: 10_000_000, fetched_at: hoursBefore(1) });
  const merged = mergeCard(card, details);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((o) => o.price === 10_000_000)?.shop, "آوا");
  assert.equal(merged.find((o) => o.price === 10_000_000)?.fetched_at, hoursBefore(1));
});

test("DM-08: an unmatched «در N فروشگاه» card stays as an unnamed offer pointing at the Torob page", () => {
  const details = [offer({ id: "a", shop: "آوا", price: 10_400_000 })];
  const card = offer({ id: "c", source: "torob_search", shop: null, city: null, url: "https://torob.com/p/x/", price: 10_000_000 });
  const merged = mergeCard(card, details);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((o) => o.shop === null)?.url, "https://torob.com/p/x/");
});
