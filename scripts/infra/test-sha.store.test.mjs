import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const script=readFileSync(resolve('scripts/infra/test-sha.sh'),'utf8');
test('pnpm v10 path resolves to store root, not /pnpm/store/v10/v10',()=>{
  const path='/home/vendorai/.local/share/pnpm/store/v10';
  const root=basename(path)==='v10'?dirname(path):path;
  assert.equal(root,'/home/vendorai/.local/share/pnpm/store');
  assert.match(script,/basename "\$STORE"/);
  assert.match(script,/\[ -d "\$STORE\/v10" \]/);
});
test('shared cache is snapshotted; only per-run store is mounted writable',()=>{
  assert.match(script,/cp -a --reflink=auto "\$STORE\/\." "\$RUN\/store\/"/);
  assert.match(script,/src=\$RUN\/store,dst=\/pnpm\/store"/);
  assert.doesNotMatch(script,/src=\$STORE,dst=\/pnpm\/store/);
  assert.match(script,/--network none/);
  assert.doesNotMatch(script,/--env-file|--network host|docker\.sock/);
});
test('snapshot is writable while original v10 remains intact',()=>{
  const dir=mkdtempSync(join(tmpdir(),'infra-pnpm-v10-'));
  try {
    const source=join(dir,'shared'); const target=join(dir,'isolated');
    mkdirSync(join(source,'v10'),{recursive:true}); mkdirSync(target);
    writeFileSync(join(source,'v10','fixture'),'unchanged');
    const copy=spawnSync('cp',['-a','--reflink=auto',source+'/.',target+'/'],{encoding:'utf8'});
    assert.equal(copy.status,0,copy.stderr);
    writeFileSync(join(target,'v10','new-metadata'),'writable');
    assert.equal(readFileSync(join(source,'v10','fixture'),'utf8'),'unchanged');
    assert.equal(statSync(join(source,'v10')).isDirectory(),true);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('Git and test evidence stay unprivileged; only Docker may use sudo -n',()=>{
  assert.match(script,/DOCKER_CMD=\(sudo -n docker\)/);
  assert.match(script,/"\$\{DOCKER_CMD\[@\]\}" image inspect/);
  assert.match(script,/"\$\{DOCKER_CMD\[@\]\}" run --rm/);
  assert.match(script,/git fetch --no-tags origin/);
  assert.doesNotMatch(script,/sudo -n git|sudo git|sudo -n bash|sudo bash/);
});

test('online fetch only occurs by explicit opt-in, before networkless offline install',()=>{
  assert.match(script,/VENDORAI_PREPARE_OFFLINE:-0/);
  assert.match(script,/--network bridge/);
  assert.match(script,/pnpm fetch --frozen-lockfile --ignore-scripts --store-dir \/pnpm\/store/);
  assert.match(script,/cache-fetch\.log/);
  assert.ok(script.indexOf('pnpm fetch --frozen-lockfile') < script.indexOf('run install "pnpm install --offline'));
  assert.match(script,/run\(\)\s*\{/);
  assert.match(script,/--network none/);
  assert.doesNotMatch(script,/--env-file|--network host|docker\.sock/);
});

test('crm suite is explicit and keeps global API TypeScript gate separate',()=>{
  assert.match(script,/\|crm/);
  assert.match(script,/if \[ "\$SUITE" = crm \]; then/);
  assert.match(script,/run crm-vitest "pnpm --filter @workspace\/api-server exec vitest run/);
  assert.match(script,/run api-ts "pnpm --filter @workspace\/api-server typecheck"/);
  assert.ok(script.indexOf('if [ "$SUITE" = crm ]') < script.indexOf('if [ "$SUITE" = api ]'));
  assert.match(script,/--network none/);
});
