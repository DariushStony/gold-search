import { post } from './api.ts';
import { $, esc } from './dom.ts';
import { count, gram, pct, toman, when } from './fmt.ts';
import { resaleValueText, REVIEW_NO_RESALE, riseText, sheetRows } from './math-text.ts';
import { openOverlay } from './overlay.ts';
import { noBreakdown } from './results.ts';
import { rankOf, st, track } from './state.ts';
import { COMPONENT, LABEL, VAL } from './text.ts';
import type { ProductResponse } from './types.ts';

// The parts of the BR-62 score that this product earned, largest first; parts with no weight for this
// search (CR-09) are left out. Values come straight from the API, nothing is recomputed here.
function whyRank(d: ProductResponse) {
  const parts = d.components
    .filter((c) => c.weight > 0)
    .map((c) => ({ ...c, share: c.weight * c.value }))
    .sort((a, b) => b.share - a.share);
  if (!parts.length) return '';
  const intent = st.last?.intent;
  const rows = parts
    .map(
      (c) =>
        `<li><span>${COMPONENT[c.name] ?? c.name}</span><span class="bar" role="img" aria-label="${count(Math.round(c.value * 100))} از ۱۰۰"><span style="width:${(c.value * 100).toFixed(0)}%"></span></span><span class="fine num">وزن ${pct(c.weight * 100)}</span></li>`,
    )
    .join('');
  return `<h3 class="section-title">این رتبه از کجا آمده</h3>
    <p class="fine num">امتیاز ${count(Math.round(d.score * 100))} از ۱۰۰، جمع وزن‌دار این عامل‌ها${intent && intent !== 'unknown' ? ` برای نیت «${VAL[intent] ?? intent}»` : ''}. نوار هر عامل نمره‌ی همین کالاست.</p>
    <ol class="why-rank">${rows}</ol>`;
}

async function openSheet(id: string, opener: HTMLElement | null = null) {
  let d: ProductResponse;
  try {
    d = await post<ProductResponse>(`/products/${encodeURIComponent(id)}`, {
      chips: st.chips,
      snapshot_id: st.last?.snapshot.id,
    });
  } catch {
    return;
  }
  track('breakdown_opened', { product_id: id, rank: rankOf(id), label: d.label });
  const b = d.offer.breakdown;
  const split = b && !b.partial_reason ? sheetRows(b, d.offer.price) : null;
  const math =
    b && split
      ? `<p class="fine num">همه‌ی مبلغ‌های این جدول با قیمت فروشگاه و قیمت طلای ${when(d.offer.fetched_at)} حساب شده‌اند.</p>
      <table class="bd num">${split.rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}
      ${
        d.label === 'review'
          ? ''
          : `<tr><td>اگر بخرید و همین الان بفروشید (برآورد)</td><td>${resaleValueText(b)}</td></tr>
      <tr><td>قیمت سربه‌سر طلا</td><td>${riseText(b)}</td></tr>`
      }</table>
      ${split.note ? `<p class="note">${split.note}</p>` : ''}
      ${d.label === 'review' ? `<p class="note">${REVIEW_NO_RESALE}</p>` : ''}
      <p class="inputs num">ورودی‌های این عدد: وزن ${gram(b.inputs.weight_g)}، عیار ${count(b.inputs.karat)}${b.inputs.karat_assumed ? ' (عیار فرض‌شده)' : ''}، قیمت طلا در ${when(d.offer.fetched_at)}: ${toman(b.inputs.g_at_fetch, true)}${b.inputs.g_live ? ` (قیمت طلای امروز ${toman(b.inputs.g_live, true)}، فقط برای مقایسه)` : ''}، سود ${pct(b.inputs.profit * 100)} و مالیات ${pct(b.inputs.vat * 100)} روی اجرت و سود</p>`
      : `<p>${b?.partial_reason ? 'قطعه‌ی غیرطلا دارد و مقایسه با ارزش طلا کامل نیست' : noBreakdown(d.offer.no_breakdown_reason)}</p>`;
  const shops = d.offers
    .slice(0, 5)
    .map(
      (o) =>
        `<tr><td>${esc(o.shop ?? 'ارزان‌ترین فروشگاه')}${o.city ? '، ' + esc(o.city) : ''}${o.channel === 'in_person' ? '، حضوری' : ''}${o.stale ? ' (قدیمی)' : ''}</td><td>${toman(o.price)}<br><span class="fine">دریافت: ${when(o.fetched_at)}</span></td></tr>`,
    )
    .join('');
  const sheet = $('sheet');
  sheet.innerHTML = `<button class="close" type="button" data-close aria-label="بستن">×</button>
    <h2 id="sh-t" data-autofocus tabindex="-1">${esc(d.title)}</h2>
    <p class="meta">${LABEL[d.label][1]}${d.reasons?.length ? '، ' + esc(d.reasons.join('، ')) : ''}</p>
    ${math}
    ${whyRank(d)}
    <h3 class="section-title">فروشگاه‌ها</h3>
    <table class="bd num">${shops}</table>
    <a class="cta" id="go" href="${esc(d.offer.url)}" target="_blank" rel="noopener">دیدن در فروشگاه</a>`;
  $('go').addEventListener('click', () =>
    track('offer_clicked', {
      product_id: id,
      rank: rankOf(id),
      label: d.label,
      intent: st.last?.intent,
      premium_pct: b?.premium_pct ?? null,
      torob_pay: d.offer.torob_pay,
      channel: d.offer.channel,
      representative: true,
      stale: d.offer.stale,
    }),
  );
  openOverlay(sheet, { opener });
}

export { openSheet };
