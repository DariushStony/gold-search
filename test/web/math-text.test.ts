import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  gapLine,
  premiumText,
  resaleLine,
  riseText,
  sheetRows,
} from '../../src/web/scripts/math-text.ts';
import type { Breakdown } from '../../src/web/scripts/types.ts';

const inputs = {
  weight_g: 3.02,
  karat: 18,
  karat_assumed: false,
  g_at_fetch: 25_714_500,
  g_live: null,
  profit: 0.07,
  vat: 0.1,
};
const below: Breakdown = {
  gold_value: 77_657_790,
  premium_pct: -5.87,
  parts: null,
  no_split_reason: 'below_gold_value',
  partial_reason: null,
  resale_value: 76_622_212,
  resale_loss_pct: -4.82,
  breakeven_g: 24_533_598,
  required_rise_pct: -4.59,
  inputs,
};

test('CR-10: no negative percentage reaches the page; the words carry the direction', () => {
  assert.equal(premiumText(below), '<b>٪۵٫۹</b> زیر ارزش طلا');
  assert.equal(
    premiumText({ ...below, premium_pct: 7.1 }),
    '<b>٪۷٫۱</b> بالاتر از ارزش طلا',
  );
  assert.equal(
    resaleLine(below),
    'اگر بخرید و همین الان بفروشید، حدود ٪۴٫۸ بیشتر از پولتان برمی‌گردد (برآورد)',
  );
  assert.equal(
    resaleLine({ ...below, resale_loss_pct: 7.9 }),
    'اگر بخرید و همین الان بفروشید، حدود ٪۷٫۹ کمتر برمی‌گردد (برآورد)',
  );
  assert.equal(
    riseText(below),
    '۲۴٬۵۳۳٬۵۹۸ تومان. حتی اگر طلا ٪۴٫۶ ارزان شود ضرر نمی‌کنید',
  );
  assert.equal(
    riseText({ ...below, required_rise_pct: 8.5 }),
    '۲۴٬۵۳۳٬۵۹۸ تومان، یعنی طلا باید ٪۸٫۵ گران شود',
  );
  for (const s of [premiumText(below), resaleLine(below), riseText(below)]) {
    assert.doesNotMatch(s, /-|−/);
  }
});

test('CR-10: below the gold value the sheet shows the gap and why, never ojrat, profit or VAT', () => {
  const { rows, note } = sheetRows(below, 73_100_000);
  assert.deepEqual(rows, [
    ['ارزش طلا', '۷۷٫۷ میلیون تومان'],
    ['قیمت', '۷۳٫۱ میلیون تومان'],
    ['کمتر از ارزش طلا', '۴٫۶ میلیون تومان (٪۵٫۹)'],
  ]);
  assert.equal(
    note,
    'اجرت و سود را از این قیمت نمی‌شود درآورد. شاید قیمت فروشگاه قدیمی است یا عیار کمتر از ۱۸ است.',
  );
  assert.equal(
    gapLine(below, 73_100_000),
    'قیمت ۴٫۶ میلیون تومان کمتر از ارزش طلای همین وزن است',
  );
});

test('CR-10: a thin margin is one amount, with the reason it is not split', () => {
  const thin: Breakdown = {
    ...below,
    gold_value: 45_928_900,
    premium_pct: 7.08,
    no_split_reason: 'thin_margin',
  };
  const { rows, note } = sheetRows(thin, 49_179_516);
  assert.deepEqual(rows, [
    ['ارزش طلا', '۴۵٫۹ میلیون تومان'],
    ['اجرت، سود و مالیات با هم', '۳٫۳ میلیون تومان (٪۷٫۱)'],
    ['قیمت', '۴۹٫۲ میلیون تومان'],
  ]);
  assert.equal(
    note,
    'این فاصله از سود معمول فروشنده (٪۷٫۰) هم کمتر است، پس اجرت و سود را جدا نمی‌کنیم.',
  );
});

test('a normal price keeps the four parts', () => {
  const parts = { gold: 27_000_000, ojrat: 6_262_532, profit: 2_328_377, vat: 859_091 };
  const { rows, note } = sheetRows(
    { ...below, gold_value: 27_000_000, premium_pct: 35, parts, no_split_reason: null },
    36_450_000,
  );
  assert.deepEqual(
    rows.map(([k]) => k),
    ['ارزش طلا', 'اجرت (برآوردی)', 'سود', 'مالیات', 'قیمت'],
  );
  assert.equal(note, null);
});
