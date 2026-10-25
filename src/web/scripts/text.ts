// Page copy that is not built from data (content guide).
export const SAMPLES = [
  'یه دستبند ظریف برای روز مادر تا ۲۰ تومن',
  '۵۰ میلیون دارم، النگوی کم‌اجرت که موقع فروش کمتر ضرر کنم',
  'زنجیر دو رنگ ایتالیایی مردانه',
];

export const KIND: Record<string, string> = {
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
};

export const VAL: Record<string, string> = {
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
  asc: 'کمترین اجرت اول',
};

export const LABEL = {
  real: ['real', 'سازگار با طلای واقعی'],
  mixed: ['mixed', 'مخلوط'],
  not_gold: ['notgold', 'غیرطلا'],
  review: ['review', 'مشکوک'],
} as const;

export const FORM: Record<string, string> = {
  jewelry: 'جواهر (همین نتایج)',
  used: 'طلای دست‌دوم',
  molten: 'طلای آب‌شده',
  digital: 'طلای دیجیتال',
  torob_gold: 'ترب طلا',
};

// Content guide §5: what happened and what to do, never the server's detail.
export const ERR: Record<string, string> = {
  429: 'درخواست‌ها زیاد شد. چند ثانیه صبر کنید و دوباره امتحان کنید.',
  422: 'این جمله خیلی بلند است. آن را به کمتر از ۳۰۰ نویسه برسانید.',
  offline: 'اتصال اینترنت برقرار نیست. اتصال را بررسی کنید و دوباره امتحان کنید.',
};
