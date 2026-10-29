/** Capability probe only. A GPU is never advertised as a working render backend until
 * the corresponding renderer has been implemented, configured and health-checked.
 * No device identifiers or hardware information are uploaded.
 */
export type RenderAcceleratorCapabilities = Readonly<{
  webgpu: "available" | "unavailable" | "blocked";
  serverGpu: "not_configured";
  webgpuRendererReady: false;
  serverGpuRendererReady: false;
}>;

export async function probeRenderAccelerators(): Promise<RenderAcceleratorCapabilities> {
  const fallback: RenderAcceleratorCapabilities = {
    webgpu: "unavailable", serverGpu: "not_configured",
    webgpuRendererReady: false, serverGpuRendererReady: false,
  };
  if (typeof navigator === "undefined" || typeof window === "undefined" || !window.isSecureContext)
    return fallback;
  const gpu = (navigator as Navigator & {
    gpu?: { requestAdapter: (options?: { powerPreference?: string }) => Promise<unknown | null> };
  }).gpu;
  if (!gpu || typeof gpu.requestAdapter !== "function") return fallback;
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    return { ...fallback, webgpu: adapter ? "available" : "unavailable" };
  } catch {
    return { ...fallback, webgpu: "blocked" };
  }
}

export type RenderBackend = "cpu" | "webgpu" | "server-gpu";
export function selectAvailableRenderBackend(
  capabilities: RenderAcceleratorCapabilities,
  preference: "automatic" | RenderBackend = "automatic",
): RenderBackend {
  if ((preference === "automatic" || preference === "webgpu") &&
      capabilities.webgpu === "available" && capabilities.webgpuRendererReady) return "webgpu";
  if ((preference === "automatic" || preference === "server-gpu") &&
      capabilities.serverGpuRendererReady) return "server-gpu";
  return "cpu";
}
