import { errorCode, post } from './api.ts';
import { $, esc } from './dom.ts';
import { count, gram, pct, toman, when } from './fmt.ts';
import { gapLine, premiumText, resaleLine, REVIEW_NO_RESALE } from './math-text.ts';
import { st, track } from './state.ts';
import { ERR, FORM, KIND, LABEL } from './text.ts';
import type { Breakdown, ErrorCode, ResultCard, SearchResponse } from './types.ts';

function showError(code: ErrorCode) {
  $('results').innerHTML =
    `<div class="state" role="alert"><p>${ERR[code] ?? 'مشکلی پیش آمد. دوباره امتحان کنید.'}</p><button type="button" data-retry>دوباره امتحان کنید</button></div>`;
  $('count').textContent = '';
}

const KEY = (color: string, text: string) =>
  `<span><i style="background:var(${color})"></i>${text}</span>`;

function strip(b: Breakdown, price: number) {
  const p = b.parts ?? {
    gold: b.gold_value,
    ojrat: price - b.gold_value,
    profit: 0,
    vat: 0,
  };
  const total = Math.max(1, p.gold + p.ojrat + p.profit + p.vat);
  const w = (x: number) => ((100 * Math.max(0, x)) / total).toFixed(2) + '%';
  const key = b.parts
    ? KEY('--gold', 'ارزش طلا') +
      KEY('--ojrat', 'اجرت') +
      KEY('--profit', 'سود') +
      KEY('--tax', 'مالیات')
    : KEY('--gold', 'ارزش طلا') + KEY('--ojrat', 'اجرت، سود و مالیات با هم');
  return `<div class="strip" role="img" aria-label="${Math.round((100 * p.gold) / total)} درصد قیمت ارزش طلاست"><span class="g" style="width:${w(p.gold)}"></span><span class="o" style="width:${w(p.ojrat)}"></span><span class="p" style="width:${w(p.profit)}"></span><span class="t" style="width:${w(p.vat)}"></span></div>
  <div class="strip-key" aria-hidden="true">${key}</div>`;
}

const noBreakdown = (reason: ResultCard['offer']['no_breakdown_reason']) =>
  reason === 'no_gold_quote'
    ? 'قیمت طلای زمان دریافت در دسترس نیست'
    : 'وزن اعلام نشده و نمی‌شود حساب کرد';

function card(c: ResultCard) {
  const o = c.offer;
  const b = o.breakdown;
  const [cls, text] = LABEL[c.label];
  const flags = [
    o.stale ? 'قدیمی' : '',
    o.torob_pay ? 'قسطی با ترب‌پی' : '',
    b?.partial_reason ? 'قطعه‌ی غیرطلا دارد' : '',
  ]
    .filter(Boolean)
    .map((x) => `<span class="badge flag">${x}</span>`)
    .join('');
  const meta = [
    c.weight_g ? gram(c.weight_g) : 'وزن نامعلوم',
    c.offer_count > 1
      ? `${count(c.offer_count)} فروشگاه`
      : (o.shop ?? 'ارزان‌ترین فروشگاه'),
  ].join('، ');
  const math = !b
    ? `<p class="resale">${noBreakdown(o.no_breakdown_reason)}</p>`
    : (b.partial_reason
        ? `<p class="resale">قطعه‌ی غیرطلا دارد و مقایسه با ارزش طلا کامل نیست</p>`
        : b.no_split_reason === 'below_gold_value'
          ? `<p class="resale num gap">${gapLine(b, o.price)}</p>`
          : strip(b, o.price)) +
      `<p class="resale num">${c.label === 'review' ? REVIEW_NO_RESALE : resaleLine(b)}</p>`;
  const media = c.image_url
    ? `<img src="${esc(c.image_url)}" alt="" loading="lazy" decoding="async">`
    : `<span class="noimg">بدون تصویر</span>`;
  return `<article class="card">
    <div class="card-media">${media}</div>
    <div class="card-body">
      <h3 class="card-title"><button type="button" class="card-open" data-open="${esc(c.id)}">${esc(c.title)}</button></h3>
      <div class="badges"><span class="badge ${cls}">${text}</span>${flags}</div>
      <p class="meta num">${esc(meta)}</p>
      <div class="price-row"><span class="price num">${toman(o.price)}</span><span class="fine num">قیمت ${when(o.fetched_at)}</span></div>
      ${b && !b.partial_reason ? `<p class="premium num">${premiumText(b)}</p>` : ''}
      ${math}
    </div></article>`;
}

function savingsCard(s: NonNullable<SearchResponse['savings_card']>) {
  const rows = s.rows
    .map(
      (
        x,
      ) => `<tr><td>${FORM[x.form]}${x.own_product ? ` <span class="own">محصول ترب</span>` : ''}</td>
      <td class="num">${x.round_trip_cost_pct == null ? 'داده در دسترس نیست' : pct(x.round_trip_cost_pct)}</td><td class="own">${x.source_url ? `<a href="${esc(x.source_url)}" target="_blank" rel="noopener">${esc(x.source)}</a>` : esc(x.source)}</td></tr>`,
    )
    .join('');
  return `<section class="savings" aria-labelledby="savings-title"><h2 class="section-title" id="savings-title" style="margin-top:0">هزینه‌ی رفت‌وبرگشت، کنار هم</h2>
    ${s.notice ? `<p>سکه و شمش اینجا رتبه‌بندی نمی‌شوند</p>` : ''}
    <table><tr><th>شکل</th><th>هزینه‌ی رفت‌وبرگشت</th><th>منبع</th></tr>${rows}</table>
    <p class="fine">این مقایسه‌ی هزینه است، نه توصیه‌ی سرمایه‌گذاری</p></section>`;
}

const section = (title: string, list: ResultCard[]) =>
  list.length
    ? `<h2 class="section-title">${title}</h2><div class="grid">${list
        .slice(0, 10)
        .map(card)
        .join('')}</div>`
    : '';

let latest = 0;

async function run() {
  const mine = ++latest;
  $('toolbar').hidden = false;
  $('results').setAttribute('aria-busy', 'true');
  $('results').innerHTML = '<div class="skeleton"></div>'.repeat(3);
  $('count').textContent = 'در حال جست‌وجو';
  let r: SearchResponse;
  try {
    r = await post<SearchResponse>('/search', { chips: st.chips });
  } catch (code) {
    if (mine === latest) showError(errorCode(code));
    return;
  } finally {
    if (mine === latest) $('results').removeAttribute('aria-busy');
  }
  if (mine !== latest) return; // an older answer arriving after a newer search must not overwrite it
  st.last = r;
  $('suggest').hidden = !r.suggest_intent;
  $('suggest').innerHTML = r.suggest_intent
    ? `برای چه می‌خرید؟ <button type="button" data-intent="gift">هدیه</button><button type="button" data-intent="beauty">زیبایی</button><button type="button" data-intent="savings">پس‌انداز</button>`
    : '';
  $('count').textContent = `${count(r.results.length)} نتیجه`;
  $('showEx').hidden = !r.excluded_count;
  $('showEx').textContent = `${count(r.excluded_count)} مورد غیرطلا کنار گذاشته شد`;
  $('excluded').hidden = true;
  // the «چرا اولی؟» line goes above the grid, so it never leaves the first card alone on its row
  let html =
    (r.explanation ? `<p class="why num">${esc(r.explanation.text)}</p>` : '') +
    r.results.slice(0, 24).map(card).join('');
  if (!r.results.length && r.mode !== 'non_jewelry') {
    html = r.relax
      ? `<div class="state"><p>با «${esc(KIND[r.relax.kind])}» چیزی پیدا نشد. برداشتنش ${count(r.relax.results_if_removed)} نتیجه برمی‌گرداند.</p><button type="button" data-relax="${r.relax.chip_index}">برداشتن «${esc(KIND[r.relax.kind])}»</button></div>`
      : `<div class="state"><p>هیچ طلای واقعی برای این جست‌وجو پیدا نشد. یکی از فیلترها را بردارید یا جمله را عوض کنید.</p></div>`;
  }
  $('results').innerHTML = html;
  $('savings').innerHTML = r.savings_card ? savingsCard(r.savings_card) : '';
  $('sections').innerHTML =
    section('وزنشان اعلام نشده', r.weight_unknown_bucket) +
    section('اجرت قابل محاسبه نیست', r.ojrat_unknown) +
    section('نیاز به بررسی', r.review) +
    section('آگهی', r.sponsored);
  track('query_submitted', {
    text: st.text,
    intent: r.intent,
    chip_kinds: st.chips.map((c) => c.kind),
    mode: r.mode,
    llm_used: st.llm,
    results_real: r.results.length,
    results_mixed: 0,
    results_review: r.review.length,
    excluded_count: r.excluded_count,
    archive_mode: r.snapshot.archive_mode,
  });
}

function clearResults() {
  for (const id of ['results', 'savings', 'sections']) $(id).innerHTML = '';
  $('count').textContent = '';
  $('showEx').hidden = true;
  $('suggest').hidden = true;
}

// A product photo that fails to load becomes a quiet placeholder instead of a broken image.
function initImages() {
  document.addEventListener(
    'error',
    (e) => {
      const img = e.target;
      if (img instanceof HTMLImageElement && img.closest('.card-media')) {
        img.replaceWith(
          Object.assign(document.createElement('span'), {
            className: 'noimg',
            textContent: 'بدون تصویر',
          }),
        );
      }
    },
    true,
  );
}

export { run, showError, clearResults, noBreakdown, initImages };
