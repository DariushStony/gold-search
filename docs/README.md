# مستندات

| | |
| --- | --- |
| وضعیت | زنده |
| نسخه | ۰.۳ |
| مالک | داریوش هادی‌پور |
| آخرین به‌روزرسانی | ۱۴۰۵/۰۸/۰۱ (2026-10-23) |
| ورودی‌ها | — |
| استاندارد | قالب‌های عمومی: one-page brief، PRD (ISO/IEC 25010 برای نیازمندی‌های غیرعملکردی)، Google design doc و C4 برای TDD، MADR برای ADR، ISO/IEC/IEEE 29119 برای تست |

> این پوشه سندهای محصول، طراحی، مهندسی و ارزیابی را نگه می‌دارد. کد فقط بعد از تأیید سندهای پیش‌نیازش نوشته می‌شود. دستورهای agentها جدا هستند و در `AGENTS.md` ریشه‌ی مخزن می‌آیند.

## ۱. ساختار پوشه‌ها

```
.
├── README.md                 ← پروژه در یک نگاه
├── AGENTS.md                 ← (بعداً) دستورهای agentها؛ جدا از سندهای انسان
├── spikes/                   ← کد دورریختنی: جمع‌آورنده، اسکریپت‌های ارزیابی
└── docs/
    ├── README.md             ← همین سند
    ├── product/              ← چه می‌سازیم و چرا (فارسی)
    │   ├── brief.md          ← خلاصه‌ی یک‌صفحه‌ای (Gate 1)
    │   ├── prd.md            ← نیازمندی‌ها، business rules، مدل درآمد، معیارهای پذیرش
    │   ├── decisions.md      ← تصمیم‌ها با شناسه‌ی D-xx
    │   ├── contract-freeze.md ← چک‌لیست و امضای انجماد (مرحله‌ی ۰۴)
    │   ├── change-requests.md ← تغییر قراردادها بعد از انجماد
    │   ├── market-research.md← بازار طلا، ترب، شواهد با منبع
    │   └── gate-2.md         ← چک‌لیست Gate 2
    ├── design/
    │   ├── ia-user-flows.md  ← صفحه‌ها، جریان‌ها، حالت‌ها، tokenها، اجزا
    │   ├── content-guide.md  ← لحن، قالب عدد و زمان، همه‌ی متن‌های رابط
    │   └── prototype.html    ← پروتوتایپ کلیکی روی کالاهای واقعی
    ├── engineering/          ← (English)
    │   ├── tdd.md            ← طراحی فنی (C4، جریان‌ها، استقرار)
    │   ├── data-model.md     ← لایه‌های داده و قاعده‌های DM-xx
    │   ├── api-contract.md   ← قرارداد API
    │   ├── tracking-plan.md  ← رویدادهای آنالیتیکس
    │   ├── threat-model.md   ← تهدیدها (STRIDE)
    │   ├── implementation-plan.md ← اپیک‌ها، ترتیب، ظرفیت
    │   └── adr/              ← سندهای تصمیم فنی (ADR-0001 تا ADR-0009)
    ├── qa/                   ← (English)
    │   ├── eval-plan.md      ← مجموعه‌های ارزیابی، سنجه‌ها، بازه‌های اطمینان
    │   ├── labeling-guide.md ← دستورالعمل برچسب‌زنی
    │   ├── test-strategy.md  ← راهبرد تست
    │   └── test-cases.md     ← سناریوهای اصلی تست
    └── evidence/             ← داده‌های خودمان با روش و فایل خام
```

## ۲. وضعیت سندها

| سند | وضعیت | مرحله |
| --- | --- | --- |
| [product/brief.md](product/brief.md) | تأییدشده | Gate 1 گذشت (D-18) |
| [product/decisions.md](product/decisions.md) | زنده | همه |
| [product/market-research.md](product/market-research.md) | پیش‌نویس | ۰۱ — بررسی‌شده با منبع |
| [product/prd.md](product/prd.md) | ۱.۴ منجمد (D-29، CR-01) | ساخت |
| [product/contract-freeze.md](product/contract-freeze.md)، [product/change-requests.md](product/change-requests.md) | زنده | ۰۴ |
| [product/gate-2.md](product/gate-2.md) | زنده | ۰۲ |
| [design/ia-user-flows.md](design/ia-user-flows.md)، [design/content-guide.md](design/content-guide.md) | منجمد (۰.۵، ۱.۲؛ D-29، CR-01) | ساخت |
| [design/prototype.html](design/prototype.html) | پروتوتایپ؛ منبع متن نیست | ۰۳ |
| [engineering/tdd.md](engineering/tdd.md)، [data-model.md](engineering/data-model.md)، [adr/](engineering/adr/) | پیش‌نویس ۰.۲ | ۰۳ (بعد از بازبینی فنی، D-28) |
| [engineering/api-contract.md](engineering/api-contract.md)، [tracking-plan.md](engineering/tracking-plan.md) | منجمد (۰.۴؛ D-29) | ساخت |
| [engineering/threat-model.md](engineering/threat-model.md)، [implementation-plan.md](engineering/implementation-plan.md) | پیش‌نویس ۰.۲ | ۰۳ |
| [qa/eval-plan.md](qa/eval-plan.md)، [qa/labeling-guide.md](qa/labeling-guide.md)، [qa/test-strategy.md](qa/test-strategy.md)، [qa/test-cases.md](qa/test-cases.md) | پیش‌نویس (test-cases ۰.۳: هر AC دست‌کم یک سناریو) | ۰۴ |

## ۳. روال کار

| مرحله | خروجی | دروازه |
| --- | --- | --- |
| ۰۱ تعریف محصول | brief: مسئله، کاربر، هدف، سنجه، محدوده | **Gate 1**: مسئله و سنجه‌ها نهایی |
| ۰۲ آمادگی | PRD با BR-xx و AC-xx؛ مجموعه‌ی ارزیابی اولیه | **Gate 2**: قانون‌ها و حالت‌های لبه کامل |
| ۰۳ طراحی و کشف فنی | design/، TDD، ADRها | — |
| ۰۴ انجماد | PRD، طراحی، قرارداد API و رویدادها ثابت می‌شوند | تغییر فقط با Change Request |
| ساخت، یکپارچه‌سازی، تست | کد، نتیجه‌ی ارزیابی با عدد | **Gate 3**: آماده‌ی ضبط |
| انتشار | ویدیو، نسخه‌ی زنده، ارسال | — |

## ۴. مسیر خواندن

1. [README ریشه](../README.md) ← همین سند
2. [market-research.md](product/market-research.md): بازار و شواهد
3. [decisions.md](product/decisions.md): جواب هر «چرا؟»
4. [brief.md](product/brief.md) و بعد PRD

## ۵. قواعد

- هر سند با جدول هدر شروع می‌شود: وضعیت، نسخه، مالک، آخرین به‌روزرسانی، ورودی‌ها، استاندارد.
- وضعیت‌ها: خالی ← پیش‌نویس ← در بازبینی ← تأییدشده ← منسوخ. لاگ‌ها «زنده» هستند.
- شناسه‌ها ثابت‌اند: D-xx (تصمیم)، BR-xx (قانون)، AC-xx (معیار پذیرش)، EV-xx (مورد ارزیابی).
- هر عدد و هر ادعا کنار خودش شناسه‌ی منبع (S-xx) دارد که به جدول منابع همان سند می‌رسد (D-14). عدد بدون اندازه‌ی نمونه و تاریخ نوشته نمی‌شود. جانشین‌ها صریحاً «جانشین» نوشته می‌شوند. داده‌ی ساختگی همیشه علامت می‌خورد.
- داده‌ای که خودمان جمع می‌کنیم، با روش و فایل خام، در `docs/evidence/` می‌آید.

## ۶. سیاست زبان

| حوزه | زبان |
| --- | --- |
| محصول، طراحی | فارسی (اصطلاح انگلیسی در پرانتز) |
| مهندسی، ارزیابی، AGENTS.md | English |
