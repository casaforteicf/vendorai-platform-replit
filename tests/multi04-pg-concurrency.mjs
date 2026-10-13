/**
 * MULTI-04.7 — Integration runner for a disposable PostgreSQL instance.
 * Deliberately refuses hosts resembling production or non-local connections.
 * Usage: MULTI04_TEST_DATABASE_URL=postgres://...@127.0.0.1:5432/... node tests/multi04-pg-concurrency.mjs
 * Requires the repository's node-postgres package to be available.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const urlString = process.env.MULTI04_TEST_DATABASE_URL;
if (!urlString) throw new Error("MULTI04_TEST_DATABASE_URL is required; do not use the official database");
const target = new URL(urlString);
if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname)) {
  throw new Error("Refusing non-loopback PostgreSQL target");
}
if (!/(test|scratch|disposable|isolated)/i.test(target.pathname)) {
  throw new Error("Database name must clearly designate an isolated test database");
}
const { Client } = require("pg");
const conn = { connectionString: urlString, connectionTimeoutMillis: 3000 };
const a = new Client(conn), b = new Client(conn);
await a.connect(); await b.connect();
const identifier = "multi04_" + process.pid;
const table = identifier.replace(/[^a-zA-Z0-9_]/g, "");
try {
  await a.query(`CREATE TABLE "${table}" (id text PRIMARY KEY, revision integer NOT NULL, geometry jsonb NOT NULL)`);
  await a.query(`INSERT INTO "${table}" VALUES ('p', 1, '{"initial":true}')`);
  await a.query("BEGIN");
  await a.query(`SELECT revision FROM "${table}" WHERE id='p' FOR UPDATE`);
  // A second transaction attempting CAS is blocked by the first transaction.
  await b.query("BEGIN");
  await b.query("SET LOCAL lock_timeout='200ms'");
  let locked = false;
  try {
    await b.query(`UPDATE "${table}" SET geometry='{"stale":true}',revision=2 WHERE id='p' AND revision=1`);
  } catch (e) {
    if (e.code === "55P03") locked = true;
    else throw e;
    await b.query("ROLLBACK");
  }
  assert.equal(locked, true, "Concurrent update must wait on row lock");
  await a.query(`UPDATE "${table}" SET geometry='{"winner":true}',revision=2 WHERE id='p' AND revision=1`);
  await a.query("COMMIT");
  const stale = await b.query(`UPDATE "${table}" SET geometry='{"stale":true}',revision=3 WHERE id='p' AND revision=1 RETURNING id`);
  assert.equal(stale.rowCount, 0, "Stale revision must not overwrite winner");
  const final = await a.query(`SELECT revision,geometry FROM "${table}" WHERE id='p'`);
  assert.equal(final.rows[0].revision, 2);
  assert.deepEqual(final.rows[0].geometry, { winner: true });
  // Assert transaction rollback restores both project row and audit insert.
  await a.query(`CREATE TEMP TABLE multi04_audit (operation_id text PRIMARY KEY, snapshot jsonb NOT NULL)`);
  await a.query("BEGIN");
  await a.query(`INSERT INTO multi04_audit VALUES ('rollback-op', '{"before":true}')`);
  await a.query(`UPDATE "${table}" SET geometry='{"intermediate":true}', revision=3 WHERE id='p' AND revision=2`);
  await a.query("ROLLBACK");
  const rolledBack = await a.query(`SELECT geometry,revision FROM "${table}" WHERE id='p'`);
  assert.deepEqual(rolledBack.rows[0], { geometry: { winner: true }, revision: 2 });
  const auditRows = await a.query("SELECT count(*)::int AS count FROM multi04_audit");
  assert.equal(auditRows.rows[0].count, 0);
  console.log("MULTI-04: lock contention, stale CAS and rollback passed");
} finally {
  await a.query("ROLLBACK").catch(() => {});
  await b.query("ROLLBACK").catch(() => {});
  await a.query(`DROP TABLE IF EXISTS "${table}"`).catch(() => {});
  await Promise.all([a.end(), b.end()]);
}
