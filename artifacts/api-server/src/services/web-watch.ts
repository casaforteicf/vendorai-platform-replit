function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function fingerprintSkillResult(result: {
  finalUrl: string;
  steps: Array<{ action: string; detail?: string; verified: boolean }>;
}) {
  const extracted = result.steps
    .filter((step) => step.action === "extract")
    .map((step) => step.detail ?? "")
    .join("\n");
  return hashText(JSON.stringify({
    finalUrl: result.finalUrl,
    extracted,
    verified: result.steps.every((step) => step.verified),
  }));
}

export function compareWatchFingerprint(previous: string | null | undefined, next: string) {
  return {
    previous: previous ?? null,
    current: next,
    changed: Boolean(previous && previous !== next),
    initialized: !previous,
  };
}
