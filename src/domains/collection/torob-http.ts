// What the collector and the start-up check ask Torob, and how: the API paths, the headers a browser sends,
// the search queries, and a fetch with a timeout behind a small interface that tests can replace.
const TOROB_API = 'https://api.torob.com';
const ROBOTS_URL = `${TOROB_API}/robots.txt`;
const SEARCH_PATH = '/v4/base-product/search/';
const DETAILS_PATH = '/v4/base-product/details/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const TOROB_HEADERS = {
  Accept: 'application/json',
  Referer: 'https://torob.com/',
  Origin: 'https://torob.com',
};

const QUERIES = [
  'دستبند طلا',
  'انگشتر طلا',
  'گردنبند طلا',
  'گوشواره طلا',
  'النگو طلا',
  'زنجیر طلا',
  'پلاک طلا',
  'آویز طلا',
  'سرویس طلا',
  'طلای آب شده',
  'طلای دست دوم',
];

type HttpResponse = {
  status: number;
  contentType: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
};
type Http = (
  url: string,
  init?: { method?: string; body?: string; headers?: Record<string, string> },
) => Promise<HttpResponse>;

const fetchHttp: Http = async (url, init) => {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    body: init?.body,
    headers: init?.headers,
    signal: AbortSignal.timeout(20_000),
  });
  return {
    status: res.status,
    contentType: res.headers.get('content-type') ?? '',
    json: () => res.json(),
    text: () => res.text(),
  };
};

export {
  DETAILS_PATH,
  QUERIES,
  ROBOTS_URL,
  SEARCH_PATH,
  TOROB_API,
  TOROB_HEADERS,
  UA,
  fetchHttp,
  type Http,
};
