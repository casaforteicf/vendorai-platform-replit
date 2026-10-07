import { eq } from "drizzle-orm";
import { db, prospectorConfigTable } from "@workspace/db";

export type ColdProspectingRuntimeConfig = {
  mode: "off" | "assisted" | "autonomous";
  allowedSolutions: Array<"vendorai" | "arqdor">;
  targetSegments: string[];
  targetPersonas: string[];
  allowedChannels: Array<"whatsapp" | "email" | "phone" | "instagram">;
  contactWindowStart: string;
  contactWindowEnd: string;
  timezone: string;
  maxContactsPerPerson7d: number;
  qualificationThreshold: number;
  meetingReadinessThreshold: number;
  autoSendApprovedContent: boolean;
  conversionCriteria: {
    requireResponsible: boolean;
    requireConfirmedPain: boolean;
    requireDecisionMakerOrPath: boolean;
    requireMeetingAccepted: boolean;
  };
};

const DEFAULT_CONFIG: ColdProspectingRuntimeConfig = {
  mode: "off",
  allowedSolutions: ["vendorai"],
  targetSegments: [],
  targetPersonas: [],
  allowedChannels: ["whatsapp"],
  contactWindowStart: "08:00",
  contactWindowEnd: "18:00",
  timezone: "America/Sao_Paulo",
  maxContactsPerPerson7d: 5,
  qualificationThreshold: 70,
  meetingReadinessThreshold: 80,
  autoSendApprovedContent: false,
  conversionCriteria: {
    requireResponsible: true,
    requireConfirmedPain: true,
    requireDecisionMakerOrPath: true,
    requireMeetingAccepted: false,
  },
};

export async function resolveColdProspectingConfig(tenantId: string): Promise<ColdProspectingRuntimeConfig> {
  const [config] = await db.select().from(prospectorConfigTable)
    .where(eq(prospectorConfigTable.tenantId, tenantId))
    .limit(1);

  if (!config) return DEFAULT_CONFIG;

  return {
    mode: config.coldProspectingMode ?? "off",
    allowedSolutions: config.allowedSolutions?.length ? config.allowedSolutions : ["vendorai"],
    targetSegments: config.targetSegments ?? [],
    targetPersonas: config.targetPersonas ?? [],
    allowedChannels: config.allowedChannels?.length ? config.allowedChannels : ["whatsapp"],
    contactWindowStart: config.contactWindowStart ?? "08:00",
    contactWindowEnd: config.contactWindowEnd ?? "18:00",
    timezone: config.timezone ?? "America/Sao_Paulo",
    maxContactsPerPerson7d: config.maxContactsPerPerson7d ?? 5,
    qualificationThreshold: config.qualificationThreshold ?? 70,
    meetingReadinessThreshold: config.meetingReadinessThreshold ?? 80,
    autoSendApprovedContent: config.autoSendApprovedContent ?? false,
    conversionCriteria: {
      ...DEFAULT_CONFIG.conversionCriteria,
      ...(config.conversionCriteria ?? {}),
    },
  };
}

export function isSolutionAllowed(
  solution: "vendorai" | "arqdor",
  config: ColdProspectingRuntimeConfig,
): boolean {
  return config.allowedSolutions.includes(solution);
}

export function canExecuteAutonomously(config: ColdProspectingRuntimeConfig): boolean {
  return config.mode === "autonomous";
}
