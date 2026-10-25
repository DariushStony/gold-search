// Bundles the page: src/web/scripts/main.ts to app.js and src/web/styles/main.css to app.css, copies
// src/web/static (favicon), then writes index.html with a content hash on each asset URL, so browsers may cache the assets for a year.
// Run: node scripts/build-web.ts [--watch]
import { createHash } from 'node:crypto';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as esbuild from 'esbuild';
import { footer, header, type Section } from '../src/web/templates/chrome.ts';
import { buildAtlas } from './atlas/build.ts';

const ROOT = new URL('../', import.meta.url).pathname;
const SRC = join(ROOT, 'src/web');
const OUT = join(ROOT, 'dist/web');

const hash = (file: string) =>
  createHash('sha256')
    .update(readFileSync(join(OUT, file)))
    .digest('hex')
    .slice(0, 10);

// Fills the shared header and footer, then puts a content hash on every asset URL.
const page = (html: string) =>
  html
    .replace(/<!-- @header:(search|atlas) -->/, (_m, section: Section) => header(section))
    .replace('<!-- @footer -->', footer())
    .replace(
      /"\/assets\/([\w.-]+)"/g,
      (_m, file: string) => `"/assets/${file}?v=${hash(`assets/${file}`)}"`,
    );

const writeHtml: esbuild.Plugin = {
  name: 'html',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length) return;
      cpSync(join(SRC, 'static'), join(OUT, 'assets'), { recursive: true });
      writeFileSync(
        join(OUT, 'index.html'),
        page(readFileSync(join(SRC, 'index.html'), 'utf8')),
      );
      const problems = buildAtlas(OUT, page);
      if (problems.length) {
        return { errors: problems.map((text) => ({ text: `atlas: ${text}` })) };
      }
      return undefined;
    });
  },
};

const options: esbuild.BuildOptions = {
  entryPoints: [
    { in: join(SRC, 'scripts/main.ts'), out: 'app' },
    { in: join(SRC, 'scripts/theme-init.ts'), out: 'theme-init' },
    { in: join(SRC, 'styles/main.css'), out: 'app' },
    { in: join(SRC, 'scripts/atlas.ts'), out: 'atlas' },
    { in: join(SRC, 'styles/atlas.css'), out: 'atlas' },
  ],
  outdir: join(OUT, 'assets'),
  bundle: true,
  minify: true,
  sourcemap: 'linked',
  target: ['es2022', 'safari15'],
  format: 'esm',
  logLevel: 'info',
  plugins: [writeHtml],
};

async function watchWeb() {
  const ctx = await esbuild.context(options);
  await ctx.watch();
}

if (import.meta.main) {
  if (process.argv.includes('--watch')) await watchWeb();
  else await esbuild.build(options);
}

export { watchWeb };
