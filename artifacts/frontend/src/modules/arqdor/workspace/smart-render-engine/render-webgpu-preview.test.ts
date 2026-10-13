import { describe, expect, it } from "vitest";
import { renderWebGpuPreview } from "./render-webgpu-preview";
import type { DiffusePreviewOptions } from "./render-diffuse-preview";

const options = {
  geometry: {
    schemaVersion: 1, truncated: false, warnings: [], totalTriangles: 1,
    meshes: [{ meshId: "triangle", materialId: "white", triangles: 1,
      positions: [-1,-1,0, 1,-1,0, 0,1,0],
      normals: [0,0,1, 0,0,1, 0,0,1], uvs: [0,0, 1,0, .5,1] }],
  },
  materials: { white: "#ffffff" },
  camera: { position: [0,0,3], target: [0,0,0], verticalFovDegrees: 60 },
  light: { directionToLight: [0,0,1], intensity: 1, color: [1,1,1] },
  width: 16, height: 16,
} as unknown as DiffusePreviewOptions;

describe("experimental WebGPU preflight", () => {
  it("rejects incomplete geometry before touching the GPU", async () => {
    await expect(renderWebGpuPreview({ ...options,
      geometry: { ...options.geometry, truncated: true } }))
      .rejects.toThrow(/cenas completas/);
  });
  it("rejects inconsistent or unsupported triangle counts", async () => {
    await expect(renderWebGpuPreview({ ...options,
      geometry: { ...options.geometry, totalTriangles: 513 } }))
      .rejects.toThrow(/512 triângulos/);
  });
  it("rejects invalid dimensions", async () => {
    await expect(renderWebGpuPreview({ ...options, width: 1000, height: 1000 }))
      .rejects.toThrow(/resolução WebGPU/);
  });
  it("rejects invalid field of view", async () => {
    await expect(renderWebGpuPreview({ ...options, camera: { ...options.camera, verticalFovDegrees: 0 } }))
      .rejects.toThrow(/FOV inválido/);
  });
});
