export async function analyzeRealEnvironmentRequest(input: {
  projectId: string;
  kind: string;
  useMode: string;
}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("vendorai_token") : null;
  const response = await fetch(`/api/arch/concept-projects/${encodeURIComponent(input.projectId)}/real-environment/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ kind: input.kind, useMode: input.useMode }),
  });
  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok || !payload?.elements) throw new Error(payload.error ?? "Não foi possível analisar o ambiente.");
  return payload;
}

export async function updateRealEnvironmentActionRequest(input: {
  projectId: string;
  elementId: string;
  action: string;
  elementLabel: string;
}) {
  if (["remove", "replace", "relocate"].includes(input.action)) {
    const labels: Record<string, string> = { remove: "remover", replace: "substituir", relocate: "realocar" };
    if (!window.confirm(`Confirmar: ${labels[input.action]} “${input.elementLabel}” na intervenção? O Arqdor preservará os demais elementos.`)) {
      return null;
    }
  }
  const token = typeof window !== "undefined" ? localStorage.getItem("vendorai_token") : null;
  const response = await fetch(
    `/api/arch/concept-projects/${encodeURIComponent(input.projectId)}/real-environment/elements/${encodeURIComponent(input.elementId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action: input.action }),
    },
  );
  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok || !payload?.elements) throw new Error(payload.error ?? "Não foi possível atualizar a intervenção.");
  return payload;
}
