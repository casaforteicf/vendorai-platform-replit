import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(fileURLToPath(new URL("../vendi-contabo-operator", import.meta.url)), "utf8");

test("unregistered lots return an explicit read-only status before release commands", () => {
  const guard = source.indexOf('[[ "$ACTION" == "releaseStatus" && ! -f');
  const status = source.indexOf('echo "STATUS=LOT_NOT_REGISTERED"', guard);
  const exit = source.indexOf("exit 0", status);
  const releaseRunner = source.indexOf('/usr/local/sbin/vendi04-release-runner status "$LOT"');
  assert.ok(guard >= 0 && status > guard && exit > status && releaseRunner > exit);
  assert.ok(source.includes('echo "BUILD=BLOCKED"'));
  assert.ok(source.includes('echo "PRODUCTION=untouched"'));
});
test("other operations still reject unregistered lots", () => {
  assert.ok(source.includes('test -f "/var/lib/vendi-release/manifests/$LOT.env" || { echo "LOT_NOT_REGISTERED"; exit 65; }'));
  assert.ok(source.includes("HOMOLOGATE_OR_ROLLBACK_REQUIRES_PROVISIONED_DEPLOYMENT"));
});
