import type { ErrorCode } from './types.ts';

const API = '/api/v1';

const post = <T>(path: string, body: unknown): Promise<T> =>
  fetch(API + path, { method: 'POST', body: JSON.stringify(body) }).then(
    (r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(r.status as ErrorCode)),
    () => Promise.reject('offline' as ErrorCode),
  );

const get = async <T>(path: string): Promise<T> =>
  (await (await fetch(API + path)).json()) as T;

// post() rejects with the HTTP status or 'offline'; anything else is treated as offline.
const errorCode = (e: unknown): ErrorCode =>
  typeof e === 'number' || e === 'offline' ? e : 'offline';

export { post, get, errorCode };
