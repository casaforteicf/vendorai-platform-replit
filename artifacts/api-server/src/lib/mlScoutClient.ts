/**
 * Cliente do microserviço Python de ML (services/ml-scout-service).
 * Preparado, mas NÃO conectado em nenhuma decisão real do Scout ainda —
 * services/ml-scout-service ainda não foi implantado no Railway, e
 * mesmo depois de implantado, não vai ter modelo treinado até a feature
 * store acumular dado real (ver README do serviço).
 *
 * Quando o modelo existir de verdade, o uso pretendido é: mais um SINAL
 * pra dentro do score já calculado pelas regras (ex: um boost extra se
 * a probabilidade do modelo for alta), nunca um substituto das regras —
 * elas continuam sendo o fallback se o serviço estiver fora do ar ou
 * sem modelo treinado.
 */
import type { Logger } from "pino";

const ML_SERVICE_URL = process.env["ML_SERVICE_URL"] ?? "";
const ML_SERVICE_INTERNAL_KEY = process.env["ML_SERVICE_INTERNAL_KEY"] ?? "";

export interface MlPredictionResult {
  hasModel: boolean;
  probability: number | null;
}

/**
 * Pede a probabilidade do modelo pra um conjunto de features. Retorna
 * hasModel:false (nunca lança) se o serviço não estiver configurado,
 * fora do ar, ou sem modelo treinado ainda — chamador sempre trata isso
 * como "sem sinal extra, segue com o score normal".
 */
export async function getMlPrediction(
  features: Record<string, unknown>,
  tenantId: string | null,
  log?: Logger,
): Promise<MlPredictionResult> {
  if (!ML_SERVICE_URL) {
    return { hasModel: false, probability: null };
  }
  try {
    const res = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ML_SERVICE_INTERNAL_KEY ? { "X-Internal-Key": ML_SERVICE_INTERNAL_KEY } : {}),
      },
      body: JSON.stringify({ features, tenantId }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { hasModel: false, probability: null };
    const data: unknown = await res.json();
    if (!data || typeof data !== "object") return { hasModel: false, probability: null };
    const probability = "probability" in data && typeof data.probability === "number" && Number.isFinite(data.probability)
      ? data.probability : null;
    return { hasModel: "hasModel" in data && data.hasModel === true, probability };
  } catch (err) {
    log?.warn({ err }, "ml-scout-client: serviço indisponível, seguindo sem sinal de ML");
    return { hasModel: false, probability: null };
  }
}
