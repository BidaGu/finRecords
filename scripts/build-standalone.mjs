import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version: appVersion } = JSON.parse(
  await fs.readFile(path.join(root, 'package.json'), 'utf8'),
);
if (typeof appVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(appVersion))
  throw new Error('Set a supported application release version in package.json.');
async function walk(dir) {
  const files = [];
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) files.push(...(await walk(file)));
    else if (file.endsWith('.mjs')) files.push(file);
  }
  return files;
}
const sources = await walk(path.join(root, 'src/recording'));
if (sources.length !== 38)
  throw new Error(`Expected 38 application modules; found ${sources.length}.`);
for (const file of sources) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}
const result = await build({
  entryPoints: [path.join(root, 'src/recording/app.mjs')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  charset: 'utf8',
  legalComments: 'none',
  metafile: true,
});
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
new Function(script);
let html = await fs.readFile(path.join(root, 'src/layout.html'), 'utf8');
const versionMeta = `<meta name="application-version" content="${appVersion}">`;
html = /<meta\b[^>]*name="application-version"[^>]*>/i.test(html)
  ? html.replace(/<meta\b[^>]*name="application-version"[^>]*>/i, versionMeta)
  : html.replace('</head>', `${versionMeta}</head>`);
const css = await fs.readFile(path.join(root, 'styles.css'), 'utf8');
if (/<\/style/i.test(css)) throw new Error('Unexpected embedded style closing tag.');
const hash = (value) => createHash('sha256').update(value).digest('base64');
const policy = `default-src 'none'; script-src 'sha256-${hash(script)}'; style-src 'sha256-${hash(css)}'; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
html = html.replace(
  /<meta\b[^>]*http-equiv="Content-Security-Policy"[^>]*>/i,
  `<meta http-equiv="Content-Security-Policy" content="${policy}">`,
);
if (!html.includes('Content-Security-Policy'))
  html = html.replace(
    '</head>',
    `<meta http-equiv="Content-Security-Policy" content="${policy}"></head>`,
  );
html = html.replace(
  /<link\b(?=[^>]*rel="stylesheet")(?=[^>]*href="\.\/styles\.css")[^>]*>/i,
  () => `<style>${css}</style>`,
);
html = html.replace(
  /\s*<script\b(?=[^>]*type="module")(?=[^>]*src="\.\/src\/recording\/app\.mjs")[^>]*>\s*<\/script>/i,
  '',
);
try {
  const icon = await fs.readFile(path.join(root, 'favicon.svg'));
  html = html.replace(
    'href="./favicon.svg"',
    `href="data:image/svg+xml;base64,${icon.toString('base64')}"`,
  );
} catch {}
html = html.replace('</body>', () => `<script>${script}</script></body>`);
if (/<script[^>]+src=|<link[^>]+rel="stylesheet"/.test(html))
  throw new Error('Standalone output still has an external application asset.');
if (process.argv.includes('--check'))
  console.log(`Checked ${sources.length} application modules and module-aware standalone bundle.`);
else {
  for (const name of ['index.html', 'Finance Records.html'])
    await fs.writeFile(path.join(root, name), html);
  console.log(`Built both identical standalone HTML files from ${sources.length} modules.`);
}
