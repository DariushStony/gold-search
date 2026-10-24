import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuery, type ParsedQuery } from "../../src/core/parse.ts";

const val = (p: ParsedQuery, kind: string) => p.chips.filter((c) => c.kind === kind).map((c) => c.value);
const one = (p: ParsedQuery, kind: string) => val(p, kind)[0];

test("AC-QU-01 (BR-50, BR-52–BR-54): bracelet, max 20M, light, gift, Mother's Day", () => {
  const p = parseQuery("یه دستبند ظریف برای روز مادر تا ۲۰ تومن");
  assert.equal(one(p, "item_type"), "دستبند");
  assert.equal(one(p, "budget_max"), 20_000_000);
  assert.equal(one(p, "weight_pref"), "light");
  assert.equal(p.intent, "gift");
  assert.equal(one(p, "occasion"), "روز_مادر");
  assert.equal(p.ask, null);
});

test("AC-QU-03 (BR-52): «زیر ۳۰۰» and «سیصد چهارصد تومنی» ask for the unit; «حدود ۱۵ میلیون» is a target", () => {
  assert.deepEqual(parseQuery("یه انگشتر زیر ۳۰۰").ask?.kind, "budget_unit");
  assert.deepEqual(parseQuery("یه سکه سیصد چهارصد تومنی").ask?.kind, "budget_unit");
  assert.equal(val(parseQuery("یه انگشتر زیر ۳۰۰"), "budget_max").length, 0);
  assert.equal(one(parseQuery("گردنبند طلا حدود ۱۵ میلیون"), "budget_target"), 15_000_000);
});

test("BR-52: answering the unit question turns the amount into a chip from the user", () => {
  const p = parseQuery("یه انگشتر زیر ۳۰۰", { budget_unit: "million" });
  assert.equal(p.ask, null);
  const c = p.chips.find((x) => x.kind === "budget_max");
  assert.equal(c?.value, 300_000_000);
  assert.equal(c?.origin, "user");
});

test("BR-52: ranges, colloquial units and Finglish", () => {
  const range = parseQuery("پلاک طلا بینهایت برای کادو ۶ تا ۹ میلیون");
  assert.deepEqual([one(range, "budget_min"), one(range, "budget_max")], [6_000_000, 9_000_000]);
  const dash = parseQuery("در حد 2-3تومن چی بگیرم");
  assert.deepEqual([one(dash, "budget_min"), one(dash, "budget_max")], [2_000_000, 3_000_000]);
  const words = parseQuery("حدودا دو سه میلیون پول دارم");
  assert.deepEqual([one(words, "budget_min"), one(words, "budget_max")], [2_000_000, 3_000_000]);
  assert.equal(one(parseQuery("gift talaa baraye roze madar ta 20 milion"), "budget_max"), 20_000_000);
  assert.equal(one(parseQuery("۵۰ میلیون دارم النگوی کم اجرت میخوام"), "budget_max"), 50_000_000);
  assert.equal(one(parseQuery("طلا برای کادو نوزاد زیر یک میلیون"), "budget_max"), 1_000_000);
  assert.equal(one(parseQuery("اگه پونصد م داشته باشید چی میخرید"), "budget_max"), 500_000_000);
});

test("AC-QU-04 (BR-53): no intent cue ⇒ unknown with suggestions, never a blocking question", () => {
  const p = parseQuery("یه انگشتر طلا");
  assert.equal(p.intent, "unknown");
  assert.equal(p.suggest_intent, true);
  assert.equal(p.ask, null);
  const used = parseQuery("زنجیر طلای کارکرده ارزون");
  assert.equal(one(used, "condition"), "used");
  assert.equal(used.intent, "unknown");
  assert.equal(used.chips.some((c) => String(c.value).includes("ارزان")), false);
});

test("BR-53: savings and beauty cues", () => {
  assert.equal(parseQuery("دستبند طلای سنگین کم اجرت برای حفظ ارزش پول").intent, "savings");
  assert.equal(parseQuery("انگشتر طلا رزگلد طرح خاص برای خودم").intent, "beauty");
  assert.equal(parseQuery("النگو طلا آینه ای بدون اجرت").intent, "unknown");
});

test("AC-QU-07 (BR-57): coins and molten gold switch off jewelry ranking", () => {
  const p = parseQuery("سکه پارسیان یا طلای آب شده برای پس‌انداز");
  assert.equal(p.mode, "non_jewelry");
  assert.deepEqual(val(p, "form").sort(), ["آب‌شده", "سکه"]);
  assert.equal(p.intent, "savings");
  assert.equal(parseQuery("طلای آب شده بخرم یا النگو؟ ۱۰۰ تومن دارم").mode, "both");
});

test("AC-QU-08 (BR-54, BR-58): «کارتیه» is a style, «سنگین» a sort, «شیک» nothing", () => {
  const p = parseQuery("دستبند طلای کارتیه شیک و سنگین");
  assert.deepEqual(val(p, "style"), ["کارتیه"]);
  assert.equal(one(p, "weight_pref"), "heavy");
  assert.equal(p.chips.some((c) => c.value === "شیک"), false);
});

test("AC-QU-09 (BR-59): ojrat words become filters; «کمترین اجرت» also sorts", () => {
  assert.equal(one(parseQuery("النگو بدون اجرت"), "ojrat_max"), 2);
  assert.equal(one(parseQuery("النگو کم‌اجرت"), "ojrat_max"), 10);
  assert.equal(one(parseQuery("یه طلا میخوام که اجرتش زیر ۱۰ درصد باشه"), "ojrat_max"), 10);
  const lowest = parseQuery("النگو با کمترین اجرت");
  assert.equal(one(lowest, "ojrat_max"), 10);
  assert.equal(one(lowest, "ojrat_sort"), "asc");
});

test("AC-QU-10 (BR-5A): recipient is info only; «دختر» alone is women, not kids", () => {
  const dad = parseQuery("انگشتر مردونه برای تولد بابام");
  assert.equal(one(dad, "audience"), "men");
  assert.equal(one(dad, "recipient"), "پدر");
  assert.equal(dad.chips.find((c) => c.kind === "recipient")?.role, "info");
  const girl = parseQuery("النگو برای دختر نازم");
  assert.equal(one(girl, "audience"), "women");
  assert.equal(one(girl, "recipient"), "دختر");
  assert.equal(one(parseQuery("طلا برای نوزاد دختر چی بخرم"), "audience"), "kids_girl");
});

test("AC-QU-11 (BR-54): «۲ گرمی» is a weight target; «سنگین» only sorts", () => {
  assert.equal(one(parseQuery("دستبند ۲ گرمی"), "weight_target"), 2);
  const heavy = parseQuery("انگشتر سنگین");
  assert.equal(one(heavy, "weight_pref"), "heavy");
  assert.equal(heavy.chips.find((c) => c.kind === "weight_pref")?.role, "sort");
});

test("BR-50: karat, shop, Torob Pay, in-person, city and no-stones", () => {
  assert.equal(one(parseQuery("برای ولنتاین دستبند طلا قلب میخوام ۱۸ عیار"), "karat"), 18);
  assert.equal(one(parseQuery("کادوی روز زن یه گردنبند طلا ظریف از ماوی"), "shop"), "ماوی");
  assert.equal(one(parseQuery("دستبند طلا کادویی قسطی میخوام با ترب پی"), "torob_pay"), true);
  const local = parseQuery("النگو کم اجرت تهران حضوری بخرم");
  assert.equal(one(local, "in_person"), true);
  assert.equal(one(local, "city"), "تهران");
  assert.equal(one(parseQuery("النگو طلا بدون سنگ و نگین برای پس انداز"), "no_stones"), true);
});

test("EV-QRY tune split: suffixes, components, comparisons and word boundaries", () => {
  assert.equal(parseQuery("دستبند طلا کادویی قسطی میخوام با ترب پی").intent, "gift");
  assert.deepEqual(val(parseQuery("گردنبند طلای سفید با پلاک حرف"), "item_type"), ["گردنبند"]);
  const fin = parseQuery("tala ba ojrate kam baraye pasandaz 40 milion");
  assert.equal(fin.intent, "savings");
  assert.equal(one(fin, "budget_max"), 40_000_000);
  assert.equal(val(fin, "budget_min").length, 0);
  assert.ok(val(parseQuery("پلاک به اسم خودش بهتره یا و ان یکاد"), "style").includes("وان یکاد"));
  assert.equal(val(parseQuery("میخوام یه هدیه کوچیک براشون بگیرم"), "weight_pref").length, 0);
  assert.equal(val(parseQuery("بدون اجرت بگیرم یا با اجرت؟"), "ojrat_max").length, 0);
  assert.deepEqual(val(parseQuery("میتونم یه دستبندشو بردارم"), "item_type"), ["دستبند"]);
  const words = parseQuery("حدودا دو سه میلیون. نمیدونم");
  assert.deepEqual([one(words, "budget_min"), one(words, "budget_max")], [2_000_000, 3_000_000]);
  assert.equal(parseQuery("اگه پونصد م داشته باشید چی میخرید | دلار ؛شمش ،جواهرات طلا ؟").intent, "savings");
  assert.equal(one(parseQuery("گردنبند ماه تولد طلا کادو برای دخترم"), "occasion"), "تولد");
});

test("AC-QU-05, AC-QU-06 (BR-55, BR-56): rules only, every chip from the sentence", () => {
  const p = parseQuery("یه دستبند ظریف برای روز مادر تا ۲۰ تومن");
  assert.equal(p.llm_used, false);
  assert.ok(p.chips.every((c) => c.origin === "text"));
});

test("CR-04: words the rules did not read come back for the «متوجه نشدم» line", () => {
  const p = parseQuery("یه النگو سبک برای خانمم، حدود یک و نیم میلیون، تو مایه‌های ۲ گرم");
  assert.equal(one(p, "item_type"), "النگو");
  assert.match(p.unparsed ?? "", /نیم میلیون/);
  assert.doesNotMatch(p.unparsed ?? "", /النگو|سبک|خانم/);
  assert.match(parseQuery("یه چیز طلا برای مامانم که خوشش بیاد").unparsed ?? "", /خوشش بیاد/);
});

test("CR-04: the sample sentences and fully read sentences leave nothing unread", () => {
  for (const s of ["۵۰ میلیون دارم، النگوی کم‌اجرت که موقع فروش کمتر ضرر کنم", "یه دستبند ظریف برای روز مادر تا ۲۰ تومن",
    "زنجیر دو رنگ ایتالیایی مردانه", "یه انگشتر زیر ۳۰۰", "یه گردنبند برای تولد همسرم تا ۳۰ میلیون", "یه انگشتر طلا",
    "سکه پارسیان یا طلای آب شده برای پس‌انداز", "النگو ۲۰ گرمی زیر ۵ میلیون", "دستبند طلا"])
    assert.equal(parseQuery(s).unparsed, null, s);
});
