import { loadJarvisOperationalContext as loadBaseOperationalContext } from "./jarvis-operational-context-base.js";
import { loadJarvisMissionContext } from "./jarvis-mission-context.js";

/**
 * Contexto operacional consolidado do JARVIS.
 *
 * Mantém o contexto operacional já existente e acrescenta Missões + Biblioteca
 * de Decisões persistentes sem duplicar lógica nem adicionar outra chamada de LLM.
 */
export async function loadJarvisOperationalContext(tenantId: string): Promise<string> {
  const [baseContext, missionContext] = await Promise.all([
    loadBaseOperationalContext(tenantId),
    loadJarvisMissionContext(tenantId),
  ]);

  return [baseContext, missionContext].filter(Boolean).join("\n");
}
