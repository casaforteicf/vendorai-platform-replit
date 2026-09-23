// Run from repo root with TypeScript 5.9 and @electric-sql/pglite available.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const runner = fs.readFileSync('artifacts/api-server/src/services/arch-concept-render-runner.ts', 'utf8');
function query(name) {
  const match = runner.match(new RegExp('export const ' + name + ' = `([\\s\\S]*?)`;'));
  assert.ok(match, name);
  return match[1];
}
async function testQueue() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE arch_concept_projects (id text PRIMARY KEY, tenant_id text NOT NULL);
    CREATE TABLE arch_ai_renders (id text PRIMARY KEY, tenant_id text NOT NULL, mode text NOT NULL,
      status text, created_at timestamp NOT NULL DEFAULT NOW(), erro_msg text);`);
  const migration = fs.readFileSync('lib/db/migrations/20260923004130_arqdor_durable_concept_render.sql', 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  await db.exec(`INSERT INTO arch_concept_projects VALUES ('concept-a','tenant-a'), ('concept-b','tenant-b');
    INSERT INTO arch_ai_renders (id,tenant_id,concept_project_id,mode,status,job_input)
      VALUES ('a','tenant-a','concept-a','preservar','queued','{}'),
             ('b','tenant-b','concept-b','preservar','queued','{}'),
             ('legacy','tenant-a','concept-a','preservar','processando',NULL);`);
  const claim=query('CLAIM_CONCEPT_RENDER_SQL'), renew=query('RENEW_CONCEPT_RENDER_SQL');
  const submit=query('START_PROVIDER_SUBMISSION_SQL'), checkpoint=query('CHECKPOINT_PREDICTION_SQL');
  assert.equal((await db.query(claim,['lease-a'])).rows[0].id,'a');
  assert.equal((await db.query(claim,['lease-b'])).rows[0].id,'b');
  assert.equal((await db.query(claim,['lease-c'])).rows.length,0);
  assert.equal((await db.query(renew,['a','tenant-b','lease-a'])).affectedRows,0);
  assert.equal((await db.query(submit,['a','tenant-a','lease-a'])).affectedRows,1);
  assert.equal((await db.query(submit,['a','tenant-a','lease-a'])).affectedRows,0);
  assert.equal((await db.query(checkpoint,['a','tenant-a','lease-a','prediction-a'])).affectedRows,1);
  await db.exec(`UPDATE arch_ai_renders SET job_lease_until=NOW()-INTERVAL '1 second' WHERE id='a'`);
  const recovered=(await db.query(claim,['lease-new'])).rows[0];
  assert.equal(recovered.id,'a');
  assert.equal(recovered.provider_prediction_id,'prediction-a');
  assert.equal(recovered.job_attempts,2);
  assert.equal((await db.query(renew,['a','tenant-a','lease-a'])).affectedRows,0);
  assert.equal((await db.query(checkpoint,['a','tenant-a','lease-a','stale'])).affectedRows,0);
  assert.equal((await db.query(checkpoint,['a','tenant-b','lease-new','wrong-tenant'])).affectedRows,0);
  assert.equal((await db.query(renew,['a','tenant-a','lease-new'])).affectedRows,1);
  await db.exec(`UPDATE arch_ai_renders SET status='concluido' WHERE id='a'`);
  assert.equal((await db.query(checkpoint,['a','tenant-a','lease-new','late'])).affectedRows,0);
  await assert.rejects(db.exec(`INSERT INTO arch_ai_renders (id,tenant_id,concept_project_id,mode) VALUES ('bad','tenant-a','missing','preservar')`));
  await db.close();
}
async function testProviderResume() {
  const source=fs.readFileSync('artifacts/api-server/src/lib/arch-render-pipeline.ts','utf8');
  const start=source.indexOf('export async function callReplicateFluxKontext');
  const end=source.indexOf('// ── Motor de geração livre',start);
  const js=ts.transpileModule(source.slice(start,end).replace('export async','async'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const calls=[];
  const ctx={process:{env:{REPLICATE_API_TOKEN:'test-only'}},Buffer,AbortSignal,setTimeout,
    fetch:async(url,init)=>{calls.push({url,method:init?.method??'GET'});
      if(url.includes('/predictions/')) return {ok:true,json:async()=>({id:'saved',status:'succeeded',output:'https://test.invalid/result.png'})};
      return {ok:true,arrayBuffer:async()=>Buffer.from('image')};}};
  vm.createContext(ctx);vm.runInContext(js,ctx);
  const result=await ctx.callReplicateFluxKontext({imageDataUrl:'unused',prompt:'test',resumePredictionId:'saved',beforeSubmit:()=>{throw Error('must not submit twice')}});
  assert.equal(result,Buffer.from('image').toString('base64'));
  assert.equal(calls.filter(x=>x.method==='POST').length,0);
  calls.length=0;let checkpointed=false;
  ctx.fetch=async(url,init)=>{calls.push({url,method:init?.method??'GET'});
    if(init?.method==='POST') return {ok:true,json:async()=>({id:'new',status:'succeeded',output:'https://test.invalid/result.png'})};
    assert.equal(checkpointed,true);return {ok:true,arrayBuffer:async()=>Buffer.from('new image')};};
  await ctx.callReplicateFluxKontext({imageDataUrl:'data:image/png;base64,eA==',prompt:'test',onPredictionCreated:async(id)=>{assert.equal(id,'new');checkpointed=true}});
  assert.equal(calls.filter(x=>x.method==='POST').length,1);
}
(async()=>{await testQueue();await testProviderResume();console.log('PASS: migration/FK, claims, lease expiry/recovery, stale worker and tenant fencing, submission guard, provider checkpoint and resume without a second POST.');})().catch(error=>{console.error(error);process.exitCode=1});
