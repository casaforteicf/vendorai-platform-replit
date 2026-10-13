import { describe, expect, it } from "vitest";
import { selectAvailableRenderBackend, type RenderAcceleratorCapabilities } from "./render-gpu-capabilities";

const capabilities: RenderAcceleratorCapabilities = {
  webgpu: "available",
  serverGpu: "not_configured",
  webgpuRendererReady: false,
  serverGpuRendererReady: false,
};

describe("Arqdor GPU capability gate", () => {
  it("keeps CPU fallback even if the browser exposes WebGPU", () => {
    expect(selectAvailableRenderBackend(capabilities)).toBe("cpu");
    expect(selectAvailableRenderBackend(capabilities, "webgpu")).toBe("cpu");
  });

  it("does not advertise a server GPU that has not passed health checks", () => {
    expect(selectAvailableRenderBackend(capabilities, "server-gpu")).toBe("cpu");
    expect(selectAvailableRenderBackend({ ...capabilities, webgpu: "blocked" })).toBe("cpu");
  });

  it("honors an explicit CPU preference", () => {
    expect(selectAvailableRenderBackend(capabilities, "cpu")).toBe("cpu");
  });
});
