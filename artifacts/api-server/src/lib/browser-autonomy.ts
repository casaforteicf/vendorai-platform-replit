/** Shared fail-closed policy for existing Browser MCP; no side effects. */
export function decideBrowserAutonomy(input: {
  globalEnabled?: boolean;
  tenantEnabled?: boolean;
  mode?: "assistido" | "autonomo";
  allowWrite?: boolean;
} = {}): { mode: "assistido" | "autonomo"; allowWrite: boolean } {
  const permitted = input.globalEnabled === true && input.tenantEnabled === true;
  const autonomous = permitted && input.mode === "autonomo";
  return { mode: autonomous ? "autonomo" : "assistido", allowWrite: autonomous && input.allowWrite === true };
}
