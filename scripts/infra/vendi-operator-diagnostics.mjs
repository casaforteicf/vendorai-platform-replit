/**
 * Safe diagnostics for failures of the existing Contabo operator.
 * Pure, dependency-free. Never logs SSH credentials, environment or auth tokens.
 * IMPORTANT: does not invoke the operator, build, deploy, or mutate a host.
 */
const ACTIONS = new Set(["build","homologate","rollback","releaseStatus"]);
const LOT = /^[A-Z][A-Z0-9]{1,15}-[0-9]{1,6}$/;
const patterns = [
  [/sudo:.*(password is required|a terminal is required|not allowed|sorry|permission denied)/i, "SUDO_POLICY"],
  [/sudo:.*(command not found|unable to execute)/i, "SUDO_EXECUTION"],
  [/permission denied \(publickey/i, "SSH_AUTH"],
  [/host key verification failed/i, "SSH_HOST_KEY"],
  [/connection timed out|connection refused|no route to host/i, "SSH_CONNECTIVITY"],
  [/no space left on device/i, "DISK_FULL"],
  [/no such file or directory/i, "MISSING_EXECUTABLE_OR_PATH"],
  [/lot.*(not found|unknown|not allowed|invalid)/i, "LOT_NOT_REGISTERED"],
  [/not in the sudoers file|user is not allowed to execute/i, "SUDO_POLICY"],
  [/image.*(not found|unknown)/i, "IMAGE_NOT_FOUND"],
  [/migration.*(failed|error)/i, "MIGRATION_FAILED"],
];
export function inspectVendiOperatorFailure(input) {
  if (!ACTIONS.has(input?.action) || !LOT.test(input?.lot ?? "")) {
    return {category:"INVALID_ARGUMENT",action:"",lot:"",exitCode:null,diagnosticAvailable:false};
  }
  // Only reason/category escapes; source error output can contain credentials.
  const raw = String(input.stderr ?? input.errorMessage ?? "").slice(0,16000);
  const exitCode = Number.isSafeInteger(input.exitCode) ? input.exitCode : null;
  const found = patterns.find(([pattern]) => pattern.test(raw))?.[1];
  const wrapperOnly = /Command failed:\s*ssh\s/i.test(raw) && !/\n(?:sudo:|Permission denied|Host key verification|lot\s|migration\s|No space left)/i.test(raw);
  const category = found ?? (wrapperOnly ? "REMOTE_EXIT_UNOBSERVABLE" : "UNKNOWN_OPERATOR_FAILURE");
  return {category,action:input.action,lot:input.lot,exitCode,diagnosticAvailable:raw.trim().length>0,
    recommendedAction:({
      SUDO_POLICY:"Verify allowlisted sudo -n command and operator file permissions on the host",
      SUDO_EXECUTION:"Verify operator execution path and permissions without modifying production",
      REMOTE_EXIT_UNOBSERVABLE:"Wrapper lost remote exit details; capture numeric exit code and redact stderr at the existing MCP boundary, then check sudo -n allowlist and host operator",
      SSH_AUTH:"Verify restricted SSH key and authorized_keys on the host",
      SSH_HOST_KEY:"Verify host key using an out-of-band trusted fingerprint",
      SSH_CONNECTIVITY:"Check connector-to-host network and SSH daemon",
      DISK_FULL:"Check free space; preserve rollback images and backups",
      MISSING_EXECUTABLE_OR_PATH:"Verify /usr/local/sbin/vendi-contabo-operator exists and is executable",
      LOT_NOT_REGISTERED:"Register the lot mapping and immutable commit/image in the existing operator",
      IMAGE_NOT_FOUND:"Verify expected immutable image is present; do not silently build a different SHA",
      MIGRATION_FAILED:"Inspect homologation migration logs and database target before retry",
      UNKNOWN_OPERATOR_FAILURE:"Capture exit code and redacted stderr on the host; do not guess root cause"
    })[category]};
}
