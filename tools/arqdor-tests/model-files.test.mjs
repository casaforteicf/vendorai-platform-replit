import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ModelFileStore, inspectEmbeddedGlb, safeSegment, validateCalibration } from '../../artifacts/api-server/src/lib/arqdor-model-files.ts';

function glb(extra = {}) {
  let text = JSON.stringify({ asset: { version: '2.0' }, meshes: [{ primitives: [] }], materials: [{ name: 'Piso' }], ...extra });
  text += ' '.repeat((4 - Buffer.byteLength(text) % 4) % 4);
  const payload = Buffer.from(text);
  const header = Buffer.alloc(20);
  header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + payload.length, 8);
  header.writeUInt32LE(payload.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, payload]);
}

const calibration = { measuredDistance: 250, actualMeters: 2.5, referenceDimensions: { width: 4, depth: 5, height: 3 }, tolerance: .01 };
async function withStore(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'arqdor-model-test-'));
  try { await run(new ModelFileStore(root), root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test('metadata is an inventory, never a technical approval', () => {
  const result = inspectEmbeddedGlb(glb());
  assert.equal(result.meshCount, 1);
  assert.deepEqual(result.materials, [{ name: 'Piso', specificationStatus: 'unconfirmed' }]);
});

test('rejects external resources and invalid GLB containers', () => {
  for (const uri of ['../../private', 'https://example.test/model.bin', 'file:///etc/passwd']) {
    assert.throws(() => inspectEmbeddedGlb(glb({ buffers: [{ uri }] })), /recursos/);
    assert.throws(() => inspectEmbeddedGlb(glb({ images: [{ uri }] })), /recursos/);
  }
  assert.throws(() => inspectEmbeddedGlb(Buffer.from('glTF')), /válido/);
  assert.throws(() => inspectEmbeddedGlb(glb({ meshes: [] })), /malhas/);
  assert.throws(() => inspectEmbeddedGlb(glb({ materials: {} })), /Estrutura/);
});

test('calibration requires finite positive values and independent dimensions', () => {
  assert.deepEqual(validateCalibration(calibration), calibration);
  for (const value of [0, -1, Infinity, NaN, true, '2']) assert.throws(() => validateCalibration({ ...calibration, actualMeters: value }));
  assert.throws(() => validateCalibration({ ...calibration, measuredDistance: 1e-308, actualMeters: 1e308 }));
  assert.throws(() => validateCalibration({ ...calibration, referenceDimensions: {} }));
  assert.throws(() => validateCalibration({ ...calibration, tolerance: .1 }));
});

test('rejects path separators and traversal in every identity', () => {
  for (const segment of ['../tenant', '/tmp', '', 'tenant/project', 'tenant\\project']) assert.throws(() => safeSegment(segment));
});

test('preserves original, uses private permissions, and recovers records after restart', async () => withStore(async (store, root) => {
  const bytes = glb();
  const record = await store.save('tenant-a', 'project-a', 'fachada.glb', bytes);
  assert.equal(record.geometryStatus, 'requires_review'); assert.equal(record.quantitiesEnabled, false);
  const recovered = await new ModelFileStore(root).list('tenant-a', 'project-a');
  assert.equal(recovered[0].id, record.id);
  assert.deepEqual((await store.file('tenant-a', 'project-a', record.id)).buffer, bytes);
  assert.equal((await stat(path.join(root, 'tenant-a', record.key))).mode & 0o777, 0o600);
}));

test('tenant and project isolation applies to listing and downloads', async () => withStore(async store => {
  const model = await store.save('tenant-a', 'project-a', 'model.glb', glb());
  assert.deepEqual(await store.list('tenant-b', 'project-a'), []);
  await assert.rejects(store.file('tenant-b', 'project-a', model.id), { code: 'ENOENT' });
  await assert.rejects(store.file('tenant-a', 'project-b', model.id), { code: 'ENOENT' });
}));

test('tampered original fails integrity check', async () => withStore(async (store, root) => {
  const model = await store.save('tenant-a', 'project-a', 'model.glb', glb());
  await writeFile(path.join(root, 'tenant-a', model.key), Buffer.from('modified'));
  await assert.rejects(store.file('tenant-a', 'project-a', model.id), /Integridade/);
}));

test('calibrations are append-only, scoped to SHA and preserve author', async () => withStore(async (store, root) => {
  const model = await store.save('tenant-a', 'project-a', 'model.glb', glb());
  const original = await readFile(path.join(root, 'tenant-a', model.key));
  const drafts = await Promise.all([1, 2].map(n => store.saveCalibration('tenant-a', 'project-a', model.id, `user-${n}`, calibration)));
  assert.notEqual(drafts[0].id, drafts[1].id);
  const recovered = await new ModelFileStore(root).calibrations('tenant-a', 'project-a', model.id);
  assert.equal(recovered.length, 2);
  for (const draft of recovered) { assert.equal(draft.modelSha256, model.sha256); assert.equal(draft.status, 'pending_worker_validation'); }
  assert.deepEqual(await readFile(path.join(root, 'tenant-a', model.key)), original);
}));

test('symlinked tenant directory cannot escape root', async () => withStore(async (store, root) => {
  const outside = await mkdtemp(path.join(tmpdir(), 'arqdor-outside-'));
  try {
    await symlink(outside, path.join(root, 'tenant-a'));
    await assert.rejects(store.save('tenant-a', 'project-a', 'model.glb', glb()), /privado/);
  } finally { await rm(outside, { recursive: true, force: true }); }
}));

test('symlinked original is never served', async () => withStore(async (store, root) => {
  const model = await store.save('tenant-a', 'project-a', 'model.glb', glb());
  const target = path.join(root, 'tenant-a', model.key);
  await rm(target); await symlink('/etc/passwd', target);
  await assert.rejects(store.file('tenant-a', 'project-a', model.id), /privado/);
}));
