import { getConfig } from './contentAutopilot';
import { resolveBrandProfileFromBusinessSource } from '@workspace/vendor-brain/creative-runtime';
import type { BrandProfile } from '@workspace/vendor-brain/creative-design';

/**
 * Reuses the tone already learned by Content Autopilot as part of the shared
 * Creative/Design brand context. This is intentionally read-only: the existing
 * content_autopilot_config.brandTone remains the canonical learned tone.
 */
export async function enrichBrandProfileWithContentAutopilot(
  base: BrandProfile,
): Promise<BrandProfile> {
  const config = await getConfig(base.tenantId);
  const brandTone = config?.brandTone as
    | { tom?: string; vocabulario?: string[]; publicoAlvo?: string; exemplos?: string[] }
    | null
    | undefined;

  if (!brandTone) return base;

  return {
    ...base,
    tone: [
      ...(base.tone ?? []),
      ...(brandTone.tom ? [brandTone.tom] : []),
      ...(brandTone.publicoAlvo ? [`Público percebido: ${brandTone.publicoAlvo}`] : []),
    ],
    visualStyle: base.visualStyle ?? [],
  };
}

export async function resolveContentAutopilotBrandContext(input: {
  tenantId: string;
  logoUrl?: string | null;
  brandColor?: string | null;
}): Promise<BrandProfile> {
  const base = resolveBrandProfileFromBusinessSource(input);
  return enrichBrandProfileWithContentAutopilot(base);
}
