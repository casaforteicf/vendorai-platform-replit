export function normalizeConceptStep(rawStep: number, maxStep: number): number {
  const step = Math.max(0, Math.min(maxStep, Number.isFinite(rawStep) ? rawStep : 0));
  return step >= 6 ? 6 : step >= 5 ? 5 : 4;
}

export function previousConceptStep(step: number): number {
  if (step >= 6) return 5;
  if (step >= 5) return 4;
  if (step >= 4) return 1;
  return 0;
}

export function nextConceptStep(step: number): number {
  if (step === 0) return 1;
  if (step === 1) return 4;
  if (step === 4) return 5;
  return 6;
}

export function conceptStepCta(step: number): string {
  if (step === 1) return "Abrir editor";
  if (step === 4) return "Ir para fachada";
  if (step === 5) return "Ver resultado";
  return "Continuar";
}
