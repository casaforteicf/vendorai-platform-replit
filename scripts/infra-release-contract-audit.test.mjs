import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve('scripts/infra-release-contract-audit.mjs');
const files = [
  '.github/workflows/merge-release-agent.yml',
  '.github/workflows/cloudflare-pages.yml',
  '.github/workflows/cloudflare-api-container.yml',
];
function run(fixtures) {
  const cwd = mkdtempSync(join(tmpdir(), 'infra01-'));
  try {
    for (const [path, content] of Object.entries(fixtures)) {
      const destination = join(cwd, path);
      mkdirSync(resolve(destination, '..'), { recursive: true });
      writeFileSync(destination, content);
    }
    const child = spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' });
    return { status: child.status, output: JSON.parse(child.stdout) };
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
test('manual-only release workflows pass clean', () => {
  const fixtures = Object.fromEntries(files.map(x => [x, 'name: Audit\non:\n  workflow_dispatch:\npermissions:\n  contents: read\n']));
  const result = run(fixtures);
  assert.equal(result.status, 0);
  assert.deepEqual(result.output.summary, { errors: 0, warnings: 0 });
});
test('legacy Railway references are reported but do not falsely claim an active deployment', () => {
  const fixtures = Object.fromEntries(files.map(x => [x, 'on:\n  workflow_dispatch:\npermissions:\n  contents: read\n']));
  fixtures[files[0]] += 'env:\n  API_HEALTH_URL: https://vendorai-platform-replit-production.up.railway.app/api/auth/healthz\n';
  fixtures[files[2]] += 'jobs:\n  railway_fallback: true\n';
  const result = run(fixtures);
  assert.equal(result.status, 0);
  assert.equal(result.output.summary.warnings, 2);
});
test('push trigger is a hard error', () => {
  const fixtures = Object.fromEntries(files.map(x => [x, 'on:\n  workflow_dispatch:\npermissions:\n  contents: read\n']));
  fixtures[files[1]] = 'on:\n  push:\n    branches: [main]\n  workflow_dispatch:\npermissions:\n  contents: read\n';
  const result = run(fixtures);
  assert.equal(result.status, 1);
  assert.equal(result.output.summary.errors, 1);
});
test('missing workflow is a hard error', () => {
  const fixtures = Object.fromEntries(files.slice(0, 2).map(x => [x, 'on:\n  workflow_dispatch:\npermissions:\n  contents: read\n']));
  const result = run(fixtures);
  assert.equal(result.status, 1);
  assert.equal(result.output.summary.errors, 1);
});
