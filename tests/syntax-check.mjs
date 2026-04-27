import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const rootDir = process.cwd();
const excludedDirs = new Set(['.git', 'node_modules']);
const checkedExts = new Set(['.js', '.mjs', '.cjs']);

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (excludedDirs.has(entry.name)) continue;
      files.push(...await collectFiles(path.join(dir, entry.name)));
      continue;
    }

    if (entry.isFile() && checkedExts.has(path.extname(entry.name))) {
      files.push(path.join(dir, entry.name));
    }
  }

  return files;
}

const files = await collectFiles(rootDir);

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    console.error(JSON.stringify({
      ok: false,
      file: path.relative(rootDir, file),
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    }, null, 2));
    process.exit(result.status || 1);
  }
}

console.log(JSON.stringify({ ok: true, files: files.length }, null, 2));
