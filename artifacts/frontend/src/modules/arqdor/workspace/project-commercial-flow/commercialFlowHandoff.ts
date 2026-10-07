export type CommercialFlowStage = "render" | "specification" | "budget";

export type CommercialFlowHandoff = {
  projectId: string;
  stage: CommercialFlowStage;
  renderId?: string | null;
  specObjectId?: string | null;
  budgetId?: string | null;
  source?: string | null;
  updatedAt: string;
};

const KEY = "arqdor:commercial-flow-handoff";

export function writeCommercialFlowHandoff(
  input: Omit<CommercialFlowHandoff, "updatedAt">,
) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY, JSON.stringify({ ...input, updatedAt: new Date().toISOString() }));
}

export function readCommercialFlowHandoff(projectId?: string | null): CommercialFlowHandoff | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CommercialFlowHandoff;
    if (!parsed?.projectId || !parsed?.stage) return null;
    if (projectId && parsed.projectId !== projectId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearCommercialFlowHandoff() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEY);
}
