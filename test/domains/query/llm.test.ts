import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuery, type ParsedQuery } from "../../../src/domains/query/parse.ts";
import { mergeLlm, numbersIn, buildMessages } from "../../../src/domains/query/llm.ts";

const val = (p: ParsedQuery, kind: string) => p.chips.filter((c) => c.kind === kind).map((c) => c.value);
const TEXT = "یه النگو سبک برای خانمم، حدود یک و نیم میلیون، تو مایه‌های ۲ گرم";

test("numbersIn: digits, number words, and «و نیم» halves", () => {
  const n = numbersIn("حدود یک و نیم میلیون، ۲ گرم، بیست و پنج تومن، 0.5 سوت");
  for (const x of [1.5, 2, 25, 0.5]) assert.ok(n.includes(x), String(x));
});

test("BR-55: the LLM fills only what the rules left, and every number must come from the text", () => {
  const rules = parseQuery(TEXT);
  const { result, rejected } = mergeLlm(TEXT, rules, {
    chips: [
      { kind: "budget_target", value: 1_500_000 },
      { kind: "budget_max", value: 30_000_000 },
      { kind: "item_type", value: "النگو" },
    ],
    unparsed: null,
  })!;
  assert.deepEqual(val(result, "budget_target"), [1_500_000]);
  assert.deepEqual(val(result, "budget_max"), []);
  assert.deepEqual(val(result, "item_type"), ["النگو"]);
  assert.equal(result.llm_used, true);
  assert.equal(result.unparsed, null);
  assert.deepEqual(
    rejected.map((c) => c.kind),
    ["budget_max"],
  );
  assert.ok(result.chips.every((c) => c.origin === "text"));
});

test("BR-55: only defined chips and values pass; rules keep their own values", () => {
  const rules = parseQuery("۵۰ میلیون دارم یه سینه ریز طلا");
  const { result, rejected } = mergeLlm("۵۰ میلیون دارم یه سینه ریز طلا", rules, {
    chips: [
      { kind: "item_type", value: "سینه‌ریز" },
      { kind: "color", value: "زرد" },
      { kind: "item_type", value: "گردنبند" },
      { kind: "budget_max", value: 60_000_000 },
      { kind: "intent", value: "beauty" },
    ],
    unparsed: "سینه ریز",
  })!;
  assert.deepEqual(val(result, "item_type"), ["گردنبند"]);
  assert.deepEqual(val(result, "budget_max"), [50_000_000]);
  assert.equal(result.intent, "beauty");
  assert.equal(result.suggest_intent, false);
  assert.equal(result.unparsed, "سینه ریز");
  assert.equal(rejected.length, 3);
});

test("BR-55: a reply that is not the schema is ignored", () => {
  const rules = parseQuery(TEXT);
  assert.equal(mergeLlm(TEXT, rules, "not json"), null);
  assert.equal(mergeLlm(TEXT, rules, { chips: "x" }), null);
});

test("BR-74: the request travels as data, with what the rules already read", () => {
  const rules = parseQuery(TEXT);
  const msgs = buildMessages(TEXT, rules);
  assert.equal(msgs[0]!.role, "system");
  const user = JSON.parse(msgs[1]!.content);
  assert.equal(user.text, TEXT);
  assert.equal(user.not_understood, rules.unparsed);
  assert.ok(user.already_understood.some((c: { kind: string }) => c.kind === "item_type"));
});

test("chips the LLM added are marked, so the page can show they came from AI", () => {
  const rules = parseQuery(TEXT);
  const { result } = mergeLlm(TEXT, rules, { chips: [{ kind: "budget_target", value: 1_500_000 }], unparsed: null })!;
  assert.equal(result.chips.find((c) => c.kind === "budget_target")!.llm, true);
  assert.equal(result.chips.find((c) => c.kind === "item_type")!.llm, undefined);
});

test("BR-55: making-charge words map to the BR-59 numbers even with a typo", () => {
  const t = "ببین من دنبال ۵ تومن برای نامزدم هستم بدو اجرت باشه";
  const rules = parseQuery(t);
  const { result } = mergeLlm(t, rules, { chips: [{ kind: "ojrat_max", value: 2 }], unparsed: null })!;
  assert.ok(result.chips.some((c) => c.kind === "ojrat_max" && c.value === 2));
  assert.doesNotMatch(parseQuery("ببین یه النگو حدود یک و نیم میلیون").unparsed ?? "", /ببین/);
});
