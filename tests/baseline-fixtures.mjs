import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'projects');
const manifest = JSON.parse(await readFile(path.join(fixtureDir, 'manifest.json'), 'utf8'));

function assert(condition, message, details = null) {
  if (!condition) {
    const error = new Error(message);
    if (details) error.details = details;
    throw error;
  }
}

const secretPatterns = [
  /sk-[a-z0-9_-]{12,}/i,
  /gh[opsu]_[a-z0-9]{12,}/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:api[_-]?key|token|secret)\s*[=:]\s*["']?[a-z0-9_-]{12,}/i,
];

try {
  assert(manifest.schemaVersion === 1, 'Fixture manifest schemaVersion must be 1');
  assert(Array.isArray(manifest.fixtures) && manifest.fixtures.length >= 6, 'Expected at least six baseline fixtures');

  const seen = new Set();
  for (const fixture of manifest.fixtures) {
    assert(typeof fixture.file === 'string' && fixture.file, 'Fixture entry is missing a file', fixture);
    assert(!seen.has(fixture.file), 'Fixture file is duplicated', fixture);
    seen.add(fixture.file);
    assert(typeof fixture.classification === 'string', 'Fixture classification is required', fixture);
    assert(typeof fixture.expectedFutureOutcome === 'string', 'Future outcome is required', fixture);

    const source = await readFile(path.join(fixtureDir, fixture.file), 'utf8');
    for (const pattern of secretPatterns) {
      assert(!pattern.test(source), 'Fixture appears to contain a credential', { file: fixture.file });
    }

    if (fixture.validJson) {
      const value = JSON.parse(source);
      assert(value && typeof value === 'object', 'JSON fixture must contain an object', { file: fixture.file });
    } else {
      let failed = false;
      try {
        JSON.parse(source);
      } catch (_) {
        failed = true;
      }
      assert(failed, 'Invalid JSON fixture unexpectedly parsed', { file: fixture.file });
    }
  }

  console.log(JSON.stringify({ ok: true, fixtures: manifest.fixtures.length }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, message: error.message, details: error.details || null }, null, 2));
  process.exitCode = 1;
}
