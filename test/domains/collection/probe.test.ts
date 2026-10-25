import assert from 'node:assert/strict';
import { test } from 'node:test';
import { probeTorob } from '../../../src/domains/collection/probe.ts';
import type { Http } from '../../../src/domains/collection/torob-http.ts';

const reply =
  (status: number, contentType: string, body: unknown): Http =>
  async () => ({
    status,
    contentType,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

test('CR-16: one search request; a JSON page counts as reachable with its result counts', async () => {
  let asked = '';
  const http: Http = async (url, init) => {
    asked = url;
    assert.equal(init?.headers?.Origin, 'https://torob.com');
    return reply(200, 'application/json', {
      results: [{}, {}, {}],
      count: 1200,
    })(url);
  };
  const p = await probeTorob(http);
  assert.match(asked, /^https:\/\/api\.torob\.com\/v4\/base-product\/search\/\?q=/);
  assert.equal(p.outcome, 'ok');
  assert.equal(p.http_status, 200);
  assert.equal(p.results, 3);
  assert.equal(p.total_count, 1200);
});

test('CR-16: the anti-bot wall, other statuses, HTML and network failures are told apart', async () => {
  assert.equal((await probeTorob(reply(490, 'text/html', null))).outcome, 'challenged');
  const error = await probeTorob(async () => ({
    status: 503,
    contentType: 'text/html',
    json: async () => null,
    text: async () =>
      '<html><body><h1>503 Service Unavailable</h1>\n<p>busy</p></body></html>',
  }));
  assert.equal(error.outcome, 'error');
  assert.equal(error.http_status, 503);
  assert.equal(error.note, 'text/html: 503 Service Unavailable busy');
  assert.equal((await probeTorob(reply(200, 'text/html', ''))).outcome, 'non_json');
  const down = await probeTorob(async () => {
    throw new Error('ETIMEDOUT');
  });
  assert.equal(down.outcome, 'network');
  assert.equal(down.http_status, null);
  assert.match(down.note ?? '', /ETIMEDOUT/);
});
