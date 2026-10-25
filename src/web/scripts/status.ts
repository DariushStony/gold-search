import { get } from './api.ts';
import { $ } from './dom.ts';
import { toman, when } from './fmt.ts';
import type { StatusResponse } from './types.ts';

export async function loadStatus() {
  try {
    const s = await get<StatusResponse>('/status');
    const g = s.gold_price;
    $('rate').innerHTML = g
      ? `طلای ۱۸ عیار: <b>${toman(g.g_toman, true)}</b>، ${g.source === 'union' ? 'اتحادیه‌ی طلای تهران' : 'tgju (منبع جایگزین)'}، ${when(g.quoted_at)}${g.uncertain ? '، دو منبع قیمت با هم فرق دارند' : ''}${g.market_open ? '' : '، قیمت پایان بازار'}`
      : 'قیمت طلا در دسترس نیست';
    if (s.snapshot?.archive_mode) {
      $('archive').hidden = false;
      $('archive').textContent =
        `آخرین داده: ${when(s.snapshot.finished_at)}. قیمت فروشگاه‌ها ممکن است تغییر کرده باشد.`;
    }
  } catch {
    $('rate').textContent = 'قیمت طلا در دسترس نیست';
  }
}
