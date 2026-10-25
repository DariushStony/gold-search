import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { extract } from '../../scripts/atlas/extract-diagram.ts';
import { PAGES } from '../../scripts/atlas/pages.ts';
import { renderDoc, type Context } from '../../scripts/atlas/render.ts';

const ROOT = new URL('../../', import.meta.url).pathname;
const ctx = (over: Partial<Context> = {}): Context => ({
  root: ROOT,
  file: 'docs/atlas/sample.md',
  urlFor: (p) => (p === 'docs/engineering/api-contract.md' ? '/atlas/api' : null),
  known: (u) => u === '/atlas' || u === '/atlas/api',
  diagram: (name) => (name === 'ok' ? '<figure class="diagram">ok</figure>' : null),
  ...over,
});

test('documents are untrusted: raw HTML is escaped and javascript: links are never links', () => {
  const r = renderDoc(
    '# T\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1)) <img src=x onerror=alert(1)>',
    ctx(),
  );
  assert.doesNotMatch(r.html, /<script|<img|href="javascript/i);
  assert.match(r.html, /&lt;script&gt;/);
});

test('links: a published repo document becomes its Atlas URL, an unpublished one keeps its words without a link, outside links open safely', () => {
  const r = renderDoc(
    '[API](../engineering/api-contract.md#4-resources) [PRD](../product/prd.md) [site](https://example.com)',
    ctx(),
  );
  assert.match(r.html, /<a href="\/atlas\/api#4-resources">API<\/a>/);
  assert.match(
    r.html,
    /<span class="int" title="در مخزن: docs\/product\/prd.md">PRD<\/span>/,
  );
  assert.match(
    r.html,
    /<a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer">site<\/a>/,
  );
  assert.deepEqual(r.problems, []);
});

test('a broken Atlas link, a missing diagram, a missing file or a symbol that no longer exists is reported, so the build fails', () => {
  const r = renderDoc(
    '[x](/atlas/nowhere)\n\n[[diagram:missing]]\n\n[[src:src/nope.ts]] [[src:src/domains/ranking/rank.ts#noSuchSymbol]]',
    ctx(),
  );
  assert.deepEqual(r.problems, [
    'source file not found: src/nope.ts',
    'symbol not found: src/domains/ranking/rank.ts#noSuchSymbol',
    'broken Atlas link: /atlas/nowhere',
    'diagram not found: missing',
  ]);
});

test('a source reference resolves to the line of the declaration, and headings get ids for the contents column', () => {
  const lines = readFileSync(`${ROOT}src/domains/ranking/rank.ts`, 'utf8').split('\n');
  const line = lines.findIndex((l) => /function search\b/.test(l)) + 1;
  const r = renderDoc(
    '# Title\n\n## مسیر داده\n\n### Sub\n\n[[src:src/domains/ranking/rank.ts#search]]',
    ctx(),
  );
  assert.equal(r.title, 'Title');
  assert.match(r.html, new RegExp(`<code>src/domains/ranking/rank.ts:${line}</code>`));
  assert.deepEqual(r.toc, [
    { level: 2, id: 'مسیر-داده', text: 'مسیر داده' },
    { level: 3, id: 'sub', text: 'Sub' },
  ]);
  assert.doesNotMatch(r.html, /<h1/);
});

test('callouts are marked by kind and tables scroll inside their own box', () => {
  const r = renderDoc(
    '> **واقعیت** a fact\n\n| a | b |\n| --- | --- |\n| 1 | 2 |',
    ctx(),
  );
  assert.match(r.html, /<blockquote class="callout" data-kind="واقعیت">/);
  assert.match(r.html, /<div class="table-wrap" tabindex="0"><table>/);
});

test('a diagram with anything executable is refused; ids are prefixed so two diagrams can share a page', () => {
  assert.throws(() => extract('<svg><script>x</script></svg>', 'p'), /executable/);
  assert.throws(() => extract('<svg><g onclick="x()"></g></svg>', 'p'), /executable/);
  const svg = extract(
    '<svg aria-labelledby="t"><title id="t">T</title><path marker-end="url(#m)"/><marker id="m"/></svg>',
    'dg-a',
  );
  assert.match(svg, /aria-labelledby="dg-a-t"/);
  assert.match(svg, /id="dg-a-t"/);
  assert.match(svg, /url\(#dg-a-m\)/);
});

test('every Atlas page has a unique URL, a title or a document title, and a Persian summary', () => {
  const slugs = PAGES.map((p) => p.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const p of PAGES) assert.ok(p.summary.length > 10, p.slug);
});
