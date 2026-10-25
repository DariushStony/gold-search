import { post } from './api.ts';
import { $, esc } from './dom.ts';
import { count, gram, pct, toman, when } from './fmt.ts';
import { noBreakdown } from './results.ts';
import { rankOf, st, track } from './state.ts';
import { LABEL } from './text.ts';
import type { ProductResponse } from './types.ts';

export function closeSheet() {
  $('sheet').classList.remove('open');
  $('bg').style.display = 'none';
}

export async function openSheet(id: string) {
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
  const rows: [string, number][] = b?.parts
    ? [
        ['ارزش طلا', b.parts.gold],
        ['اجرت (برآوردی)', b.parts.ojrat],
        ['سود', b.parts.profit],
        ['مالیات', b.parts.vat],
        ['قیمت', d.offer.price],
      ]
    : [];
  const math =
    b && rows.length
      ? `<p class="fine num">همه‌ی مبلغ‌های این جدول با قیمت فروشگاه و قیمت طلای ${when(d.offer.fetched_at)} حساب شده‌اند.</p>
      <table class="bd num">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${toman(v)}</td></tr>`).join('')}
      <tr><td>اگر بخرید و همین الان بفروشید (برآورد)</td><td>${toman(b.resale_value)}، یعنی ${pct(b.resale_loss_pct)} کمتر</td></tr>
      <tr><td>قیمت سربه‌سر طلا</td><td>${toman(b.breakeven_g, true)}، یعنی ${pct(b.required_rise_pct)} رشد</td></tr></table>
      <div class="inputs num">ورودی‌های این عدد: وزن ${gram(b.inputs.weight_g)}، عیار ${count(b.inputs.karat)}${b.inputs.karat_assumed ? ' (عیار فرض‌شده)' : ''}، قیمت طلا در ${when(d.offer.fetched_at)}: ${toman(b.inputs.g_at_fetch, true)}${b.inputs.g_live ? ` (قیمت طلای امروز ${toman(b.inputs.g_live, true)}، فقط برای مقایسه)` : ''}، سود ${pct(b.inputs.profit * 100)} و مالیات ${pct(b.inputs.vat * 100)} روی اجرت و سود</div>`
      : `<p>${noBreakdown(d.offer.no_breakdown_reason)}</p>`;
  const shops = d.offers
    .slice(0, 5)
    .map(
      (o) =>
        `<tr><td>${esc(o.shop ?? 'ارزان‌ترین فروشگاه')}${o.city ? '، ' + esc(o.city) : ''}${o.channel === 'in_person' ? '، حضوری' : ''}${o.stale ? ' (قدیمی)' : ''}</td><td>${toman(o.price)}<br><span class="fine">دریافت: ${when(o.fetched_at)}</span></td></tr>`,
    )
    .join('');
  $('sheet').innerHTML =
    `<button class="close" id="x" aria-label="بستن">×</button><h2 id="sh-t">${esc(d.title)}</h2>
    <div class="meta">${LABEL[d.label][1]}${d.reasons?.length ? '، ' + esc(d.reasons.join('، ')) : ''}</div>
    ${math}
    <div class="section-title">فروشگاه‌ها</div>
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
  $('bg').style.display = 'block';
  requestAnimationFrame(() => $('sheet').classList.add('open'));
  $('x').addEventListener('click', closeSheet);
  $('x').focus();
}
