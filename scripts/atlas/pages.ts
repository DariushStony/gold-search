// The Atlas map: which documents are published, at which URL, in which order. Guides are written for the
// Atlas (Persian, docs/atlas); references are existing repo documents shown as they are (English), each with
// a Persian summary and, for decisions, a status read from the current code.
type Status = { text: string; tone: 'done' | 'partial' | 'replaced' | 'not-done' };
type Page = {
  slug: string;
  file: string;
  title: string;
  summary: string;
  section: string;
  lang: 'fa' | 'en';
  status?: Status;
};

const implemented = (text: string): Status => ({ text, tone: 'done' });

const GUIDES: Page[] = [
  {
    slug: '',
    file: 'docs/atlas/index.md',
    section: 'شروع',
    lang: 'fa',
    title: 'اطلس محصول و مهندسی زرسنج',
    summary: 'زرسنج چه می‌کند، برای چه کسی، چطور ساخته شده و از کجا شروع کنید.',
  },
  {
    slug: 'product',
    file: 'docs/atlas/product.md',
    section: 'محصول',
    lang: 'fa',
    title: 'محصول: مسئله، کاربر و سفرها',
    summary: 'چه مسئله‌ای را حل می‌کند، برای چه کسی، و دقیقاً چه چیزی امروز کار می‌کند.',
  },
  {
    slug: 'design',
    file: 'docs/atlas/design.md',
    section: 'محصول',
    lang: 'fa',
    title: 'طراحی تجربه و رابط',
    summary:
      'چرا رابط این شکل است: چیپ‌ها، فیلتر و ترتیب، کارت، نوار فاکتور، حالت‌ها و موبایل.',
  },
  {
    slug: 'architecture',
    file: 'docs/atlas/architecture.md',
    section: 'مهندسی',
    lang: 'fa',
    title: 'معماری و جریان داده',
    summary: 'اجزای سیستم، مسیر یک جست‌وجو از جمله تا نتیجه، و مسیر داده از ترب تا سرور.',
  },
  {
    slug: 'ai-search',
    file: 'docs/atlas/ai-search.md',
    section: 'مهندسی',
    lang: 'fa',
    title: 'AI و جست‌وجو',
    summary:
      'کجا مدل زبانی کار می‌کند، کجا قانون، چطور خروجی مدل کنترل می‌شود و رتبه از کجا می‌آید.',
  },
  {
    slug: 'decisions',
    file: 'docs/atlas/decisions.md',
    section: 'مهندسی',
    lang: 'fa',
    title: 'تصمیم‌ها و بده‌بستان‌ها',
    summary: 'تصمیم‌های مهم با دلیل و هزینه، و وضعیت واقعی هر ADR در کد امروز.',
  },
  {
    slug: 'quality',
    file: 'docs/atlas/quality.md',
    section: 'کیفیت و آینده',
    lang: 'fa',
    title: 'کیفیت، دسترس‌پذیری و کارایی',
    summary: 'چه چیزی تست و سنجیده شده، با چه عددی، و چه چیزی هنوز نه.',
  },
  {
    slug: 'limits',
    file: 'docs/atlas/limits.md',
    section: 'کیفیت و آینده',
    lang: 'fa',
    title: 'محدودیت‌ها و کارهای بعدی',
    summary: 'آنچه امروز کار نمی‌کند یا ضعیف است، و قدم‌های بعدی با ارزش و هزینه‌شان.',
  },
];

const ADR_STATUS: Record<string, Status> = {
  '0001': {
    text: 'بخشی اجرا شد: TypeScript سرتاسری بله، Next.js نه. دمو یک سرور ساده‌ی Node است (ADR-0010).',
    tone: 'partial',
  },
  '0002': {
    text: 'جایگزین شد با ADR-0013. جمع‌آوری روی سرور است و کار زمان‌بندی‌شده‌ی رایانه‌ی مالک حذف شد.',
    tone: 'replaced',
  },
  '0003': {
    text: 'بخشی اجرا شد: هر اجرا یک Snapshot تغییرناپذیر SQLite است. رویدادها در JSONL یا لاگ می‌روند، نه SQLite، و سرور فقط Snapshot فعلی را نگه می‌دارد.',
    tone: 'partial',
  },
  '0004': {
    text: 'کنار گذاشته شد: میزبان Hamravesh Darkube است (ADR-0012).',
    tone: 'replaced',
  },
  '0005': implemented('اجرا شده: AvalAI با gpt-4.1-mini و بازگشت به قانون‌ها.'),
  '0006': implemented('اجرا شده: اول قانون‌ها، بعد LLM با schema.'),
  '0007': implemented(
    'اجرا شده: تابلوی اتحادیه اصلی، tgju جایگزین، G هر پیشنهاد ذخیره می‌شود.',
  ),
  '0008': {
    text: 'در CI اجرا نشده: ارزیابی‌ها با pnpm eval روی دستگاه اجرا می‌شوند. CI فقط pnpm check و build را اجرا می‌کند.',
    tone: 'not-done',
  },
  '0009': implemented('اجرا شده: فقط مسیرهای مجاز robots.txt، با فاصله بین درخواست‌ها.'),
  '0010': implemented('اجرا شده: یک سرور HTTP ساده‌ی Node بدون framework.'),
  '0011': { text: 'جایگزین شد با ADR-0012.', tone: 'replaced' },
  '0012': implemented('اجرا شده: دموی زنده روی Darkube، با build چندمرحله‌ای.'),
  '0013': implemented(
    'اجرا شده: سرور ساعت ۱۰:۱۵ و ۱۸:۱۵ جمع می‌کند و هر اجرا را با Snapshot فعلی ادغام می‌کند.',
  ),
};

const ADR_FA: Record<string, string> = {
  '0001':
    'یک زبان برای pipeline، سرور و ارزیابی، تا هر قانون کسب‌وکار فقط یک پیاده‌سازی داشته باشد.',
  '0002':
    'داده روی رایانه‌ی مالک جمع و پردازش می‌شد. جمع‌آوری حالا روی خود سرور است (ADR-0013).',
  '0003':
    'هر اجرای جمع‌آوری یک فایل SQLite تغییرناپذیر می‌سازد، تا یک جمله روی یک داده همیشه یک جواب بگیرد.',
  '0004': 'میزبانی روی لیارا. پیش از اولین Deploy کنار گذاشته شد.',
  '0005':
    'مدل زبانی از درگاه AvalAI، با خروجی محدود به schema و بازگشت به قانون‌ها وقتی مدل نیست.',
  '0006': 'خواندن جمله اول با قانون‌های قابل سنجش، و مدل فقط برای باقی‌مانده.',
  '0007':
    'قیمت طلا از تابلوی اتحادیه، tgju به‌عنوان جایگزین، و قیمت زمان دریافت برای هر پیشنهاد.',
  '0008': 'ارزیابی خودکار با دروازه‌ی عددی در CI. هنوز به CI وصل نشده است.',
  '0009': 'جمع‌آوری مؤدب: فقط مسیرهای مجاز، آهسته، و توقف کامل جلوی دیوار ضدربات.',
  '0010': 'برای دمو، سرور ساده‌ی Node به جای Next.js، با همان قرارداد API.',
  '0011': 'Deploy روی Vercel. پیش از اولین Deploy با Hamravesh جایگزین شد.',
  '0012':
    'دمو روی Hamravesh Darkube از مخزن خصوصی، با image چندمرحله‌ای که بدون تست سبز Deploy نمی‌شود.',
  '0013':
    'جمع‌آوری روی خود سرور، دو بار در روز، و ادغام هر اجرا با Snapshot فعلی تا داده هیچ‌وقت بدتر نشود.',
};

const ADRS: Page[] = Object.keys(ADR_STATUS).map((n) => ({
  slug: `adr-${n}`,
  file: `docs/engineering/adr/${n}`,
  section: 'مرجع (English)',
  lang: 'en',
  title: '',
  summary: ADR_FA[n]!,
  status: ADR_STATUS[n],
}));

const REFERENCES: Page[] = [
  {
    slug: 'api',
    file: 'docs/engineering/api-contract.md',
    section: 'مرجع (English)',
    lang: 'en',
    title: 'API contract',
    summary: 'قرارداد کامل API: مسیرها، چیپ‌ها، شکل پاسخ‌ها و خطاها.',
  },
  {
    slug: 'data-model',
    file: 'docs/engineering/data-model.md',
    section: 'مرجع (English)',
    lang: 'en',
    title: 'Data model',
    summary: 'لایه‌های داده از فایل خام تا Snapshot، و قاعده‌های DM-xx.',
  },
];

const PAGES: Page[] = [...GUIDES, ...REFERENCES, ...ADRS];

export { PAGES, type Page };
