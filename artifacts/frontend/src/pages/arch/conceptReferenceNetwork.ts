function token() {
  return typeof window !== "undefined" ? localStorage.getItem("vendorai_token") : null;
}

async function postFile(projectId: string, endpoint: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const auth = token();
  const response = await fetch(`/api/arch/concept-projects/${encodeURIComponent(projectId)}/${endpoint}`, {
    method: "POST",
    headers: auth ? { Authorization: `Bearer ${auth}` } : undefined,
    body: form,
  });
  return { response, payload: await response.json().catch(() => ({})) as any };
}

export async function uploadProjectSourceFileRequest(projectId: string, file: File) {
  const { response, payload } = await postFile(projectId, "source-file", file);
  if (!response.ok || !payload?.id) throw new Error(payload?.error ?? "Não foi possível salvar o arquivo BIM/CAD.");
  return payload;
}

export function projectSourceFileMessage(payload: any) {
  if (payload.extension === "ifc") return "IFC vinculado ao projeto. Você pode ler os metadados ou converter para geometria editável.";
  if (payload.extension === "skp") return "SketchUp vinculado ao projeto. Clique em Converter SketchUp para gerar o modelo 3D no Arqdor.";
  if (payload.parserStatus === "ready_model3d") return `${String(payload.extension).toUpperCase()} pronto como modelo 3D do Arqdor.`;
  return `${String(payload.extension).toUpperCase()} vinculado ao projeto. A conversão será feita pela camada de interoperabilidade.`;
}

export async function uploadReferencePlanRequest(projectId: string, file: File) {
  const { response, payload } = await postFile(projectId, "reference-plan", file);
  if (!response.ok || !payload?.url) throw new Error(payload?.error ?? "Não foi possível salvar a planta de referência.");
  return payload;
}

export async function clearRealEnvironmentRequest(projectId: string) {
  const auth = token();
  await fetch(`/api/arch/concept-projects/${encodeURIComponent(projectId)}/real-environment`, {
    method: "DELETE",
    headers: auth ? { Authorization: `Bearer ${auth}` } : undefined,
  }).catch(() => undefined);
}

export async function traceReferencePlanRequest(projectId: string) {
  const auth = token();
  const response = await fetch(`/api/arch/concept-projects/${encodeURIComponent(projectId)}/reference-plan/trace`, {
    method: "POST",
    headers: auth ? { Authorization: `Bearer ${auth}` } : undefined,
  });
  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(payload?.error ?? "Não foi possível interpretar a planta com IA.");
  return payload;
}


export async function importProjectIntelligentRequest(projectId: string, file: File) {
  const { response, payload } = await postFile(projectId, "import-project-intelligent", file);
  if (!response.ok) throw new Error(payload?.error ?? "Não foi possível interpretar o projeto.");
  return payload;
}

export async function importedProjectGeometryPreviewRequest(
  projectId: string,
  options: { floorPlanIndex?: number; floor?: number; widthMeters?: number; depthMeters?: number } = {},
) {
  const auth = token();
  const params = new URLSearchParams();
  if (options.floorPlanIndex != null) params.set("floorPlanIndex", String(options.floorPlanIndex));
  if (options.floor != null) params.set("floor", String(options.floor));
  if (options.widthMeters != null) params.set("widthMeters", String(options.widthMeters));
  if (options.depthMeters != null) params.set("depthMeters", String(options.depthMeters));
  const response = await fetch(
    `/api/arch/concept-projects/${encodeURIComponent(projectId)}/imported-project/geometry-preview?${params.toString()}`,
    { headers: auth ? { Authorization: `Bearer ${auth}` } : undefined },
  );
  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(payload?.error ?? "Não foi possível gerar a prévia da planta importada.");
  return payload;
}

export async function applyImportedProjectGeometryRequest(
  projectId: string,
  options: {
    floorPlanIndex?: number;
    floor?: number;
    widthMeters?: number;
    depthMeters?: number;
    replace?: boolean;
  } = {},
) {
  const auth = token();
  const response = await fetch(
    `/api/arch/concept-projects/${encodeURIComponent(projectId)}/imported-project/apply-geometry`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      },
      body: JSON.stringify({ ...options, confirm: true }),
    },
  );
  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(payload?.error ?? "Não foi possível aplicar a planta importada.");
  return payload;
}


export async function importedProject3DPreviewRequest(projectId: string) {
  const auth = token();
  const response = await fetch(
    `/api/arch/concept-projects/${encodeURIComponent(projectId)}/imported-project/3d-preview`,
    { headers: auth ? { Authorization: `Bearer ${auth}` } : undefined },
  );
  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(payload?.error ?? "Não foi possível gerar a prévia 3D importada.");
  return payload;
}

export async function applyImportedProject3DRequest(projectId: string) {
  const auth = token();
  const response = await fetch(
    `/api/arch/concept-projects/${encodeURIComponent(projectId)}/imported-project/apply-3d`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      },
      body: JSON.stringify({ confirm: true }),
    },
  );
  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(payload?.error ?? "Não foi possível aplicar cortes, fachadas e cobertura.");
  return payload;
}
