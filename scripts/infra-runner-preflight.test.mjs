import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectWorkflows } from './infra-runner-preflight.mjs';
function fixture(body) {
  const dir=mkdtempSync(join(tmpdir(),'infra09-'));
  writeFileSync(join(dir,'example.yml'),body);
  try { return inspectWorkflows(dir); } finally { rmSync(dir,{recursive:true,force:true}); }
}
test('hosted runner selector',()=>assert.deepEqual(fixture('jobs:\n  test:\n    runs-on: ubuntu-latest\n').findings,[]));
test('self-hosted requires live check',()=>assert.equal(fixture('jobs:\n  release:\n    runs-on: [self-hosted, linux]\n').findings[0].code,'SELF_HOSTED_REQUIRES_LIVE_CHECK'));
test('inline empty selector',()=>assert.equal(fixture('jobs:\n  release:\n    runs-on: []\n').findings[0].severity,'error'));
test('multiline empty selector',()=>assert.equal(fixture('jobs:\n  release:\n    runs-on:\n    steps:\n').findings[0].code,'EMPTY_RUNNER_SELECTOR'));
test('dynamic selector requires review',()=>assert.equal(fixture('jobs:\n  release:\n    runs-on: ${{ inputs.runner }}\n').findings[0].code,'DYNAMIC_RUNNER_SELECTOR'));
