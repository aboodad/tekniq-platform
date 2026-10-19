// Bundles the app with esbuild. Works with the real npm packages (npm i) or, offline, with NODE_PATH.
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const watch = process.argv.includes('--watch');
const out = 'dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out + '/assets', { recursive: true });
if (existsSync('public')) cpSync('public', out, { recursive: true });
if (existsSync('vercel.json')) cpSync('vercel.json', out + '/vercel.json');

const opts = {
  entryPoints: { app: 'src/main.tsx' },
  bundle: true, splitting: true, format: 'esm', outdir: out + '/assets', entryNames: '[name]-[hash]', chunkNames: 'chunk-[hash]',
  minify: !watch, sourcemap: watch ? 'inline' : false, target: ['es2020'], jsx: 'automatic', metafile: true,
  loader: { '.svg': 'dataurl', '.woff2': 'file' }, define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' },
  nodePaths: (process.env.NODE_PATH || '').split(':').filter(Boolean),
  logLevel: 'info',
};
async function emit(meta) {
  const files = Object.keys(meta.outputs).map((f) => f.replace(out + '/', ''));
  const js = files.find((f) => /^assets\/app-.*\.js$/.test(f));
  const css = files.find((f) => /^assets\/app-.*\.css$/.test(f));
  let html = readFileSync('index.html', 'utf8');
  html = html.replace('<!--CSS-->', css ? `<link rel="stylesheet" href="/${css}">` : '')
             .replace('<!--JS-->', `<script type="module" src="/${js}"></script>`);
  writeFileSync(out + '/index.html', html);
  // SPA fallbacks for common hosts
  writeFileSync(out + '/200.html', html);
  console.log('built', js, css);
}
if (watch) {
  const ctx = await esbuild.context({ ...opts, plugins: [{ name: 'emit', setup(b) { b.onEnd((r) => r.metafile && emit(r.metafile)); } }] });
  await ctx.watch(); await ctx.serve({ servedir: out, port: 5173, fallback: out + '/index.html' });
  console.log('http://localhost:5173');
} else {
  const r = await esbuild.build(opts); await emit(r.metafile);
}
