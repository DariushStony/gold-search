// Page copy that is not built from data (content guide).
import type { ChipKind } from '../../shared/chips.ts';

const SAMPLES = [
  'یه دستبند ظریف برای روز مادر تا ۲۰ تومن',
  '۵۰ میلیون دارم، النگوی کم‌اجرت که موقع فروش کمتر ضرر کنم',
];

const KIND: Record<string, string> = {
  intent: 'نیت',
  item_type: 'نوع',
  form: 'شکل',
  budget_min: 'حداقل بودجه',
  budget_max: 'حداکثر بودجه',
  budget_target: 'حدود بودجه',
  weight_min: 'حداقل وزن',
  weight_max: 'حداکثر وزن',
  weight_target: 'وزن',
  weight_pref: 'وزن',
  karat: 'عیار',
  audience: 'برای',
  recipient: 'گیرنده',
  condition: 'وضعیت',
  ojrat_max: 'حداکثر اجرت',
  ojrat_sort: 'ترتیب',
  no_stones: 'بدون سنگ',
  style: 'طرح',
  shop: 'فروشگاه',
  torob_pay: 'قسطی با ترب‌پی',
  in_person: 'حضوری',
  city: 'شهر',
  occasion: 'مناسبت',
  price_sort: 'ترتیب قیمت',
  premium_sort: 'ترتیب',
};

const VAL: Record<string, string> = {
  gift: 'هدیه',
  beauty: 'زیبایی',
  savings: 'پس‌انداز',
  light: 'سبک',
  heavy: 'سنگین',
  women: 'زنانه',
  men: 'مردانه',
  kids: 'بچگانه',
  kids_girl: 'نوزاد دختر',
  kids_boy: 'نوزاد پسر',
  used: 'دست‌دوم',
  asc: 'کمترین اول',
  desc: 'بیشترین اول',
};

const LABEL = {
  real: ['real', 'سازگار با طلای واقعی'],
  mixed: ['mixed', 'مخلوط'],
  not_gold: ['notgold', 'غیرطلا'],
  review: ['review', 'مشکوک'],
} as const;

const FORM: Record<string, string> = {
  jewelry: 'جواهر (همین نتایج)',
  used: 'طلای دست‌دوم',
  molten: 'طلای آب‌شده',
  digital: 'طلای دیجیتال',
  torob_gold: 'ترب طلا',
};

// CR-12: the sort control. A null chip is the BR-62 score order.
const SORTS: { id: string; label: string; chip: [ChipKind, string] | null }[] = [
  { id: 'relevance', label: 'پیشنهاد زرسنج', chip: null },
  { id: 'price_asc', label: 'ارزان‌ترین', chip: ['price_sort', 'asc'] },
  { id: 'price_desc', label: 'گران‌ترین', chip: ['price_sort', 'desc'] },
  { id: 'ojrat', label: 'کمترین اجرت', chip: ['ojrat_sort', 'asc'] },
  { id: 'premium', label: 'نزدیک‌ترین به ارزش طلا', chip: ['premium_sort', 'asc'] },
];

// The filter panel builds the same chips a sentence does; values are the ones extraction gives products.
const ITEM_TYPES = [
  'انگشتر',
  'گردنبند',
  'دستبند',
  'گوشواره',
  'النگو',
  'زنجیر',
  'پلاک',
  'آویز',
  'سرویس',
  'پابند',
];

type Group =
  | { kind: ChipKind; title: string; type: 'radio'; options: [string | number, string][] }
  | { kind: ChipKind; title: string; type: 'check'; options: [string, string][] }
  | { kind: 'budget'; title: string; type: 'range' }
  | { kind: 'flags'; title: string; type: 'toggles'; options: [ChipKind, string][] };

const FILTER_GROUPS: Group[] = [
  {
    kind: 'intent',
    title: 'برای چه می‌خرید',
    type: 'radio',
    options: [
      ['gift', 'هدیه'],
      ['beauty', 'زیبایی'],
      ['savings', 'پس‌انداز'],
    ],
  },
  {
    kind: 'item_type',
    title: 'نوع',
    type: 'check',
    options: ITEM_TYPES.map((t): [string, string] => [t, t]),
  },
  { kind: 'budget', title: 'بودجه', type: 'range' },
  {
    kind: 'karat',
    title: 'عیار',
    type: 'radio',
    options: [
      [18, '۱۸'],
      [21, '۲۱'],
      [24, '۲۴'],
    ],
  },
  {
    kind: 'audience',
    title: 'برای چه کسی',
    type: 'radio',
    options: [
      ['women', 'زنانه'],
      ['men', 'مردانه'],
      ['kids', 'بچگانه'],
    ],
  },
  {
    kind: 'ojrat_max',
    title: 'اجرت',
    type: 'radio',
    options: [
      [2, 'بدون اجرت'],
      [10, 'تا ٪۱۰'],
    ],
  },
  {
    kind: 'flags',
    title: 'بیشتر',
    type: 'toggles',
    options: [
      ['no_stones', 'بدون سنگ'],
      ['torob_pay', 'قسطی با ترب‌پی'],
      ['in_person', 'خرید حضوری'],
    ],
  },
];

// BR-62 score parts, for «این رتبه از کجا آمده».
const COMPONENT: Record<string, string> = {
  budget_fit: 'تناسب با بودجه',
  weight_fit: 'تناسب وزن',
  type_style_fit: 'نوع و طرح',
  seller_trust: 'اعتبار فروشنده',
  newness: 'نو بودن',
  low_premium: 'درصد اضافه‌ی کمتر',
  weight_known: 'وزن اعلام‌شده',
  freshness: 'تازگی قیمت',
};

// Content guide §5: what happened and what to do, never the server's detail.
const ERR: Record<string, string> = {
  429: 'درخواست‌ها زیاد شد. چند ثانیه صبر کنید و دوباره امتحان کنید.',
  422: 'این جمله خیلی بلند است. آن را به کمتر از ۳۰۰ نویسه برسانید.',
  offline: 'اتصال اینترنت برقرار نیست. اتصال را بررسی کنید و دوباره امتحان کنید.',
};

export {
  SAMPLES,
  KIND,
  VAL,
  LABEL,
  FORM,
  ERR,
  SORTS,
  ITEM_TYPES,
  FILTER_GROUPS,
  COMPONENT,
  type Group,
};
