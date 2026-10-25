# دموی چالش AI Product Engineer ترب

| | |
| --- | --- |
| وضعیت | پیش‌نویس |
| نسخه | ۰.۱ |
| مالک | داریوش هادی‌پور |
| آخرین به‌روزرسانی | ۱۴۰۵/۰۷/۲۸ (2026-10-20) |

یک دموی «ترب برای X» برای چالش استخدامی ترب: درخواست آزاد فارسی ← تمیز کردن داده‌ی چند منبع ← رتبه‌بندی بر اساس نیت کاربر ← توضیح بهترین انتخاب ← ویدیوی زیر ۵ دقیقه.

- **مرحله‌ی فعلی:** ساخت، M4؛ قراردادها منجمد (D-29). Gate 1 و Gate 2 گذشته (D-18، D-27).
- **نقشه‌ی سندها:** [docs/README.md](docs/README.md)

**خلاصه‌ی یک‌صفحه‌ای:** [docs/summary.md](docs/summary.md)؛ متن ویدیو: [docs/video-script.md](docs/video-script.md)

## اجرا

نیاز: Node 24 یا بالاتر (TypeScript مستقیم اجرا می‌شود؛ `node:sqlite` و `node:test` داخلی‌اند).

```bash
pnpm install
pnpm check
node src/collector/collect.ts
pnpm snapshot
pnpm demo
node eval/ev-mat.ts
```

بخش آزمون مجموعه‌های ارزیابی فقط در انتشار امتیاز می‌گیرد (`--split=test --release`؛ [برنامه‌ی ارزیابی](docs/qa/eval-plan.md) §۲).
