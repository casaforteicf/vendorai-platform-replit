/**
 * SDR Agent — partner prospector qualification helpers.
 *
 * qualifyPartnerCandidate: scores a Google Places result to determine whether
 * it is a good candidate for a VendorAI partnership (reseller / referral).
 */
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"],
});

export interface GooglePlaceInput {
  name: string;
  types?: string[];
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  formatted_phone_number?: string;
}

export interface QualificationResult {
  score: number;
  perfil: "contador" | "consultor" | "agencia" | "outro";
  qualificado: boolean;
  motivo: string;
}

/**
 * Uses Claude Sonnet to evaluate whether a Google Places result is a good
 * VendorAI partner candidate (accountant, consultant, agency, etc.).
 *
 * Returns score 0-100, a profile category, a boolean flag (true if score >= 60),
 * and a brief explanation.
 */
export async function qualifyPartnerCandidate(
  place: GooglePlaceInput,
): Promise<QualificationResult> {
  try {
    const placeDescription = [
      `Nome: ${place.name}`,
      place.types?.length ? `Tipos (Google): ${place.types.join(", ")}` : null,
      place.formatted_address ? `Endereço: ${place.formatted_address}` : null,
      place.rating != null ? `Avaliação: ${place.rating} (${place.user_ratings_total ?? 0} avaliações)` : null,
      place.formatted_phone_number ? `Telefone: ${place.formatted_phone_number}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const system = `Você é um especialista em qualificação de parceiros B2B para software de CRM voltado a PMEs.
Sua tarefa é avaliar se um estabelecimento é um bom candidato a parceiro/revendedor do VendorAI — um CRM com IA para pequenas e médias empresas.

Critérios de qualificação:
1. Tem rede de relacionamento com donos de PMEs (clientes naturais do software).
2. Tem credibilidade como consultor, prestador de serviço ou referência de mercado.
3. Opera localmente (não é franquia nacional sem autonomia de parceria).
4. Tem potencial real de recomendar ou vender software de gestão/CRM para seus clientes.

Perfis ideais: escritórios de contabilidade, consultores de gestão, agências de marketing digital, assessorias empresariais.

Responda APENAS com JSON válido no formato exato:
{
  "score": <número inteiro de 0 a 100>,
  "perfil": <"contador" | "consultor" | "agencia" | "outro">,
  "qualificado": <true se score >= 60, senão false>,
  "motivo": "<frase curta explicando a pontuação>"
}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 256,
      system,
      messages: [
        {
          role: "user",
          content: `Avalie o seguinte estabelecimento como candidato a parceiro VendorAI:\n\n${placeDescription}`,
        },
      ],
    });

    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Resposta sem JSON válido");

    const parsed = JSON.parse(jsonMatch[0]) as QualificationResult;
    const score = Math.min(100, Math.max(0, Number(parsed.score) || 0));
    return {
      score,
      perfil: ["contador", "consultor", "agencia", "outro"].includes(parsed.perfil)
        ? parsed.perfil
        : "outro",
      qualificado: score >= 60,
      motivo: String(parsed.motivo ?? ""),
    };
  } catch {
    return { score: 0, perfil: "outro", qualificado: false, motivo: "erro na qualificação" };
  }
}
