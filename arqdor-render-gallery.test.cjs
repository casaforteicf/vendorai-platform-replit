// Run from repository root with TypeScript 5.9 and @electric-sql/pglite installed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');

async function main() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE arch_concept_projects (id text PRIMARY KEY, tenant_id text NOT NULL);
    CREATE TABLE arch_ai_renders (
      id text PRIMARY KEY, tenant_id text NOT NULL, project_id text, concept_project_id text,
      parent_render_id text, mode text, ambiente text, estilo text, iluminacao text, angulo text,
      mask_zones jsonb, original_image_url text, source text, render_view text, job_input jsonb,
      prompt text, motor text, status text, operation_type text, result_image_url text,
      approved_by text, provider_prediction_id text, job_lease_token text, job_attempts integer DEFAULT 0);
    INSERT INTO arch_concept_projects VALUES ('concept-a','tenant-a'), ('concept-b','tenant-b');`);
  const migration = fs.readFileSync('lib/db/migrations/20260923100430_arqdor_concept_render_gallery.sql', 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  await db.exec(`INSERT INTO arch_ai_renders
    (id,tenant_id,concept_project_id,mode,ambiente,iluminacao,original_image_url,source,render_view,
     job_input,prompt,motor,status,result_image_url,approved_by,provider_prediction_id,job_lease_token,job_attempts)
    VALUES ('a','tenant-a','concept-a','preservar','fachada','sunset','https://original/a','facade','exterior',
      '{"userNotes":"locked geometry","materials":[{"zone":"wall","promptFragment":"stone"}]}',
      'original prompt','replicate-flux-kontext-pro','concluido','https://result/a','user-a','prediction-a','lease-a',3),
    ('b','tenant-a','concept-a','preservar','fachada','day','https://original/b','facade','exterior','{}',
      'prompt b','replicate-flux-kontext-pro','concluido','https://result/b',NULL,NULL,NULL,0),
    ('foreign','tenant-b','concept-b','preservar','fachada','day','https://original/foreign','facade','exterior','{}',
      'foreign prompt','replicate-flux-kontext-pro','concluido','https://result/foreign',NULL,NULL,NULL,0),
    ('old','tenant-a','concept-a','preservar','fachada','day',NULL,'facade','exterior',NULL,
      'old','old','erro',NULL,NULL,NULL,NULL,0);`);
  const source = fs.readFileSync('artifacts/api-server/src/services/arch-concept-render-gallery.ts', 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { require, module, exports: module.exports });
  const update = module.exports.updateConceptRenderGallery;
  const pool = { connect: async () => ({
    query: async (sql, params) => { const r = await db.query(sql, params); return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 }; },
    release() {},
  }) };
  const primary = (renderId, tenantId = 'tenant-a') => update(pool, { tenantId, renderId, action: 'primary' });
  const regenerate = (renderId, requestId, tenantId = 'tenant-a', lighting) => update(pool, { tenantId, renderId, requestId, action: 'regenerate', lighting });
  const rejectStatus = (status) => (error) => error.status === status;
  await assert.rejects(primary('foreign'), rejectStatus(404));
  await assert.rejects(primary('old'), rejectStatus(409));
  await primary('a');
  await primary('b');
  await primary('b');
  assert.deepEqual((await db.query(`SELECT id FROM arch_ai_renders WHERE is_primary`)).rows, [{ id: 'b' }]);
  await primary('foreign', 'tenant-b');
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM arch_ai_renders WHERE is_primary`)).rows[0].n, 2);
  await assert.rejects(db.query(`UPDATE arch_ai_renders SET is_primary=true WHERE id='a'`), /duplicate key/);
  await assert.rejects(regenerate('foreign', '00000000-0000-4000-8000-000000000001'), rejectStatus(404));
  await assert.rejects(regenerate('a', 'invalid'), rejectStatus(400));
  await assert.rejects(regenerate('old', '00000000-0000-4000-8000-000000000001'), rejectStatus(409));
  const key = '00000000-0000-4000-8000-000000000002';
  const queued = await regenerate('a', key);
  const retry = await regenerate('a', key);
  assert.equal(queued.id, retry.id, 'a repeated request recovers the same job');
  const row = (await db.query('SELECT * FROM arch_ai_renders WHERE id=$1', [queued.id])).rows[0];
  assert.equal(row.original_image_url, 'https://original/a');
  assert.equal(row.iluminacao, 'sunset');
  assert.equal(row.job_input.userNotes, 'locked geometry');
  assert.deepEqual(row.job_input.materials, [{ zone: 'wall', promptFragment: 'stone' }]);
  assert.equal(row.parent_render_id, 'a');
  assert.equal(row.status, 'queued');
  assert.equal(row.is_primary, false);
  assert.equal(row.approved_by, null);
  assert.equal(row.provider_prediction_id, null);
  assert.equal(row.job_lease_token, null);
  assert.equal(row.job_attempts, 0);
  await assert.rejects(regenerate('b', '00000000-0000-4000-8000-000000000003'), rejectStatus(409));
  await assert.rejects(primary(queued.id), rejectStatus(409));
  // Recovery remains idempotent even if the first job finished before the retry.
  await db.query(`UPDATE arch_ai_renders SET status='concluido', result_image_url='https://result/new' WHERE id=$1`, [queued.id]);
  assert.equal((await regenerate('a', key)).id, queued.id);
  await primary(queued.id);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM arch_ai_renders WHERE tenant_id='tenant-a' AND is_primary`)).rows[0].n, 1);
  assert.equal((await db.query(`SELECT result_image_url FROM arch_ai_renders WHERE id='a'`)).rows[0].result_image_url, 'https://result/a');
  assert.equal((await db.query(`SELECT is_primary FROM arch_ai_renders WHERE id='foreign'`)).rows[0].is_primary, true);
  const varied = await regenerate('a', '00000000-0000-4000-8000-000000000004', 'tenant-a', 'night');
  const variation = (await db.query('SELECT * FROM arch_ai_renders WHERE id=$1', [varied.id])).rows[0];
  assert.equal(variation.iluminacao, 'night');
  assert.equal(variation.prompt, null, 'worker must rebuild the lighting prompt');
  assert.match(variation.job_input.userNotes, /nighttime photography/);
  assert.match(variation.job_input.userNotes, /locked geometry/);
  const notes = module.exports.withLightingVariation('Lighting: sunny day.\nEXTERIOR LIGHTING: obey the selected day scenario.\nLighting scenario selected in editor: day. Landscaping visibility: on.\nPreserve physically plausible daylight.\nEXACT OPENING LOCK: 3 doors.', 'night');
  assert.doesNotMatch(notes, /sunny day|selected day|daylight|editor: day/);
  assert.match(notes, /Landscaping visibility: on/);
  assert.match(notes, /EXACT OPENING LOCK: 3 doors/);
  await assert.rejects(regenerate('a', '00000000-0000-4000-8000-000000000005', 'tenant-a', 'invalid'), rejectStatus(400));
  await db.close();
  console.log('PASS: migration, primary uniqueness, tenant isolation, saved reference, request retry, active-job guard, history preservation');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
