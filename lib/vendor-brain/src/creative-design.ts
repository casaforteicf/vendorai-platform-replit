export interface BrandProfile {
  tenantId: string;
  logoUrl?: string | null;
  colors?: string[];
  fonts?: string[];
  tone?: string[];
  visualStyle?: string[];
  photoStyle?: string[];
  videoStyle?: string[];
  preferredCtas?: string[];
  forbiddenPatterns?: string[];
}

export interface CreativeBrief {
  tenantId: string;
  campaignId?: string | null;
  objective: string;
  audience?: string | null;
  productId?: string | null;
  offer?: string | null;
  channel: string;
  format: string;
  message?: string | null;
  cta?: string | null;
  visualDirection?: string | null;
  assetIds?: string[];
}

export interface DesignQaResult {
  brandScore: number;
  readabilityScore: number;
  compositionScore: number;
  channelFitScore: number;
  ctaScore: number;
  technicalScore: number;
  overallScore: number;
  approved: boolean;
  warnings: string[];
  recommendations: string[];
}

export function calculateDesignQaScore(input: Omit<DesignQaResult, "overallScore" | "approved">, approvalThreshold = 75): DesignQaResult {
  const values = [
    input.brandScore,
    input.readabilityScore,
    input.compositionScore,
    input.channelFitScore,
    input.ctaScore,
    input.technicalScore,
  ];
  const overallScore = Math.round(values.reduce((sum, value) => sum + Math.max(0, Math.min(100, value)), 0) / values.length);

  return {
    ...input,
    overallScore,
    approved: overallScore >= approvalThreshold,
  };
}

export function validateCreativeBrief(brief: CreativeBrief): string[] {
  const errors: string[] = [];
  if (!brief.tenantId) errors.push("tenantId is required");
  if (!brief.objective?.trim()) errors.push("objective is required");
  if (!brief.channel?.trim()) errors.push("channel is required");
  if (!brief.format?.trim()) errors.push("format is required");
  return errors;
}
