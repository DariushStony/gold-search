// One search request to Torob, to learn whether this host can collect at all before collection moves here.
// ADR-0002 expects a datacenter address may be walled (HTTP 490) like some networks are. Only the outcome,
// the status, the timing and the result count are kept; nothing from the response body is stored.
import {
  QUERIES,
  SEARCH_PATH,
  TOROB_API,
  TOROB_HEADERS,
  UA,
  type Http,
} from './torob-http.ts';

type TorobProbe = {
  checked_at: string;
  outcome: 'ok' | 'challenged' | 'non_json' | 'error' | 'network';
  http_status: number | null;
  results: number | null;
  total_count: number | null;
  ms: number;
  note: string | null;
};

async function probeTorob(http: Http, now = () => new Date()): Promise<TorobProbe> {
  const start = now();
  const params = new URLSearchParams({
    q: QUERIES[0]!,
    page: '0',
    size: '24',
    sort: '',
    source: 'next_desktop',
  });
  const done = (p: Omit<TorobProbe, 'checked_at' | 'ms'>): TorobProbe => ({
    checked_at: start.toISOString(),
    ms: now().getTime() - start.getTime(),
    ...p,
  });
  try {
    const res = await http(`${TOROB_API}${SEARCH_PATH}?${params}`, {
      headers: { 'User-Agent': UA, ...TOROB_HEADERS },
    });
    const empty = { results: null, total_count: null };
    // the type and the first words of a refusal say who refused: Torob itself or a CDN in front of it
    const said = async () => {
      const text = await res.text().catch(() => '');
      const words = text
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160);
      return `${res.contentType || 'no content-type'}${words ? `: ${words}` : ''}`;
    };
    if (res.status === 490) {
      return done({
        outcome: 'challenged',
        http_status: 490,
        ...empty,
        note: await said(),
      });
    }
    if (res.status < 200 || res.status >= 300) {
      return done({
        outcome: 'error',
        http_status: res.status,
        ...empty,
        note: await said(),
      });
    }
    if (!res.contentType.includes('json')) {
      return done({
        outcome: 'non_json',
        http_status: res.status,
        ...empty,
        note: await said(),
      });
    }
    const body = (await res.json()) as { results?: unknown[]; count?: unknown };
    return done({
      outcome: 'ok',
      http_status: res.status,
      results: Array.isArray(body.results) ? body.results.length : 0,
      total_count: typeof body.count === 'number' ? body.count : null, // Torob calls it «count»
      note: null,
    });
  } catch (err) {
    return done({
      outcome: 'network',
      http_status: null,
      results: null,
      total_count: null,
      note: String(err).slice(0, 200),
    });
  }
}

export { probeTorob, type TorobProbe };
