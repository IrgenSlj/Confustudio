// Guards the production build's contract with the runtime.
//
// A Vite build can succeed, and every other suite stay green, while the app is
// silently broken in ways only the built output exhibits:
//
//   - Worklets referenced by a literal /src/ path 404 once assets are hashed.
//     A dead AudioWorklet has no visible symptom other than missing sound.
//   - Assets under Vite's inline limit become `data:` URLs. Our CSP is
//     `script-src 'self'`, which blocks data: scripts, so an inlined worklet
//     fails addModule() at runtime. resampler and bitcrusher sit right under
//     the default 4 KB limit, so this is not hypothetical.
//   - The service worker precache list must only name URLs that exist in BOTH
//     serving modes; cache.addAll() rejects as a unit, so one 404 fails install
//     and the app ends up with no service worker at all.
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const assetsDir = path.join(distDir, 'assets');

const WORKLETS = ['resampler', 'bitcrusher', 'plaits', 'clouds', 'rings'];

// Build from scratch so this never passes on a stale dist/.
rmSync(distDir, { recursive: true, force: true });
execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: rootDir, stdio: 'pipe' });

assert.ok(existsSync(path.join(distDir, 'index.html')), 'Build must emit index.html');

const assetNames = await readdir(assetsDir);
const bundles = assetNames.filter((name) => name.endsWith('.js'));
const bundleSource = bundles.map((name) => readFileSync(path.join(assetsDir, name), 'utf8')).join('\n');

// 1. Every worklet is emitted as a real, separately addressable file.
for (const worklet of WORKLETS) {
  const emitted = assetNames.filter((name) => name.startsWith(`${worklet}-worklet-`) && name.endsWith('.js'));
  assert.equal(
    emitted.length,
    1,
    `Expected exactly one emitted asset for the ${worklet} worklet, got ${emitted.length}`,
  );
  assert.ok(
    bundleSource.includes(emitted[0]),
    `The ${worklet} worklet asset is emitted but never referenced by the bundle`,
  );
}

// 2. No worklet was inlined as a data: URL, which CSP script-src 'self' blocks.
assert.ok(
  !bundleSource.includes('data:text/javascript'),
  'A script was inlined as a data: URL; CSP script-src is self, so it would fail at runtime',
);

// 3. No literal source paths survive into the bundle — they 404 after hashing.
const literalSourcePath = bundleSource.match(/["'`]\/src\/[^"'`]+\.(?:js|css)["'`]/);
assert.equal(literalSourcePath, null, `Bundle still references a literal source path: ${literalSourcePath?.[0]}`);

// 4. The service worker only precaches URLs that exist in both serving modes.
const serviceWorker = readFileSync(path.join(distDir, 'sw.js'), 'utf8');
const shell = serviceWorker.match(/const APP_SHELL = \[([^\]]*)\]/)?.[1] ?? '';
const shellUrls = [...shell.matchAll(/'([^']+)'/g)].map((match) => match[1]);
assert.ok(shellUrls.length > 0, 'Service worker APP_SHELL could not be parsed');
for (const url of shellUrls) {
  assert.ok(
    !url.startsWith('/src/'),
    `Service worker precaches ${url}, which does not exist in a build — addAll would fail install`,
  );
  if (url === '/' || url === '/index.html') continue;
  assert.ok(existsSync(path.join(distDir, url.replace(/^\//, ''))), `Service worker precaches missing asset ${url}`);
}

// 5. public/ assets keep the root URLs that both serving modes agree on.
for (const asset of ['icon.svg', 'manifest.webmanifest', 'sw.js']) {
  assert.ok(existsSync(path.join(distDir, asset)), `Build must place ${asset} at the site root`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      workletsEmitted: WORKLETS.length,
      inlinedScripts: 0,
      literalSourcePaths: 0,
      serviceWorkerShell: shellUrls.length,
    },
    null,
    2,
  ),
);
