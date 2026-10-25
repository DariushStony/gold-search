// Builds /atlas: every page in pages.ts rendered with the shared layout. Any broken Atlas link, missing
// document, missing diagram or source symbol that no longer exists fails the build.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { document, notFound, url } from './layout.ts';
import { PAGES, type Page } from './pages.ts';
import { renderDoc } from './render.ts';

const ROOT = new URL('../../', import.meta.url).pathname;
const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  );
const DIAGRAMS = join(ROOT, 'docs/atlas/diagrams');

// an ADR is listed by number; its file name carries the title
function sourceOf(p: Page): string {
  if (!p.slug.startsWith('adr-')) return p.file;
  const dir = join(ROOT, 'docs/engineering/adr');
  const n = p.slug.slice(4);
  const name = readdirSync(dir).find((f) => f.startsWith(`${n}-`) && f.endsWith('.md'));
  if (!name) throw new Error(`atlas: no ADR file for ${p.slug}`);
  return `docs/engineering/adr/${name}`;
}

function figure(name: string): string | null {
  const svg = join(DIAGRAMS, `${name}.svg`);
  if (!existsSync(svg)) return null;
  const meta = JSON.parse(readFileSync(join(DIAGRAMS, `${name}.json`), 'utf8')) as {
    caption: string;
    steps: string[];
  };
  const steps = meta.steps.map((s) => `<li>${esc(s)}</li>`).join('');
  return `<figure class="diagram">
    <div class="diagram-scroll" dir="ltr" tabindex="0" role="region" aria-label="${esc(meta.caption)}، برای دیدن کامل بکشید">${readFileSync(svg, 'utf8')}</div>
    <figcaption>${esc(meta.caption)}</figcaption>
    <details class="diagram-text"><summary>همین نمودار به زبان ساده</summary><ol>${steps}</ol></details>
  </figure>`;
}

function buildAtlas(out: string, finish: (html: string) => string): string[] {
  const files = new Map(PAGES.map((p) => [p, sourceOf(p)]));
  const byRepoPath = new Map([...files].map(([p, f]) => [f, url(p)]));
  const known = new Set(PAGES.map(url));
  const problems: string[] = [];
  const rendered = PAGES.map((page) => {
    const file = files.get(page)!;
    const path = join(ROOT, file);
    if (!existsSync(path)) {
      problems.push(`${page.slug || 'index'}: document not found: ${file}`);
      return { page, html: '', toc: [] };
    }
    const r = renderDoc(readFileSync(path, 'utf8'), {
      root: ROOT,
      file,
      urlFor: (repoPath) => byRepoPath.get(repoPath) ?? null,
      known: (u) => known.has(u.replace(/\/$/, '')),
      diagram: figure,
    });
    problems.push(...r.problems.map((x) => `${page.slug || 'index'}: ${x}`));
    if (!page.title) page.title = r.title ?? page.slug;
    return { page, html: r.html, toc: r.toc };
  });
  if (problems.length) return problems;

  mkdirSync(join(out, 'atlas'), { recursive: true });
  rendered.forEach(({ page, html, toc }, i) => {
    const doc = document({
      page,
      pages: PAGES,
      body: html,
      headings: toc,
      prev: rendered[i - 1]?.page ?? null,
      next: rendered[i + 1]?.page ?? null,
    });
    writeFileSync(join(out, 'atlas', `${page.slug || 'index'}.html`), finish(doc));
  });
  writeFileSync(join(out, 'atlas', '404.html'), finish(notFound(PAGES)));
  return [];
}

export { buildAtlas };
