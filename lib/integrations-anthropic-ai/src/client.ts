import Anthropic from "@anthropic-ai/sdk";

// Prefere a chave direta da Anthropic (ANTHROPIC_API_KEY, já usada em
// proposal-engine.ts e site_generator.ts) em vez da integração antiga do
// Replit (AI_INTEGRATIONS_ANTHROPIC_API_KEY + BASE_URL própria) — essa
// última é a que fica sem crédito ("Your credit balance is too low") desde
// a migração pro Railway, porque ainda passa pelo proxy do Replit. Só cai
// pra legada se ANTHROPIC_API_KEY não estiver configurada.
const directApiKey = process.env.ANTHROPIC_API_KEY;
const legacyApiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
const legacyBaseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;

if (!directApiKey && !legacyApiKey) {
  throw new Error(
    "ANTHROPIC_API_KEY (ou, como legado, AI_INTEGRATIONS_ANTHROPIC_API_KEY) precisa estar definida.",
  );
}

export const anthropic = directApiKey
  ? new Anthropic({ apiKey: directApiKey })
  : new Anthropic({ apiKey: legacyApiKey!, baseURL: legacyBaseUrl });
