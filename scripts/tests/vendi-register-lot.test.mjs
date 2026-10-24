import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const op = readFileSync(new URL("../vendi-contabo-operator", import.meta.url), "utf8");
const policy = readFileSync(new URL("../../artifacts/cloudflare-mcp/src/release-operator-policy.ts", import.meta.url), "utf8");
const mcp = readFileSync(new URL("../../artifacts/cloudflare-mcp/src/index.ts", import.meta.url), "utf8");

test("operator registration verifies immutable SHA and source tree", () => {
  assert.match(op, /"registerLot"/);
  assert.match(op, /\^\[a-f0-9\]\{40\}\$/);
  assert.match(op, /cat-file -e "\$SHA\^\{commit\}"/);
  assert.match(op, /DOCKERFILE_NOT_IN_COMMIT/);
  assert.match(op, /CONTEXT_NOT_DIRECTORY/);
  assert.match(op, /LOT_ALREADY_REGISTERED/);
  assert.match(op, /chmod 0600 "\$TEMP"/);
});
test("MCP demands explicit grant for registration", () => {
  assert.match(policy, /"registerLot"/);
  assert.match(mcp, /"vendi_register_lot"/);
  assert.match(mcp, /releaseOperatorGrant\("registerLot", lot\)/);
  assert.match(mcp, /vendi-contabo-operator registerLot/);
});
