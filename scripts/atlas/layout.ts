// One Atlas page: shared header and footer, a section sidebar (a disclosure on a phone), breadcrumbs, the
// document, previous and next, and an on-page table of contents for long documents.
import { footer, header } from '../../src/web/templates/chrome.ts';
import type { Page } from './pages.ts';
import type { Heading } from './render.ts';

const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  );
const url = (p: Page) => (p.slug ? `/atlas/${p.slug}` : '/atlas');

function sidebar(pages: Page[], current: Page | null) {
  const sections = [...new Set(pages.map((p) => p.section))];
  const groups = sections
    .map((s) => {
      const links = pages
        .filter((p) => p.section === s)
        .map((p) => {
          const label = p.slug.startsWith('adr-') ? `${p.title.split(':')[0]}` : p.title;
          const hint = p.slug.startsWith('adr-')
            ? `<small>${esc(p.title.split(':').slice(1).join(':').trim())}</small>`
            : '';
          return `<li><a href="${url(p)}"${p === current ? ' aria-current="page"' : ''}${p.lang === 'en' ? ' lang="en"' : ''}>${esc(label)}${hint}</a></li>`;
        })
        .join('');
      return `<li><span class="nav-section">${esc(s)}</span><ul>${links}</ul></li>`;
    })
    .join('');
  return `<details class="atlas-nav" data-open-wide>
      <summary>فهرست اطلس</summary>
      <nav aria-label="فهرست اطلس"><ul>${groups}</ul></nav>
    </details>`;
}

function toc(headings: Heading[]) {
  if (headings.filter((h) => h.level === 2).length < 3) return '';
  const items = headings
    .map((h) => `<li class="l${h.level}"><a href="#${h.id}">${esc(h.text)}</a></li>`)
    .join('');
  return `<aside class="toc" aria-labelledby="toc-title"><details data-open-wide><summary id="toc-title">در این صفحه</summary><ol>${items}</ol></details></aside>`;
}

function statusBadge(p: Page) {
  if (!p.status) return '';
  return `<p class="status" data-tone="${p.status.tone}"><span>وضعیت در کد امروز</span> ${esc(p.status.text)} <small>برداشت از کد، نه سند تاریخی</small></p>`;
}

function document(opts: {
  page: Page;
  pages: Page[];
  body: string;
  headings: Heading[];
  prev: Page | null;
  next: Page | null;
}) {
  const { page, pages, body, headings, prev, next } = opts;
  const home = page.slug === '';
  const crumbs = home
    ? ''
    : `<nav class="crumbs" aria-label="مسیر"><a href="/atlas">اطلس</a><span aria-hidden="true">/</span><span>${esc(page.section)}</span><span aria-hidden="true">/</span><span aria-current="page"${page.lang === 'en' ? ' lang="en"' : ''}>${esc(page.title)}</span></nav>`;
  const english = page.lang === 'en';
  const pager = `<nav class="pager" aria-label="صفحه‌ی قبل و بعد">${prev ? `<a class="prev" href="${url(prev)}"><small>قبلی</small>${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a class="next" href="${url(next)}"><small>بعدی</small>${esc(next.title)}</a>` : ''}</nav>`;
  return `<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="robots" content="noindex" />
    <meta name="theme-color" content="#fffdf9" />
    <meta name="description" content="${esc(page.summary)}" />
    <title>${esc(home ? 'اطلس زرسنج، محصول و مهندسی' : `${page.title}، اطلس زرسنج`)}</title>
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700;800;900&display=swap" />
    <script src="/assets/theme-init.js"></script>
    <link rel="stylesheet" href="/assets/atlas.css" />
    <script type="module" src="/assets/atlas.js"></script>
  </head>
  <body class="atlas">
    ${header('atlas', home)}
    <div class="wrap atlas-layout${home ? ' is-home' : ''}">
      ${sidebar(pages, page)}
      <main id="content" class="atlas-main">
        ${crumbs}
        <article class="doc">
          <header class="doc-head">
            <p class="kicker">${esc(page.section)}</p>
            <h1${english ? ' lang="en" dir="ltr"' : ''}>${esc(page.title)}</h1>
            <p class="lede">${esc(page.summary)}</p>
            ${statusBadge(page)}
            ${english ? '<p class="lang-note">متن این سند همان سند انگلیسی مخزن است و ترجمه نشده.</p>' : ''}
          </header>
          <div class="doc-body"${english ? ' lang="en" dir="ltr"' : ''}>${body}</div>
        </article>
        ${pager}
      </main>
      ${toc(headings)}
    </div>
    ${footer()}
  </body>
</html>
`;
}

function notFound(pages: Page[]) {
  const guides = pages.filter((p) => p.lang === 'fa');
  return document({
    page: {
      slug: '404',
      file: '',
      title: 'این صفحه پیدا نشد',
      summary: 'نشانی اشتباه است یا صفحه جابه‌جا شده.',
      section: 'اطلس',
      lang: 'fa',
    },
    pages,
    body: `<p>از فهرست اطلس یکی از این صفحه‌ها را باز کنید:</p><ul>${guides.map((p) => `<li><a href="${url(p)}">${esc(p.title)}</a></li>`).join('')}</ul>`,
    headings: [],
    prev: null,
    next: null,
  });
}

export { document, notFound, url };
