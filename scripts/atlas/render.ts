// Markdown to Atlas HTML. Documents are treated as untrusted text: raw HTML is escaped (html: false) and
// markdown-it refuses javascript:, vbscript: and data: links. The only HTML added after rendering is our own:
// diagrams from docs/atlas/diagrams and the callout class on a blockquote.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import MarkdownIt from 'markdown-it';

type Heading = { level: 2 | 3; id: string; text: string };
type Rendered = {
  html: string;
  title: string | null;
  toc: Heading[];
  problems: string[];
};
type Context = {
  root: string; // repo root
  file: string; // repo-relative path of the document
  urlFor: (repoPath: string) => string | null; // Atlas URL of a published document, or null
  known: (url: string) => boolean; // is this /atlas URL a page
  diagram: (name: string) => string | null; // vetted figure HTML
};

const md = new MarkdownIt({ html: false, linkify: false, typographer: false });

const slug = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'section';

// [[src:path#symbol]] becomes `path:line` of the symbol's declaration, so a reference cannot go stale silently.
function resolveSources(text: string, ctx: Context, problems: string[]) {
  return text.replace(
    /\[\[src:([^\]#]+)(?:#([\w$]+))?\]\]/g,
    (_m, path: string, symbol?: string) => {
      const full = join(ctx.root, path);
      if (!existsSync(full)) {
        problems.push(`source file not found: ${path}`);
        return `\`${path}\``;
      }
      if (!symbol) return `\`${path}\``;
      const lines = readFileSync(full, 'utf8').split('\n');
      const decl = new RegExp(
        `\\b(function|const|let|type|class)\\s+${symbol.replace('$', '\\$')}\\b`,
      );
      const at = lines.findIndex((l) => decl.test(l));
      if (at < 0) {
        problems.push(`symbol not found: ${path}#${symbol}`);
        return `\`${path}\``;
      }
      return `\`${path}:${at + 1}\``;
    },
  );
}

function renderDoc(source: string, ctx: Context): Rendered {
  const problems: string[] = [];
  const text = resolveSources(source, ctx, problems).replace(
    /^\[\[diagram:([\w-]+)\]\]$/gm,
    (_m, name: string) => `@@DIAGRAM-${name}@@`,
  );
  const tokens = md.parse(text, {});

  let title: string | null = null;
  const toc: Heading[] = [];
  const used = new Map<string, number>();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.type !== 'heading_open') continue;
    const inline = tokens[i + 1]!;
    if (t.tag === 'h1' && title === null) {
      title = inline.content;
      tokens.splice(i, 3); // the layout prints the title
      i--;
      continue;
    }
    let id = slug(inline.content);
    const n = used.get(id) ?? 0;
    used.set(id, n + 1);
    if (n) id = `${id}-${n + 1}`;
    t.attrSet('id', id);
    if (t.tag === 'h2' || t.tag === 'h3') {
      toc.push({
        level: t.tag === 'h2' ? 2 : 3,
        id,
        text: inline.content.replace(/[`*]/g, ''),
      });
    }
  }

  const html = md.renderer.render(tokens, md.options, {});
  return { html: postProcess(html, ctx, problems), title, toc, problems };
}

// Links, tables and our own HTML, applied to markdown-it's output; every attribute value we keep was escaped
// by markdown-it already.
function postProcess(html: string, ctx: Context, problems: string[]) {
  return html
    .replace(
      /<a href="([^"]*)"(?: title="[^"]*")?>([\s\S]*?)<\/a>/g,
      (_m, href: string, label: string) => {
        const decoded = href.replace(/&amp;/g, '&');
        if (/^https?:\/\//.test(decoded)) {
          return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
        }
        if (decoded.startsWith('#')) return `<a href="${href}">${label}</a>`;
        if (decoded.startsWith('/atlas')) {
          if (!ctx.known(decoded.split('#')[0]!)) {
            problems.push(`broken Atlas link: ${decoded}`);
          }
          return `<a href="${href}">${label}</a>`;
        }
        const [path, hash] = decoded.split('#');
        const repoPath = normalize(join(dirname(ctx.file), path ?? ''));
        const url = ctx.urlFor(repoPath);
        if (url) return `<a href="${url}${hash ? `#${hash}` : ''}">${label}</a>`;
        // a repo file the Atlas does not publish: keep the words, drop the link
        return `<span class="int" title="در مخزن: ${repoPath}">${label}</span>`;
      },
    )
    .replace(/<table>/g, '<div class="table-wrap" tabindex="0"><table>')
    .replace(/<\/table>/g, '</table></div>')
    .replace(
      /<blockquote>\s*<p><strong>(واقعیت|برداشت|تصمیم|پیشنهاد|محدودیت|سنجیده|برآورد)<\/strong>/g,
      (_m, kind: string) =>
        `<blockquote class="callout" data-kind="${kind}"><p><strong>${kind}</strong>`,
    )
    .replace(/<p>@@DIAGRAM-([\w-]+)@@<\/p>/g, (_m, name: string) => {
      const figure = ctx.diagram(name);
      if (!figure) problems.push(`diagram not found: ${name}`);
      return figure ?? '';
    });
}

export { renderDoc, type Heading, type Context };
