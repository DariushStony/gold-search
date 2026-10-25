// The header and footer every page shares. Build scripts render them into the product page and the Atlas,
// so a destination or the credit line is written once.
type Section = 'search' | 'atlas';

const MARK = `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="var(--gold)"/><circle cx="16" cy="16" r="9.5" fill="none" stroke="var(--surface)" stroke-width="1.6" opacity=".7"/><path d="M11.5 12.5h9l-9 8h9" fill="none" stroke="var(--surface)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const THEME = `<div class="theme" role="group" aria-label="تم صفحه">
        <button type="button" data-theme-set="light" aria-pressed="false" aria-label="تم روشن" title="روشن"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
        <button type="button" data-theme-set="system" aria-pressed="true" aria-label="تم مثل دستگاه" title="مثل دستگاه"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg></button>
        <button type="button" data-theme-set="dark" aria-pressed="false" aria-label="تم تیره" title="تیره"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg></button>
      </div>`;

const current = (on: boolean) => (on ? ' aria-current="page"' : '');

function header(section: Section, atlasHome = false) {
  return `<a class="skip" href="#content">رفتن به محتوا</a>
    <header class="site" data-region>
      <div class="wrap site-in">
        <a class="brand" href="/">${MARK}زرسنج</a>
        <nav class="site-nav" aria-label="بخش‌های سایت">
          <a href="/"${current(section === 'search')}>جست‌وجو</a>
          <a href="/atlas"${current(section === 'atlas' && atlasHome)}${section === 'atlas' && !atlasHome ? ' class="in-section"' : ''}>اطلس <small>محصول و مهندسی</small></a>
        </nav>
        ${THEME}
      </div>
    </header>`;
}

function footer() {
  return `<footer class="site-foot" data-region>
      <div class="wrap">
        <p class="credit">زرسنج، جست‌وجوی طلا با یک جمله روی داده‌ی ترب. طراحی و ساخت: <b>داریوش هادی‌پور</b> (Dariush Hadipour)، محصول و مهندسی.</p>
        <p>نسخه‌ی مفهومی غیررسمی است و وابسته به ترب نیست. داده: ترب (جست‌وجو و صفحه‌ی کالا)، تابلوی اتحادیه‌ی طلای تهران و tgju. «سازگار با طلای واقعی» یعنی ادعای فروشنده و قیمت با هم جورند، نه تأیید فیزیکی.</p>
        <nav aria-label="پیوندهای پایین صفحه"><a href="/">جست‌وجو</a><a href="/atlas">اطلس محصول و مهندسی</a><a href="/atlas/limits">محدودیت‌ها و کارهای بعدی</a></nav>
      </div>
    </footer>`;
}

export { header, footer, type Section };
