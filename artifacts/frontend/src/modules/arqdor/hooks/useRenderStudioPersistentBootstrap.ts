import { useMemo } from "react";
import { usePersistentRenderHistory } from "./usePersistentRenderHistory";
import {
  buildRenderStudioPersistentState,
  mergeRecoveryCache,
  type RenderStudioPersistentState,
  type RenderStudioVersion,
} from "./renderStudioPersistentAdapter";

export type RenderStudioRecoveryCache = {
  versions?: RenderStudioVersion[];
  renderId?: string | null;
  renderUrl?: string | null;
  imageUrl?: string | null;
};

/**
 * Bootstrap oficial do Render Studio.
 *
 * Regra:
 * 1. histórico persistido no backend sempre vence;
 * 2. sessionStorage/local cache só entra quando o backend ainda não devolveu
 *    nenhuma versão persistida;
 * 3. a tela recebe um estado único, no formato que ela já consome.
 */
export function useRenderStudioPersistentBootstrap(
  projectId: string | null | undefined,
  ambiente: string | undefined,
  recoveryCache: RenderStudioRecoveryCache = {},
) {
  const history = usePersistentRenderHistory(projectId, ambiente);

  const persistentState = useMemo<RenderStudioPersistentState>(
    () => buildRenderStudioPersistentState(history.versions),
    [history.versions],
  );

  const state = useMemo<RenderStudioPersistentState>(() => {
    // Uma resposta bem-sucedida e vazia do backend é autoritativa: não ressuscite versões do cache.
    if (projectId && history.loadedProjectId === projectId && !history.error) return persistentState;
    const recovered = mergeRecoveryCache(
      persistentState,
      Array.isArray(recoveryCache.versions) ? recoveryCache.versions : [],
      recoveryCache.imageUrl,
    );

    // Recovery de render isolado (job antigo concluído sem lista local de versões).
    if (
      recovered.versions.length === 0 &&
      recoveryCache.renderId &&
      recoveryCache.renderUrl
    ) {
      const fallback: RenderStudioVersion = {
        id: recoveryCache.renderId,
        url: recoveryCache.renderUrl,
        label: "Versão 1 · Recuperada",
        operationType: "initial",
        createdAt: new Date(0),
      };

      return {
        versions: [fallback],
        latestRenderId: fallback.id,
        latestRenderUrl: fallback.url,
        sourceImageUrl: recoveryCache.imageUrl ?? persistentState.sourceImageUrl ?? null,
        approvedVersionId: null,
      };
    }

    return recovered;
  }, [persistentState, projectId, history.loadedProjectId, history.error, recoveryCache.versions, recoveryCache.renderId, recoveryCache.renderUrl, recoveryCache.imageUrl]);

  const source = history.versions.length > 0 ? "backend" : state.versions.length > 0 ? "recovery" : "empty";

  return {
    ...history,
    state,
    source,
    hasPersistentHistory: history.versions.length > 0,
    hasRecoveryOnly: history.versions.length === 0 && state.versions.length > 0,
  };
}
