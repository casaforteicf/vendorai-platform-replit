import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(
  fileURLToPath(new URL("../vendi04-release-runner.sh", import.meta.url)),
  "utf8",
);

test("release status reports missing state without a failing exit", () => {
  const statusStart = source.indexOf(" status)\n");
  const statusEnd = source.indexOf("\n rollback)", statusStart);
  const status = source.slice(statusStart, statusEnd);
  assert.ok(statusStart >= 0 && statusEnd > statusStart);
  assert.match(status, /STATUS=NO_BUILD_STATE/);
  assert.match(status, /IMAGE_NOT_BUILT/);
  assert.match(status, /LAST_BUILD_EVENT=/);
  assert.match(status, /\[\[ -f "\$STATE" && ! -L "\$STATE" \]\]/);
});

test("failed builds persist a terminal state and event", () => {
  assert.match(source, /trap build_failed ERR/);
  assert.match(source, /STATUS=BUILD_FAILED/);
  assert.match(source, /record "BUILD_FAILED rc=\$rc"/);
  assert.match(source, /mv "\$STATE\.tmp" "\$STATE"/);
});
