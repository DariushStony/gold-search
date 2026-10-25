// UI texts the core emits, with their content-guide ids (docs/design/content-guide.md).
export const TX = {
  inTitle: (word: string) => `در عنوان آمده: ${word}`, // TX-09
  belowGoldValue: 'قیمت کمتر از ارزش طلای این وزن', // TX-10
  weightOrUnitError: 'احتمال خطای وزن یا واحد', // TX-11
  weightUnknown: 'وزن نامعلوم', // TX-12
  shopTitleMismatch: 'عنوان یک فروشگاه با بقیه نمی‌خواند', // TX-13
  consistentGold: 'واژه‌ی طلا و عیار در عنوان آمده و قیمت با ارزش طلا جور است', // TX-14
  karatAssumed: 'عیار فرض‌شده', // TX-20
  belowMinWeightValue: 'قیمت از ارزش طلای کمترین وزن ممکن هم کمتر است', // TX-93, BR-3A
  inSpecs: (word: string) => `در مشخصات آمده: ${word}`, // TX-94, BR-31
  noGoldPrice: 'قیمت طلای آن زمان برای سنجیدن قیمت در دست نبود', // TX-104, CR-09
} as const;
