import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extract } from '../../../src/domains/catalog/extract.ts';
import { labelProduct } from '../../../src/domains/catalog/label.ts';

const G = 27_000_000;
const label = (
  title: string,
  opts: {
    price?: number | null;
    specs?: Record<string, string>;
    offerTitles?: string[];
    g?: number | null;
  } = {},
) => {
  const specs = opts.specs ?? {};
  return labelProduct({
    title,
    specs,
    attributes: extract({ title, specs, shop: null }),
    price: opts.price ?? null,
    g_at_fetch: opts.g === undefined ? G : opts.g,
    offer_titles: opts.offerTitles ?? [],
  });
};

test('AC-ML-01 (BR-31, BR-38): «ژوپینگ» wins over «۱۸ عیار»', () => {
  const r = label('دستبند ژوپینگ ۱۸ عیار', { price: 900_000 });
  assert.equal(r.label, 'not_gold');
  assert.deepEqual(r.reasons, ['در عنوان آمده: ژوپینگ']);
});

test('BR-31: plated silver and steel are not gold; «طلا طرح» in a real title is not «طرح طلا»', () => {
  assert.equal(label('انگشتر نقره آبکاری طلا').label, 'not_gold');
  assert.equal(label('گردنبند استیل رنگ ثابت').label, 'not_gold');
  assert.equal(
    label('دستبند طلا طرح کارتیه ۱۸ عیار وزن ۲ گرم', { price: 62_000_000 }).label,
    'real',
  );
});

test('AC-ML-02 (BR-32, CR-03): real gold on a cord is real, with the non-gold-parts flag', () => {
  const title = 'دستبند نخی با گوی طلا';
  const r = label(title);
  assert.equal(r.label, 'real');
  assert.equal(extract({ title, specs: {}, shop: null }).non_gold?.value, 'cord');
});

test('BR-32: «بند» inside «دستبند» does not make a bracelet mixed', () => {
  assert.equal(
    label('دستبند طلا ۱۸ عیار وزن ۲ گرم', { price: 62_000_000 }).label,
    'real',
  );
});

test('AC-ML-03 (BR-33, BR-35): «طلا روس» is decided by the price ratio', () => {
  assert.equal(
    label('انگشتر طلا روس ۱۸ عیار وزن ۱ گرم', { price: 32_400_000 }).label,
    'real',
  );
  const low = label('انگشتر طلا روس ۱۸ عیار وزن ۱ گرم', { price: 5_400_000 });
  assert.equal(low.label, 'review');
  assert.deepEqual(low.reasons, ['قیمت کمتر از ارزش طلای این وزن']);
});

test('AC-ML-04 (BR-34, BR-35): 1 g priced 5,000,000 at G 27,000,000 is review with ratio 0.185', () => {
  const r = label('پلاک طلا ۱۸ عیار وزن ۱ گرم', { price: 5_000_000 });
  assert.equal(r.label, 'review');
  assert.equal(Number(r.price_ratio!.toFixed(3)), 0.185);
});

test('AC-ML-05 (BR-36): ratio 4 without stones is review; with stones it stays real', () => {
  const r = label('انگشتر طلا ۱۸ عیار وزن ۱ گرم', { price: 108_000_000 });
  assert.equal(r.label, 'review');
  assert.deepEqual(r.reasons, ['احتمال خطای وزن یا واحد']);
  assert.equal(
    label('انگشتر طلا ۱۸ عیار با نگین برلیان وزن ۱ گرم', { price: 108_000_000 }).label,
    'real',
  );
});

test('AC-ML-06 (BR-37): a gold claim without weight stays real, flagged, never review', () => {
  const r = label('گردنبند طلا ۱۸ عیار', { price: 3_000_000 });
  assert.equal(r.label, 'real');
  assert.equal(r.weight_unknown, true);
  assert.deepEqual(r.reasons, ['وزن نامعلوم']);
});

test('BR-38: a clean real label has a readable reason', () => {
  const r = label('انگشتر طلا ۱۸ عیار وزن ۱ گرم', { price: 32_400_000 });
  assert.equal(r.label, 'real');
  assert.deepEqual(r.reasons, [
    'واژه‌ی طلا و عیار در عنوان آمده و قیمت با ارزش طلا جور است',
  ]);
});

test('BR-23, BR-38: real gold without a karat says the karat is assumed', () => {
  const r = label('انگشتر طلا وزن ۱ گرم', { price: 32_400_000 });
  assert.equal(r.label, 'real');
  assert.deepEqual(r.reasons, ['عیار فرض‌شده']);
});

test('BR-84: a shop title with a BR-31 word makes the product review', () => {
  const r = label('انگشتر طلا ۱۸ عیار وزن ۱ گرم', {
    price: 32_400_000,
    offerTitles: ['انگشتر آبکاری طلا'],
  });
  assert.equal(r.label, 'review');
  assert.deepEqual(r.reasons, ['عنوان یک فروشگاه با بقیه نمی‌خواند']);
});

test('BR-31 list (tuned): «رنگ کاملا ثابت»، «بدون حساسیت» and «ثبات رنگ» are not gold', () => {
  assert.equal(label('گردنبند پلاک طرح برگ رنگ کاملا ثابت').label, 'not_gold');
  assert.equal(label('سرویس ونکلیف نگین دار رنگ 100% ثابت تضمینی').label, 'not_gold');
  assert.equal(label('النگو آینه‌ای تخت طلا بدون حساسیت').label, 'not_gold');
});

test('CR-03: gold with pearls or a stone is real gold, never mixed', () => {
  assert.equal(label('گردنبند مروارید پرورشی با پلاک طلا').label, 'real');
  assert.equal(label('انگشتر طلا (نگین عقیق)').label, 'real');
});

test('AC-ML-09 (BR-3A, BR-37): no weight and a price under the gold value of 0.05 g is review; 3,000,000 stays real', () => {
  const r = label('النگو طلا سایز ۳', { price: 270_000 });
  assert.equal(r.label, 'review');
  assert.deepEqual(r.reasons, ['قیمت از ارزش طلای کمترین وزن ممکن هم کمتر است']);
  const ok = label('النگو طلا سایز ۳', { price: 3_000_000 });
  assert.equal(ok.label, 'real');
  assert.ok(ok.reasons.includes('وزن نامعلوم'));
});

test('AC-ML-10 (BR-31): a BR-31 word in the material spec makes the product not gold', () => {
  const r = label('دستبند طلا', { specs: { جنس: 'مس با آبکاری طلا' } });
  assert.equal(r.label, 'not_gold');
  assert.deepEqual(r.reasons, ['در مشخصات آمده: آبکاری']);
});

test('BR-31: other spec keys are not scanned', () => {
  assert.equal(
    label('دستبند طلا ۱۸ عیار', { specs: { توضیحات: 'بدون آبکاری' } }).label,
    'real',
  );
});

test('CR-09 (PRD §12): a known weight with no gold price to check it against goes to review, never straight to real', () => {
  const r = label('پلاک طلا ۱۸ عیار وزن ۱ گرم', { price: 5_000_000, g: null });
  assert.equal(r.label, 'review');
  assert.deepEqual(r.reasons, ['قیمت طلای آن زمان برای سنجیدن قیمت در دست نبود']);
  assert.equal(r.price_ratio, null);
  assert.equal(
    label('پلاک طلا ۱۸ عیار', { price: 5_000_000, g: null }).label,
    'real',
    'without a weight there is nothing to check (BR-37)',
  );
});

test('CR-09 (BR-33): «طلا روس» with no price ratio to decide it is not gold; a weight and a price that fit gold keep it real', () => {
  const noWeight = label('النگو طلا روس پک ۶ عددی', { price: 1_370_000 });
  assert.equal(noWeight.label, 'not_gold');
  assert.deepEqual(noWeight.reasons, ['در عنوان آمده: طلا روس']);
  assert.equal(
    label('پک ۶ تایی النگوی طلاروس ۴ میل', { price: 944_000 }).label,
    'not_gold',
  );
  assert.equal(label('انگشتر طلای روسی زنانه', { price: 400_000 }).label, 'not_gold');
  assert.equal(
    label('النگو طلا روس وزن ۱ گرم', { price: 32_400_000, g: null }).label,
    'not_gold',
  );
  assert.equal(
    label('گردنبند خوشه انگور طلا روس وزن 74.41 گرم', { price: 2_582_747_000 }).label,
    'real',
  );
  assert.equal(label('دستبند طلا ۱۸ عیار مدل روسی', { price: 30_000_000 }).label, 'real');
  assert.equal(label('سرویس طلا عروس ۱۸ عیار', { price: 90_000_000 }).label, 'real');
});
