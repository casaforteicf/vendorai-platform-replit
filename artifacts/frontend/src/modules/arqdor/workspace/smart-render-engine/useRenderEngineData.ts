import { useMemo } from "react";
import type { RenderVersion } from "./RenderEngineContext";

export function useRenderEngineData(arqState: any): RenderVersion[] {
  return useMemo(() => {
    const project = arqState?.currentProject || arqState?.selectedProject || arqState?.project;
    const rawVersions =
      project?.renderVersions ||
      project?.versoes ||
      project?.renders ||
      arqState?.renderVersions ||
      arqState?.renders ||
      [];

    if (!Array.isArray(rawVersions)) return [];

    return rawVersions.map((item: any, index: number) => ({
      id: String(item.id || item.renderId || `render-${index + 1}`),
      label: item.label || item.nome || item.title || `Versão ${index + 1}`,
      imageUrl: item.imageUrl || item.url || item.renderUrl || item.outputUrl,
      prompt: item.prompt || item.description || item.descricao,
      createdAt: item.createdAt || item.created_at || item.updatedAt || item.updated_at,
      favorite: Boolean(item.favorite || item.favorito),
      approved: Boolean(item.approved || item.aprovado),
    }));
  }, [arqState]);
}
