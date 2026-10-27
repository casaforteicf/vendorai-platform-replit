import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path) => readFileSync(root + path, "utf8");
const scripts = [
  "scripts/vendi-contabo-operator",
  "scripts/vendi04-release-runner.sh",
  "scripts/vendi04-controlled-release.sh",
  "scripts/vendi04-homologate-candidate.sh",
  "scripts/vendi04-controlled-upgrade.sh",
];

test("all host operator shell scripts pass bash -n", () => {
  for (const file of scripts) {
    const result = spawnSync("bash", ["-n", root + file], { encoding: "utf8" });
    assert.equal(result.status, 0, file + ": " + result.stderr);
  }
});

test("build is asynchronous and protects production resources", () => {
  const op = read("scripts/vendi-contabo-operator");
  const runner = read("scripts/vendi04-release-runner.sh");
  assert.match(op, /systemd-run --unit=/);
  assert.match(op, /BUILD_BLOCKED_DISK_CAPACITY/);
  assert.match(op, /STATUS=BUILD_QUEUED/);
  assert.match(op, /MemoryMax=6G/);
  assert.match(runner, /vendi-release-global-build\.lock/);
  assert.match(runner, /STATUS=BUILD_FAILED/);
});

test("homologation uses EXACT private candidate and does not swap live containers", () => {
  const op = read("scripts/vendi-contabo-operator");
  const stage = read("scripts/vendi04-homologate-candidate.sh");
  assert.match(op, /vendi04-homologate-candidate/);
  assert.doesNotMatch(op, /vendorai-mcp-contabo-fixed/);
  assert.match(stage, /HOMOLOG_USES_PRODUCTION_DATABASE/);
  assert.match(stage, /VENDORAI_DISABLE_BACKGROUND_JOBS/);
  assert.match(stage, /VENDORAI_HOMOLOGATION_SEED/);
  assert.match(stage, /docker run --rm --detach/);
  assert.match(stage, /--network vendorai-homolog/);
  assert.match(stage, /STATUS=HOMOLOGATED/);
  assert.match(stage, /IMAGE_ID/);
  assert.doesNotMatch(stage, /docker (?:stop|rename|rm -f) ["']?vendorai-prod-api-candidate/);
});

test("production promotion requires same SHA, image ID and fresh receipt, plus cron lock", () => {
  const script = read("scripts/vendi04-controlled-release.sh");
  const verify = script.indexOf("HOMOLOG_RECEIPT_REQUIRED");
  const publish = script.indexOf('docker create --name "$NEXT"');
  assert.ok(verify > 0 && publish > verify, "verification must occur before container replacement");
  for (const token of ["HOMOLOG_RECEIPT_MISMATCH", "HOMOLOG_IMAGE_DIGEST_MISMATCH",
    "HOMOLOG_RECEIPT_EXPIRED", "SHARED_DEPLOY_LOCK_NOT_PROVISIONED",
    "AUTOMATIC_DEPLOY_IN_PROGRESS"]) assert.ok(script.includes(token), token);
});

test("self-upgrade accepts only explicit approval, exact SHA and fixed file allowlist", () => {
  const script = read("scripts/vendi04-controlled-upgrade.sh");
  assert.match(script, /EXPLICIT_OPERATOR_UPGRADE_APPROVAL_REQUIRED/);
  assert.match(script, /UPGRADE_APPROVAL_MISMATCH/);
  assert.match(script, /UPGRADE_SOURCE_MISSING/);
  assert.match(script, /OPERATOR_UPGRADE_ROLLED_BACK/);
  assert.match(script, /OPERATOR_UPGRADE_INSTALLED/);
  const paths = script.match(/scripts\/vendi04-[a-z-]+\.sh/g) ?? [];
  assert.ok(paths.length >= 5);
});

test("mission approval is restricted to administrators", () => {
  const routes = read("artifacts/api-server/src/routes/vendi.ts");
  assert.ok(routes.includes('router.post("/vendi/missions/:id/approve", requireRole("super_admin", "tenant_admin")'));
});

test("legacy release center cannot merge before host and cron gates are proven", () => {
  const releaseCenter = read("artifacts/api-server/src/routes/admin_release_center.ts");
  const start = releaseCenter.indexOf("async function executeScheduledRelease(");
  const merge = releaseCenter.indexOf("/pulls/\" + prNumber + \"/merge", start);
  const guard = releaseCenter.indexOf("VENDI_RELEASE_PIPELINE_NOT_VERIFIED_NO_MERGE", start);
  assert.ok(start >= 0 && guard > start && merge > guard);
  assert.match(releaseCenter, /VENDI_RELEASE_HOST_RECEIPTS_VERIFIED/);
  assert.match(releaseCenter, /VENDI_RELEASE_CRON_LOCK_VERIFIED/);
});

test("mission lease migration is explicit and supervisor renews it", () => {
  const sql = read("lib/db/migrations/202610272240_vendi_mission_leases.sql");
  const supervisor = read("artifacts/api-server/src/services/vendi-mission-supervisor.ts");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS vendi_mission_leases/);
  assert.match(supervisor, /VENDI_MISSION_ALREADY_RUNNING/);
  assert.match(supervisor, /VENDI_MISSION_LEASE_LOST/);
  assert.match(supervisor, /DELETE FROM vendi_mission_leases/);
});

test("failed rollback health restores previous production before incident escalation", () => {
  const script = read("scripts/vendi04-controlled-release.sh");
  assert.ok(script.includes("ROLLBACK_BACKUP_UNHEALTHY_RESTORING_ORIGINAL"));
  assert.ok(script.includes("ROLLBACK_BACKUP_UNHEALTHY_ORIGINAL_RESTORED"));
  assert.ok(script.includes("ROLLBACK_HEALTH_FAILED_MANUAL_RECOVERY_REQUIRED"));
  const originalRename = script.indexOf('docker rename "$REPLACED" "$CURRENT"', script.indexOf("ROLLBACK_BACKUP_UNHEALTHY_RESTORING_ORIGINAL"));
  const recovered = script.indexOf("ROLLBACK_BACKUP_UNHEALTHY_ORIGINAL_RESTORED");
  assert.ok(originalRename > 0 && recovered > originalRename, "must put original container back first");
});

test("publish fails closed on changed database migrations and schema without compatible rollback proof", () => {
  const script = read("scripts/vendi04-controlled-release.sh");
  const baseline = script.indexOf("PRODUCTION_SOURCE_REVISION_UNKNOWN");
  const schemaDiff = script.indexOf('diff --name-only "$BASE_SHA" "$SHA" -- lib/db/migrations lib/db/src/schema');
  const review = script.indexOf("SCHEMA_CHANGE_REVIEW_REQUIRED");
  const containerSwap = script.indexOf('docker stop "$CURRENT"', script.indexOf("# Publish only an image"));
  assert.ok(baseline >= 0 && schemaDiff > baseline && review > schemaDiff && containerSwap > review);
  for (const token of [
    "RELEASE_SOURCE_NOT_DESCENDANT_OF_PRODUCTION",
    "SCHEMA_COMPATIBILITY_EVIDENCE_MISMATCH",
    "STATUS=ROLLBACK_COMPATIBILITY_VERIFIED",
  ]) assert.ok(script.includes(token), token);
});

test("same SHA can reuse image layers and never rebuild without free resources", () => {
  const runner = read("scripts/vendi04-release-runner.sh");
  const op = read("scripts/vendi-contabo-operator");
  assert.match(runner, /IMAGE_REUSED_EXISTING_SHA/);
  assert.match(runner, /other_sha.*==.*SHA/);
  assert.match(runner, /docker tag "\$oldtag" "\$IMAGE"/);
  assert.match(runner, /BUILD_BLOCKED_RESOURCE_PRESSURE/);
  assert.match(runner, /BUILD_BLOCKED_IMAGE_RETENTION_REVIEW/);
  assert.match(runner, /MEM_KB < 2097152/);
  assert.match(runner, /FREE_KB < 14680064/);
  assert.match(op, /STATUS=BUILT_REUSED_NO_NEW_LAYERS/);
  assert.match(op, /BUILD_BLOCKED_MEMORY_PRESSURE/);
});

test("candidate tests leave no persistent stopped Docker containers", () => {
  const stage = read("scripts/vendi04-homologate-candidate.sh");
  assert.match(stage, /docker run --rm --detach/);
  assert.match(stage, /cleanup\(\)/);
  assert.doesNotMatch(stage, /docker create --name "\$STAGE"/);
});

test("no bulk Docker prune is part of unattended release scripts", () => {
  for (const path of scripts) {
    const content = read(path);
    assert.doesNotMatch(content, /docker\s+(?:system|image|volume|builder)\s+prune/);
  }
});

test("limits outstanding candidate images without deleting backups or production assets", () => {
  const runner = read("scripts/vendi04-release-runner.sh");
  assert.match(runner, /BUILD_BLOCKED_UNPROMOTED_IMAGE_BACKLOG/);
  assert.match(runner, /PENDING_IMAGES >= 2/);
  assert.match(runner, /BUILD_BLOCKED_IMAGE_RETENTION_REVIEW/);
  assert.match(runner, /IMAGE_REUSED_EXISTING_SHA/);
});

test("isolated homologation refuses to run when RAM, swap or disk are pressured", () => {
  const stage = read("scripts/vendi04-homologate-candidate.sh");
  assert.match(stage, /HOMOLOG_BLOCKED_RESOURCE_PRESSURE/);
  assert.match(stage, /MEM_KB < 2097152/);
  assert.match(stage, /FREE_KB < 3145728/);
  assert.match(stage, /docker run --rm --detach/);
});
