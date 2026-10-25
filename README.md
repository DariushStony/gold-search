# زرسنج: جست‌وجوی طلا روی داده‌ی ترب

| | |
| --- | --- |
| وضعیت | دمو روی [Hamravesh Darkube](docs/engineering/adr/0012-hamravesh-darkube.md) |
| نسخه | ۰.۲ |
| مالک | داریوش هادی‌پور |
| آخرین به‌روزرسانی | ۱۴۰۵/۰۸/۰۳ (2026-10-25) |

یک دموی «ترب برای X» برای چالش استخدامی AI Product Engineer ترب. کاربر یک جمله‌ی آزاد فارسی می‌نویسد، مثلاً «یه دستبند ظریف برای روز مادر تا ۲۰ تومن». زرسنج جمله را به فیلتر و ترتیب تبدیل می‌کند، طلای واقعی را از بدلی جدا می‌کند، قیمت هر کالا را به ارزش طلا، اجرت، سود و مالیات می‌شکند و نتیجه‌ها را بر اساس نیت کاربر مرتب می‌کند.

- **خلاصه‌ی یک‌صفحه‌ای:** [docs/summary.md](docs/summary.md)
- **نقشه‌ی سندها:** [docs/README.md](docs/README.md)
- **تغییرها بعد از Contract Freeze:** [change-requests.md](docs/product/change-requests.md)

## ساختار

```text
src/
  app/          سرور HTTP، مسیرها، Rate limit و headerهای امنیتی
  core/         config و env (همه‌ی متغیرها در یک جا)
  domains/
    query/      جمله ← چیپ: اول قانون‌ها، بعد AI برای بخش خوانده‌نشده
    catalog/    استخراج وزن و عیار، برچسب طلای واقعی، پیشنهادها، بارگذاری Snapshot
    pricing/    قیمت طلا (اتحادیه و tgju)، شکستن قیمت، مبلغ برگشتی
    ranking/    فیلتر، امتیاز وزن‌دار بر اساس نیت، توضیح «چرا اولی؟»
    collection/ جمع‌آوری مؤدب از ترب و ساختن Snapshot
  shared/       قالب عدد و زمان، متن‌ها، یکسان‌سازی متن فارسی
  web/          صفحه: HTML، CSS با token برای تم روشن و تیره، ماژول‌های TypeScript
test/           هم‌شکل src
eval/           مجموعه‌های ارزیابی (EV-MAT، EV-PRM، EV-EXT، EV-QRY)
configs/        commitlint، knip، lint-staged
scripts/        build و dev صفحه
```

مرزها را oxlint نگه می‌دارد: `core` و `shared` هیچ domainی را import نمی‌کنند، صفحه فقط `shared` را import می‌کند و import چرخه‌ای ممنوع است. صفحه و سرور عدد و زمان را با یک کد قالب می‌زنند.

## AI کجاست و چطور کنترل می‌شود

- **فقط جایی که قانون‌ها کم می‌آورند.** هر جمله اول با قانون‌ها خوانده می‌شود. مدل (gpt-4.1-mini از طریق AvalAI) فقط وقتی صدا زده می‌شود که بخشی از جمله خوانده نشده باشد ([ADR-0005](docs/engineering/adr/0005-llm-gateway.md)، BR-55).
- **خروجی محدود.** JSON schema سخت‌گیر، temperature صفر و timeout چهار ثانیه. هر چیپی که مدل می‌سازد باید از فهرست مقدارهای مجاز باشد، قانون‌ها مقدار خودشان را نگه می‌دارند و هر عددی باید در خود جمله آمده باشد (`mergeLlm`).
- **هرگز مانع جواب نیست.** اگر مدل خطا بدهد یا دیر کند، جواب قانون‌ها برمی‌گردد. جواب‌ها cache می‌شوند تا یک جمله همیشه همان چیپ‌ها را بگیرد.
- **کاربر می‌بیند.** چیپی که AI ساخته «از جمله‌ی شما، با AI» نوشته می‌شود و بخشی که هیچ‌کس نخواند زیر چیپ‌ها می‌آید (CR-04، CR-05).
- **سنجیده شده.** روی ۱۲ جمله‌ی سختی که قانون‌ها هیچ‌کدام را نمی‌خواندند، قانون و gpt-4.1-mini در دو اجرا ۸ و ۷ مورد را درست خواندند. روی ۶۹ جمله‌ی بخش تنظیم EV-QRY دقت از ٪۹۸٫۶ پایین نیامد ([ev-llm-2026-10-24.json](docs/evidence/ev-llm-2026-10-24.json)، برچسب‌های جمله‌های سخت را سازنده زده است، D-14).

## کیفیت

- `pnpm check`: typecheck، oxlint، Prettier، knip و تست‌ها (`node:test`).
- Git hooks با husky: `pre-commit` فایل‌های stage شده را format و lint می‌کند، `commit-msg` پیام را با commitlint (Conventional Commits) می‌سنجد، `pre-push` typecheck و تست را اجرا می‌کند.
- CI روی GitHub Actions: `pnpm check`، `pnpm build` و ساختن image.
- Dockerfile سه‌مرحله‌ای: اگر تستی بشکند، Deploy انجام نمی‌شود. image نهایی فقط bundle سرور، صفحه و Snapshot را دارد و با کاربر `node` اجرا می‌شود.
- هر عدد در سندها منبع دارد و هر تغییر بعد از Contract Freeze یک ردیف CR دارد.

## اجرا

نیاز: Node 24 یا بالاتر (`.nvmrc`) و pnpm. `node:sqlite` و `node:test` داخلی‌اند.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

| دستور | کار |
| --- | --- |
| `pnpm dev` | صفحه با هر تغییر دوباره ساخته و سرور دوباره اجرا می‌شود |
| `pnpm demo` | ساختن صفحه و اجرای سرور |
| `pnpm check` | همه‌ی بررسی‌ها |
| `pnpm build` | bundle سرور و صفحه در `dist` |
| `pnpm eval` | مجموعه‌های ارزیابی روی بخش تنظیم |
| `node src/domains/collection/collect.ts` | جمع‌آوری از ترب |
| `pnpm snapshot` | ساختن Snapshot از داده‌ی خام |

بخش آزمون مجموعه‌های ارزیابی فقط در انتشار امتیاز می‌گیرد (`--split=test --release`، [برنامه‌ی ارزیابی](docs/qa/eval-plan.md) §۲).
