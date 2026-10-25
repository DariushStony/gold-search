import { pct, toman } from './fmt.ts';
import type { Breakdown } from './types.ts';

// CR-10: no negative number or percentage reaches the page; the words say which way it goes.

const premiumText = (b: Breakdown) =>
  b.premium_pct < 0
    ? `<b>${pct(-b.premium_pct)}</b> زیر ارزش طلا`
    : `<b>${pct(b.premium_pct)}</b> بالاتر از ارزش طلا`;

// CR-07: a percentage, so it holds whatever gold has done since the price was fetched.
const resaleLine = (b: Breakdown) =>
  b.resale_loss_pct < 0
    ? `اگر بخرید و همین الان بفروشید، حدود ${pct(-b.resale_loss_pct)} بیشتر از پولتان برمی‌گردد (برآورد)`
    : `اگر بخرید و همین الان بفروشید، حدود ${pct(b.resale_loss_pct)} کمتر برمی‌گردد (برآورد)`;

const resaleValueText = (b: Breakdown) =>
  `${toman(b.resale_value)}، یعنی ${pct(Math.abs(b.resale_loss_pct))} ${b.resale_loss_pct < 0 ? 'بیشتر' : 'کمتر'}`;

const riseText = (b: Breakdown) =>
  b.required_rise_pct < 0
    ? `${toman(b.breakeven_g, true)}. حتی اگر طلا ${pct(-b.required_rise_pct)} ارزان شود ضرر نمی‌کنید`
    : `${toman(b.breakeven_g, true)}، یعنی طلا باید ${pct(b.required_rise_pct)} گران شود`;

// A «مشکوک» price may rest on a wrong weight, so the page makes no promise about selling it back.
const REVIEW_NO_RESALE =
  'این کالا مشکوک است، پس مبلغ برگشتی و قیمت سربه‌سر را نشان نمی‌دهیم.';

const gapLine = (b: Breakdown, price: number) =>
  `قیمت ${toman(b.gold_value - price)} کمتر از ارزش طلای همین وزن است`;

function sheetRows(
  b: Breakdown,
  price: number,
): { rows: [string, string][]; note: string | null } {
  if (b.parts) {
    const p = b.parts;
    return {
      rows: [
        ['ارزش طلا', toman(p.gold)],
        ['اجرت (برآوردی)', toman(p.ojrat)],
        ['سود', toman(p.profit)],
        ['مالیات', toman(p.vat)],
        ['قیمت', toman(price)],
      ],
      note: null,
    };
  }
  if (b.no_split_reason === 'below_gold_value') {
    return {
      rows: [
        ['ارزش طلا', toman(b.gold_value)],
        ['قیمت', toman(price)],
        ['کمتر از ارزش طلا', `${toman(b.gold_value - price)} (${pct(-b.premium_pct)})`],
      ],
      note: 'اجرت و سود را از این قیمت نمی‌شود درآورد. شاید قیمت فروشگاه قدیمی است یا عیار کمتر از ۱۸ است.',
    };
  }
  return {
    rows: [
      ['ارزش طلا', toman(b.gold_value)],
      [
        'اجرت، سود و مالیات با هم',
        `${toman(price - b.gold_value)} (${pct(b.premium_pct)})`,
      ],
      ['قیمت', toman(price)],
    ],
    note: `این فاصله از سود معمول فروشنده (${pct(b.inputs.profit * 100)}) هم کمتر است، پس اجرت و سود را جدا نمی‌کنیم.`,
  };
}

export {
  premiumText,
  resaleLine,
  resaleValueText,
  riseText,
  REVIEW_NO_RESALE,
  gapLine,
  sheetRows,
};
