import { getAdsOverview } from './adCampaignIntelligence';
import { buildMarketingDecisionStrategyLearningBlock } from './marketingDecisionStrategyLearning.js';
import { buildCampaignAbLearningPromptBlock } from './campaignAbLearning.js';

type CampaignLearningRow = {
  campaignId?: string;
  label?: string;
  plataforma?: string;
  spend?: number;
  clicks?: number;
  leads?: number;
  trials?: number;
  activatedTrials?: number;
  sales?: number;
  revenue?: number;
  roas?: number | null;
  costPerLead?: number | null;
  costPerSale?: number | null;
  recommendation?: { title?: string; reason?: string; action?: string } | null;
  diagnosis?: { stage?: string; title?: string; evidence?: string; action?: string } | null;
};

function extractCampaignRows(overview: unknown): CampaignLearningRow[] {
  if (Array.isArray(overview)) return overview as CampaignLearningRow[];
  if (!overview || typeof overview !== 'object') return [];
  const record = overview as Record<string, unknown>;
  for (const key of ['campaigns', 'rows', 'items']) {
    const value = record[key];
    if (Array.isArray(value)) return value as CampaignLearningRow[];
  }
  return [];
}

function campaignEvidence(row: CampaignLearningRow): string {
  return [
    row.label || row.campaignId || 'campanha',
    row.plataforma ? `canal ${row.plataforma}` : null,
    `gasto R$ ${Number(row.spend ?? 0).toFixed(2)}`,
    `${Number(row.clicks ?? 0)} clique(s)`,
    `${Number(row.leads ?? 0)} lead(s)`,
    `${Number(row.sales ?? 0)} venda(s)`,
    `receita R$ ${Number(row.revenue ?? 0).toFixed(2)}`,
    typeof row.roas === 'number' ? `ROAS ${row.roas.toFixed(2)}x` : null,
  ].filter(Boolean).join(' · ');
}

function creativeExecutionRule(decisionLearning: string): string {
  if (!decisionLearning) return '';
  return `\n## Regra de aplicação do aprendizado na criação\nAo gerar a próxima peça, use a memória de decisões como evidência comercial, não como receita fixa. Quando houver padrão positivo recorrente, preserve a lógica que provavelmente contribuiu para o resultado e crie variações coerentes de gancho, promessa, oferta, prova, formato e CTA para o mesmo objetivo/canal. Quando houver padrão negativo recorrente, reformule esses elementos antes de repetir a combinação. Nunca atribua venda a uma palavra, cor, CTA ou criativo específico se os dados não isolarem essa causa; transforme a evidência em hipótese testável. Casos isolados ou inconclusivos devem gerar exploração controlada, não regra.\n`;
}

export async function buildPaidMediaLearningPromptBlock(tenantId: string): Promise<string> {
  const [overview, decisionLearning, abLearning] = await Promise.all([
    getAdsOverview(tenantId),
    buildMarketingDecisionStrategyLearningBlock(tenantId).catch(() => ''),
    buildCampaignAbLearningPromptBlock(tenantId).catch(() => ''),
  ]);
  const rows = extractCampaignRows(overview)
    .filter((row) => Number(row.spend ?? 0) > 0 || Number(row.clicks ?? 0) > 0 || Number(row.leads ?? 0) > 0 || Number(row.sales ?? 0) > 0);

  const decisionCreativeBlock = decisionLearning + creativeExecutionRule(decisionLearning) + abLearning;
  if (rows.length === 0) return decisionCreativeBlock;

  const winners = rows
    .filter((row) => Number(row.sales ?? 0) >= 2 && typeof row.roas === 'number' && row.roas >= 3)
    .sort((a, b) => Number(b.roas ?? 0) - Number(a.roas ?? 0))
    .slice(0, 3);

  const acquisitionProblems = rows
    .filter((row) => Number(row.spend ?? 0) > 0 && Number(row.leads ?? 0) === 0)
    .sort((a, b) => Number(b.spend ?? 0) - Number(a.spend ?? 0))
    .slice(0, 3);

  const destinationProblems = rows
    .filter((row) => Number(row.clicks ?? 0) >= 30 && Number(row.leads ?? 0) === 0)
    .sort((a, b) => Number(b.clicks ?? 0) - Number(a.clicks ?? 0))
    .slice(0, 3);

  const conversionProblems = rows
    .filter((row) => Number(row.leads ?? 0) >= 5 && Number(row.sales ?? 0) === 0)
    .sort((a, b) => Number(b.leads ?? 0) - Number(a.leads ?? 0))
    .slice(0, 3);

  const learned: string[] = [];
  if (winners.length) {
    learned.push(`Padrões vencedores com venda/ROAS comprovados: ${winners.map(campaignEvidence).join(' | ')}. Preserve oferta, promessa, canal e aderência anúncio→destino; qualquer escala continua sujeita ao orçamento aprovado.`);
  }
  if (destinationProblems.length) {
    learned.push(`Gargalo anúncio→destino: ${destinationProblems.map(campaignEvidence).join(' | ')}. Há volume de clique sem lead; revisar correspondência entre anúncio e LP, CTA, prova de valor e fricção do formulário antes de aumentar mídia.`);
  } else if (acquisitionProblems.length) {
    learned.push(`Gargalo de aquisição/segmentação: ${acquisitionProblems.map(campaignEvidence).join(' | ')}. Houve gasto sem lead atribuído; testar público, intenção, palavra-chave, criativo e oferta antes de repetir o padrão.`);
  }
  if (conversionProblems.length) {
    learned.push(`Gargalo pós-lead: ${conversionProblems.map(campaignEvidence).join(' | ')}. Há leads sem venda; não culpar automaticamente o criativo. Revisar qualidade do lead, atendimento, follow-up, objeções e oferta comercial.`);
  }

  const recommended = rows
    .filter((row) => row.recommendation?.reason)
    .slice(0, 3)
    .map((row) => `${row.label || row.campaignId}: ${row.recommendation?.reason}`);
  if (recommended.length) learned.push(`Diagnósticos já calculados pelo Ads Intelligence: ${recommended.join(' | ')}.`);

  if (learned.length === 0) {
    return `\n## Aprendizado de mídia paga do próprio tenant\nExistem ${rows.length} campanha(s) com dados, mas ainda não há evidência suficiente de vencedor ou gargalo recorrente. Não generalizar por CTR/CPL isolado; continuar coletando cliques, leads, vendas, receita e ROAS.\n${decisionCreativeBlock}`;
  }

  return `\n## Aprendizado de mídia paga do próprio tenant (dados reais de Ads + CRM)\n${learned.join('\n')}\n${decisionCreativeBlock}`;
}
