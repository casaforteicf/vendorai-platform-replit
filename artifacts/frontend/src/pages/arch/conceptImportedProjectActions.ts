export async function runIntelligentProjectImport(projectId: string, file: File) {
  const { importProjectIntelligentRequest } = await import("./conceptReferenceNetwork");
  const payload = await importProjectIntelligentRequest(projectId, file) as any;
  const previews = Array.isArray(payload?.geometryPreviews) ? payload.geometryPreviews : [];
  const applicable = previews.filter((item: any) => item?.canApply).length;
  const floorPlans = Number(payload?.memory?.floorPlans?.length ?? previews.length ?? 0);
  const models = Number(payload?.universalModels?.length ?? 0);
  const openings = Number(payload?.memory?.openings?.length ?? 0);
  return {
    payload,
    message:
      "Importação Inteligente concluída: " + floorPlans + " planta(s), " + openings +
      " esquadria(s)/abertura(s) e " + models + " modelo(s) enviados à Biblioteca Universal. " +
      (applicable
        ? applicable + " planta(s) já podem virar geometria editável."
        : "A geometria aguarda calibração/revisão técnica."),
  };
}

export async function runImportedProject2D(projectId: string) {
  const { applyImportedProjectGeometryRequest } = await import("./conceptReferenceNetwork");
  const payload = await applyImportedProjectGeometryRequest(projectId, {
    floorPlanIndex: 0,
    floor: 0,
    replace: true,
  }) as any;
  const preview = payload?.preview;
  if (!preview?.canApply) throw new Error("A planta ainda não está pronta para aplicação.");
  return preview;
}

export async function runImportedProject3D(projectId: string) {
  const { applyImportedProject3DRequest } = await import("./conceptReferenceNetwork");
  return await applyImportedProject3DRequest(projectId) as any;
}
