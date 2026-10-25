import { test } from "node:test";
import assert from "node:assert/strict";
import { formatToman, formatPct, formatWeight, formatTehranTime, jalaliYear } from "../../src/shared/format.ts";

test("AC-PM-09 (BR-49): 35,949,000 ⇒ «۳۵٫۹ میلیون تومان»", () => {
  assert.equal(formatToman(35_949_000), "۳۵٫۹ میلیون تومان");
});

test("BR-49: G is shown in full toman with «٬» grouping", () => {
  assert.equal(formatToman(27_017_000, { full: true }), "۲۷٬۰۱۷٬۰۰۰ تومان");
});

test("BR-49: amounts under a million are shown in thousand toman", () => {
  assert.equal(formatToman(850_000), "۸۵۰ هزار تومان");
  assert.equal(formatToman(849_600), "۸۵۰ هزار تومان");
});

test("AC-PM-09 (BR-49): 34.25 ⇒ «٪۳۴٫۳» (half up)", () => {
  assert.equal(formatPct(34.25), "٪۳۴٫۳");
  assert.equal(formatPct(7), "٪۷٫۰");
});

test("BR-49: weight keeps up to three decimals and drops trailing zeros", () => {
  assert.equal(formatWeight(1.7), "۱٫۷ گرم");
  assert.equal(formatWeight(2.35), "۲٫۳۵ گرم");
  assert.equal(formatWeight(0.0904), "۰٫۰۹ گرم");
});

test("AC-PM-09 (BR-49): 06:45 UTC on 2026-10-22 ⇒ «۳۰ مهر، ۱۰:۱۵» in the same Jalali year", () => {
  assert.equal(formatTehranTime("2026-10-22T06:45:00Z", new Date("2026-10-23T08:00:00Z")), "۳۰ مهر، ۱۰:۱۵");
});

test("BR-49: another Jalali year shows the year", () => {
  assert.equal(formatTehranTime("2026-03-19T20:00:00Z", new Date("2026-10-23T08:00:00Z")), "۲۸ اسفند ۱۴۰۴، ۲۳:۳۰");
});

test("Jalali year boundary: 20 March 2026 is 1404, 21 March 2026 is 1405 in Tehran", () => {
  assert.equal(jalaliYear(new Date("2026-03-20T12:00:00Z")), 1404);
  assert.equal(jalaliYear(new Date("2026-03-21T12:00:00Z")), 1405);
});
