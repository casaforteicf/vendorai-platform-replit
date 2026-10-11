/**
 * ARQDOR render quality contract.
 * These are rendering intentions, NOT a claim that a path tracer is installed.
 * A rendering adapter must explicitly declare capabilities before using physical effects.
 */
export type RenderQuality = "preview" | "professional" | "ultra";
export type RenderBackend = "interactive" | "physical-local" | "physical-cloud";
export type RenderCapability = "pbr" | "ray-tracing" | "global-illumination" | "denoise" | "hdr";
export type RenderCapabilities = Readonly<{ backend: RenderBackend; supported: readonly RenderCapability[] }>;
export type RenderQualitySettings = Readonly<{
  quality: RenderQuality;
  targetSamples: number;
  maxBounces: number;
  denoise: boolean;
  gi: boolean;
  geometryLocked: true;
  materialWorkflow: "metallic-roughness";
}>;
export const RENDER_QUALITY_SETTINGS: Record<RenderQuality, RenderQualitySettings> = {
  preview: { quality: "preview", targetSamples: 1, maxBounces: 0, denoise: false, gi: false, geometryLocked: true, materialWorkflow: "metallic-roughness" },
  professional: { quality: "professional", targetSamples: 256, maxBounces: 6, denoise: true, gi: true, geometryLocked: true, materialWorkflow: "metallic-roughness" },
  ultra: { quality: "ultra", targetSamples: 1024, maxBounces: 12, denoise: true, gi: true, geometryLocked: true, materialWorkflow: "metallic-roughness" },
};
export const INTERACTIVE_CAPABILITIES: RenderCapabilities = { backend: "interactive", supported: ["pbr"] };

export function resolveRenderQuality(
  quality: RenderQuality,
  capabilities: RenderCapabilities,
): { settings: RenderQualitySettings; effectiveQuality: RenderQuality; warnings: string[] } {
  const requested = RENDER_QUALITY_SETTINGS[quality];
  if (quality === "preview") return { settings: requested, effectiveQuality: quality, warnings: [] };
  const requires: RenderCapability[] = ["pbr", "ray-tracing", "global-illumination", "denoise"];
  const missing = requires.filter((item) => !capabilities.supported.includes(item));
  if (missing.length) {
    return {
      settings: RENDER_QUALITY_SETTINGS.preview,
      effectiveQuality: "preview",
      warnings: [`Render físico indisponível neste dispositivo/motor. Recursos ausentes: ${missing.join(", ")}. Pré-visualização mantida; nenhum render físico foi iniciado.`],
    };
  }
  return { settings: requested, effectiveQuality: quality, warnings: [] };
}
