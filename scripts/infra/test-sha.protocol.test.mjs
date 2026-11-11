import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Exercises the actual runner control flow with fake Git/Docker binaries.
// No network, daemon, real package install, TypeScript or build is run here.
const runner = resolve('scripts/infra/test-sha.sh');
function execute({ suite = 'api', fail = '', mismatch = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wave01-protocol-'));
  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    mkdirSync(join(dir, 'store', 'v10'), { recursive: true });
    writeFileSync(join(bin, 'git'), `#!/usr/bin/env bash
case "$1 $2" in
  'rev-parse --show-toplevel') printf '%s\\n' "$FIXTURE_ROOT" ;;
  'remote get-url') echo https://github.com/casaforteicf/vendorai-platform-replit.git ;;
  'rev-parse FETCH_HEAD') printf '%s\\n' "$FIXTURE_GIT_SHA" ;;
  'fetch --no-tags') exit 0 ;;
  'archive '* ) tar -cf - --files-from /dev/null ;;
  *) exit 99 ;;
esac
`, { mode: 0o755 });
    writeFileSync(join(bin, 'docker'), `#!/usr/bin/env bash
if [ "$1" = info ] || [ "$1" = image ]; then exit 0; fi
printf '%s\\n' "$*" >> "$FIXTURE_ROOT/commands.txt"
cid=''
for ((i=1; i<=$#; i++)); do
  if [ "\u0024{!i}" = --cidfile ]; then j=$((i+1)); cid="\u0024{!j}"; fi
done
case "$cid" in */"$FIXTURE_FAIL".cid) [ -z "$FIXTURE_FAIL" ] || exit 2 ;; esac
exit 0
`, { mode: 0o755 });
    const sha = 'a'.repeat(40);
    const result = spawnSync('bash', [runner, '3463', 'feat/wave01', sha, suite], {
      cwd: dir, encoding: 'utf8', timeout: 10000,
      env: { ...process.env, PATH: bin + ':' + process.env.PATH,
        FIXTURE_ROOT: dir, FIXTURE_GIT_SHA: mismatch ? 'b'.repeat(40) : sha,
        FIXTURE_FAIL: fail, VENDORAI_OFFLINE_STORE: join(dir, 'store', 'v10'),
        VENDORAI_REUSE_STORE: '', VENDORAI_PREPARE_OFFLINE: '0' },
    });
    const run = join(dir, '.test-evidence', readdirSync(join(dir, '.test-evidence'))[0]);
    let commands = '', results = '';
    try { commands = readFileSync(join(dir, 'commands.txt'), 'utf8'); } catch {}
    try { results = readFileSync(join(run, 'results.txt'), 'utf8'); } catch {}
    return { exit: result.status, commands, results, stderr: result.stderr };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
test('API runs exact launch config and direct esbuild entry under network isolation', () => {
  const r = execute();
  assert.equal(r.exit, 0, r.stderr);
  assert.match(r.commands, /tsc -p tsconfig.launch-ci.json --noEmit/);
  assert.match(r.commands, /cd artifacts\/api-server && node \.\/build.mjs/);
  assert.match(r.results, /^api-launch-ts exit=0$/m);
  assert.match(r.results, /^api-build exit=0$/m);
  assert.ok(r.commands.split('\n').filter(Boolean).every(line => line.includes('--network none')));
});
test('launch TypeScript failure makes entire runner fail even with successful build', () => {
  const r = execute({ fail: 'api-launch-ts' });
  assert.equal(r.exit, 1);
  assert.match(r.results, /^api-launch-ts exit=2$/m);
  assert.match(r.results, /^api-build exit=0$/m);
});
test('real build exit failure cannot be masked by TypeScript', () => {
  const r = execute({ fail: 'api-build' });
  assert.equal(r.exit, 1);
  assert.match(r.results, /^api-build exit=2$/m);
});
test('install failure skips every downstream gate', () => {
  const r = execute({ fail: 'install' });
  assert.equal(r.exit, 1);
  assert.equal(r.results, 'install exit=2\n');
  assert.doesNotMatch(r.commands, /tsconfig.launch-ci|build.mjs/);
});
test('SHA mismatch refuses every container execution', () => {
  const r = execute({ mismatch: true });
  assert.equal(r.exit, 65);
  assert.equal(r.commands, '');
});
test('CRM-only execution remains targeted and never runs full build gates', () => {
  const r = execute({ suite: 'crm' });
  assert.equal(r.exit, 0);
  assert.match(r.results, /^crm-vitest exit=0$/m);
  assert.doesNotMatch(r.results, /api-launch-ts|api-build/);
});
test('full suite includes launch gate and frontend build', () => {
  const r = execute({ suite: 'full' });
  assert.equal(r.exit, 0);
  assert.match(r.results, /^api-launch-ts exit=0$/m);
  assert.match(r.results, /^frontend-build exit=0$/m);
});
