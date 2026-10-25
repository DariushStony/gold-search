import { test } from "node:test";
import assert from "node:assert/strict";
import { extract, specsFromDetails, acceptLlmNumber } from "../../src/core/extract.ts";

const ex = (title: string, specs: Record<string, string> = {}, shop: string | null = null) => extract({ title, specs, shop });

test("AC-EX-01 (BR-20, BR-21, BR-23, BR-28): «وزن ۱٫۲۵ گرم» and «۱۸ عیار» from the title", () => {
  const a = ex("انگشتر طلا ۱۸ عیار وزن ۱٫۲۵ گرم");
  assert.equal(a.weight_g?.value, 1.25);
  assert.equal(a.weight_g?.provenance, "title");
  assert.equal(a.karat?.value, 18);
  assert.equal(a.karat?.provenance, "title");
});

test("AC-EX-02 (BR-21): «۲ گرم و ۳۵۰ سوت» is 2.350 g", () => {
  assert.equal(ex("پلاک طلا ۲ گرم و ۳۵۰ سوت").weight_g?.value, 2.35);
});

test("BR-21: «۷۵۰ سوت» is 0.75 g and is not read as karat 750", () => {
  const a = ex("گوشواره طلا ۷۵۰ سوت");
  assert.equal(a.weight_g?.value, 0.75);
  assert.equal(a.karat, null);
});

test("BR-21: «X گرمی», Arabic digits and «/» as the decimal mark", () => {
  assert.equal(ex("دستبند ۲ گرمی طلا").weight_g?.value, 2);
  assert.equal(ex("زنجیر طلا ٢ گرم").weight_g?.value, 2);
  assert.equal(ex("پلاک", { وزن: "۰/۷۷۰ گرم" }).weight_g?.value, 0.77);
});

test("BR-21 (tune split): milligrams, a decimal «سوت» meant as grams, and «وزن:» inside a spec value", () => {
  assert.equal(ex("پلاک طلا", { وزن: "90 mg" }).weight_g?.value, 0.09);
  assert.equal(ex("پلاک طلا ۹۰ میلی گرم").weight_g?.value, 0.09);
  assert.equal(ex("پلاک طلا ۱۸عیار با وزن۰/۶۳۰سوت").weight_g?.value, 0.63);
  assert.equal(ex("پلاک طلا", { "پلاک طلا۱۸عیار دوطرفه": "وزن: ۰/۶۳۰سوت" }).weight_g?.value, 0.63);
});

test("BR-23 (tune split): karat written in a material spec or as «عیار ۱۸»; plating karat is not gold karat", () => {
  assert.equal(ex("پلاک طلا پنتر", { جنس: "طلای 18 عیار (750)" }).karat?.value, 18);
  assert.equal(ex("دستبند چرم", { "جنس تصویر": "ورق طلا 24 عیار" }).karat?.value, 24);
  assert.equal(ex("دستبند", { جنس: "آبکاری طلا ۱۸ عیار" }).karat, null);
  assert.equal(ex("طلای آب‌شده ۱۰ گرم عیار ۱۸").karat?.value, 18);
});

test("BR-21: a length in the title is not a weight", () => {
  assert.equal(ex("زنجیر طلا ۵۰ سانتی ۱۸ عیار").weight_g, null);
});

test("AC-EX-03 (BR-22): 300 g is outside 0.01–200 g and stays unknown", () => {
  assert.equal(ex("انگشتر طلا ۳۰۰ گرم").weight_g, null);
});

test("BR-20, PRD §12: specs win over the title and the conflict is flagged", () => {
  const a = ex("پلاک طلا ۱ گرم", { "وزن (گرم)": "1.65" });
  assert.equal(a.weight_g?.value, 1.65);
  assert.equal(a.weight_g?.provenance, "spec");
  assert.equal(a.weight_conflict, true);
  assert.equal(ex("پلاک طلا ۱٫۶۵ گرم", { "وزن (گرم)": "1.65" }).weight_conflict, false);
});

test("a spec listing several weights (variants) gives no single weight", () => {
  assert.equal(ex("النگو طلا", { وزن: "1.200 گرم, 1.500 گرم, 2 گرم" }).weight_g, null);
});

test("weight filter buckets in specs are not weights", () => {
  assert.equal(ex("گردنبند طلا", { "وزن فیلتر": "کمتر از 2 گرم" }).weight_g, null);
});

test("BR-23: karat words and fineness numbers map to 18, 21 or 24; unknown numbers do not", () => {
  assert.equal(ex("دستبند طلای ۲۱ عیار").karat?.value, 21);
  assert.equal(ex("شمش طلا ۲۴ عیار").karat?.value, 24);
  assert.equal(ex("انگشتر طلا ۷۵۰").karat?.value, 18);
  assert.equal(ex("انگشتر", { عیار: "18" }).karat?.provenance, "spec");
  assert.equal(ex("انگشتر", { عیار: "738" }).karat, null);
});

test("BR-24: declared ojrat and profit from specs; «بدون اجرت» in the title is 0%", () => {
  assert.equal(ex("النگو", { "اجرت ساخت": "۱۴" }).declared_ojrat_pct?.value, 14);
  assert.equal(ex("النگو", { اجرت: "17.5%" }).declared_ojrat_pct?.value, 17.5);
  assert.equal(ex("النگو", { "اجرت ساخت": "اجرت پایین" }).declared_ojrat_pct, null);
  assert.equal(ex("النگو", { "اجرت فیلتر": "کمتر از 16 درصد" }).declared_ojrat_pct, null);
  assert.equal(ex("النگو طلا ۱۸ عیار آیینه ای بدون اجرت").declared_ojrat_pct?.value, 0);
  assert.equal(ex("النگو", { سود: "7.00" }).declared_profit_pct?.value, 7);
});

test("AC-EX-06 (BR-25): a known gallery in the shop name", () => {
  assert.equal(ex("گردنبند طلا", {}, "گالری طلای ماوی")?.gallery?.value, "ماوی");
  assert.equal(ex("گردنبند طلا", {}, "گالری طلا تیمچه").gallery, null);
});

test("AC-EX-07 (BR-26, BR-27): used words, item type and audience", () => {
  assert.equal(ex("النگو طلا کارکرده").condition?.value, "used");
  assert.equal(ex("انگشتر طلای دست‌دوم").condition?.value, "used");
  assert.equal(ex("دستبند زنانه طلا").condition, null);
  assert.equal(ex("دستبند زنانه طلا").item_type?.value, "دستبند");
  assert.equal(ex("دستبند زنانه طلا").audience?.value, "women");
  assert.equal(ex("پلاک گردنبند طلا مردانه").item_type?.value, "پلاک");
  assert.equal(ex("پلاک گردنبند طلا مردانه").audience?.value, "men");
  assert.equal(ex("دستبند طلا نوزاد").audience?.value, "kids");
  assert.equal(ex("انگشتر", { جنسیت: "دخترانه, زنانه" }).audience?.value, "women");
});

test("AC-EX-09 (BR-2A): stones, cord or beads mean non-gold parts; «سنگین» does not", () => {
  assert.equal(ex("گردنبند طلا با نگین برلیان").non_gold?.value, "stones");
  assert.equal(ex("دستبند طلا با بند بافت").non_gold?.value, "cord");
  assert.equal(ex("دستبند مهره ای طلا").non_gold?.value, "beads");
  assert.equal(ex("انگشتر طلا سنگین مردانه").non_gold, null);
  assert.equal(ex("انگشتر طلا", { "جنس نگین": "عقیق" }).non_gold?.value, "stones");
  assert.equal(ex("انگشتر طلا", { "نوع سنگ": "ندارد" }).non_gold, null);
});

test("BR-2A: a declared accessory cost is read as a non-gold cost; 0 means none", () => {
  const a = ex("دستبند طلا", { متعلقات: "250000" });
  assert.equal(a.non_gold?.value, "declared");
  assert.equal(a.non_gold_cost_toman?.value, 250_000);
  assert.equal(ex("دستبند طلا", { متعلقات: "0" }).non_gold, null);
});

test("BR-58: concrete style tags from the title", () => {
  assert.deepEqual(
    ex("گردنبند طلا مینیمال کارتیه لاو").style_tags.map((t) => t.value),
    ["کارتیه"],
  );
  assert.deepEqual(
    ex("زنجیر دو رنگ ایتالیایی").style_tags.map((t) => t.value),
    ["دو رنگ", "ایتالیایی"],
  );
});

test("specsFromDetails merges structural specs and key specs", () => {
  const body = {
    structural_specs: { headers: [{ header: "مشخصات کلی", specs: { عیار: "18" } }] },
    key_specs: [{ header: "مشخصات کلیدی", items: [{ key: "جنس", value: ["طلا"] }] }],
  };
  assert.deepEqual(specsFromDetails(body), { عیار: "18", جنس: "طلا" });
});

test("specsFromDetails keeps both values when the two spec lists share a key", () => {
  const body = {
    structural_specs: { headers: [{ specs: { جنس: "طلای 18 عیار (750)" } }] },
    key_specs: [{ items: [{ key: "جنس", value: ["طلا"] }] }],
  };
  assert.deepEqual(specsFromDetails(body), { جنس: "طلای 18 عیار (750), طلا" });
  assert.equal(ex("پلاک طلا پنتر", specsFromDetails(body)).karat?.value, 18);
});

test("BR-21: an English «weight» spec key is read too", () => {
  assert.equal(ex("پلاک طلا", { weight: "90 mg" }).weight_g?.value, 0.09);
});

test("specsFromDetails turns numeric spec values into text, so a numeric weight is still read", () => {
  const specs = specsFromDetails({ structural_specs: { headers: [{ specs: { وزن: 1.7 as unknown as string } }] } });
  assert.deepEqual(specs, { وزن: "1.7" });
  assert.equal(ex("النگو طلا", specs).weight_g?.value, 1.7);
});

test("AC-EX-08 (BR-29): an LLM number is kept only if it appears in the text", () => {
  assert.equal(acceptLlmNumber(1.25, "انگشتر ۱٫۲۵ گرمی"), true);
  assert.equal(acceptLlmNumber(2, "انگشتر ظریف طلا"), false);
});
