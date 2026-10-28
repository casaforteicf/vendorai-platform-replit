type Step = { toolId: string; input: Record<string, unknown>; reason: string };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

// Keep each outstanding requirement, including repeated calls with distinct inputs.
// The model may add steps, but cannot silently discard the remaining plan.
export function preservePendingSteps<T extends Step>(pending: T[], proposed: T[]): T[] {
  const result = [...proposed];
  const counts = new Map<string, number>();
  const key = (step: T) => canonical({ toolId: step.toolId, input: step.input });
  for (const step of proposed) counts.set(key(step), (counts.get(key(step)) ?? 0) + 1);
  for (const step of pending) {
    const available = counts.get(key(step)) ?? 0;
    if (available) counts.set(key(step), available - 1);
    else result.push(step);
  }
  return result;
}

export function isObserverReadOnlyTool(tool: { mutates: boolean; externalEffect: boolean }): boolean {
  return !tool.mutates && !tool.externalEffect;
}

export function completedPlan(plan: Step[], outputs: Array<Record<string, unknown>>): boolean {
  return plan.length > 0 && plan.every((step, stepIndex) => outputs.some((output) =>
    output.stepIndex === stepIndex && output.toolId === step.toolId && output.ok === true));
}
