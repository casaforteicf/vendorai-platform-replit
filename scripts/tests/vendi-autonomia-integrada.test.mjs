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
  assert.match(stage, /--network vendorai-homolog --restart no/);
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
