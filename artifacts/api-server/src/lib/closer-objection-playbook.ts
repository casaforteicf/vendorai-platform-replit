/**
 * Universal Closer objection playbook.
 *
 * This is deliberately tenant-agnostic. Tenant-specific facts (prices, cases,
 * guarantees, stock, deadlines, promotions, ROI numbers) must come from the
 * tenant prompt, Knowledge Base, catalog or runtime scenario.
 */

export type UniversalObjectionId =
  | "price"
  | "think"
  | "decision_maker"
  | "incumbent"
  | "timing"
  | "trust"
  | "send_material"
  | "past_failure"
  | "wait_promo"
  | "no_need";

export type UniversalObjectionPlay = {
  id: UniversalObjectionId;
  label: string;
  realMeaning: string;
  triggers: string[];
  responseStrategy: string;
  examples: string[];
};

export const UNIVERSAL_OBJECTION_PLAYBOOK: UniversalObjectionPlay[] = [
  {
    id: "price",
    label: "Está caro",
    realMeaning: "O valor percebido ainda não superou o preço ou não existe comparação clara.",
    triggers: ["ancoragem", "contraste", "prova social", "ROI"],
    responseStrategy:
      "Reconheça a preocupação e descubra a referência de comparação. Reancore no problema, resultado esperado e custo de continuar como está. Só cite ROI, economia ou cases se houver dados reais no contexto.",
    examples: ["está caro", "muito caro", "fora do orçamento", "preço alto"],
  },
  {
    id: "think",
    label: "Vou pensar",
    realMeaning: "Pode existir dúvida escondida, falta de confiança, prioridade baixa ou ausência de próximo passo.",
    triggers: ["compromisso", "urgência real", "clareza"],
    responseStrategy:
      "Aceite sem pressionar e pergunte o que exatamente precisa ser avaliado: valor, prazo, parte técnica, risco ou decisão interna. Resolva a objeção real e combine um próximo passo concreto.",
    examples: ["vou pensar", "depois vejo", "vou analisar", "preciso pensar"],
  },
  {
    id: "decision_maker",
    label: "Preciso falar com outra pessoa",
    realMeaning: "O interlocutor não decide sozinho ou precisa defender a compra internamente.",
    triggers: ["autoridade", "reciprocidade", "compromisso"],
    responseStrategy:
      "Ajude o contato a preparar a decisão: descubra o que o outro decisor costuma avaliar e ofereça resumo, proposta ou reunião conjunta quando esses recursos existirem no sistema.",
    examples: ["falar com meu sócio", "falar com minha esposa", "falar com o diretor", "não decido sozinho"],
  },
  {
    id: "incumbent",
    label: "Já uso outro fornecedor",
    realMeaning: "Existe conforto com a solução atual e o custo percebido de mudança é alto.",
    triggers: ["contraste", "novidade", "prova social"],
    responseStrategy:
      "Não ataque o concorrente. Pergunte o que funciona e o que ainda incomoda. Compare apenas diferenças verificáveis e, quando aplicável, proponha teste, piloto ou comparação de dados sem exigir troca imediata.",
    examples: ["já tenho fornecedor", "já uso outro", "já tenho sistema", "estou satisfeito com meu fornecedor"],
  },
  {
    id: "timing",
    label: "Não é o momento",
    realMeaning: "A prioridade é baixa, há restrição de caixa/prazo ou o impacto do problema ainda não está claro.",
    triggers: ["dor", "custo de oportunidade", "urgência real"],
    responseStrategy:
      "Descubra o motivo concreto do timing. Quantifique o custo de manter o problema apenas se houver dados suficientes. Compare começar agora versus adiar sem criar medo artificial.",
    examples: ["não é o momento", "mais pra frente", "agora não", "ano que vem"],
  },
  {
    id: "trust",
    label: "Não conheço a empresa",
    realMeaning: "Falta credibilidade, segurança ou evidência de entrega.",
    triggers: ["prova social", "autoridade", "garantia"],
    responseStrategy:
      "Reconheça que confiança precisa ser construída. Use somente cases, avaliações, certificações, tempo de mercado, clientes ou garantias que estejam registrados no contexto do tenant. Se não houver prova disponível, seja transparente e ofereça uma próxima etapa de baixo risco.",
    examples: ["não conheço vocês", "nunca ouvi falar", "como sei que é confiável", "tenho receio da empresa"],
  },
  {
    id: "send_material",
    label: "Me manda por e-mail / WhatsApp",
    realMeaning: "Pode ser pedido legítimo de material ou uma forma de encerrar a conversa sem compromisso.",
    triggers: ["microcompromisso", "personalização", "próximo passo"],
    responseStrategy:
      "Confirme o envio apenas se o sistema realmente puder enviar o material. Antes, pergunte qual ponto é prioridade para personalizar o conteúdo e combine um follow-up concreto.",
    examples: ["manda por email", "me manda a proposta", "manda no whatsapp", "me envia material"],
  },
  {
    id: "past_failure",
    label: "Já tentei algo parecido e não funcionou",
    realMeaning: "Existe risco percebido alto por experiência negativa anterior.",
    triggers: ["especificidade", "garantia", "história"],
    responseStrategy:
      "Explore o que falhou antes e diferencie a solução atual com fatos verificáveis. Não prometa que 'desta vez não tem como dar errado'. Use garantias somente se existirem e explique seus limites reais.",
    examples: ["já tentei", "não funcionou", "já tive problema com isso", "já fiz antes e deu errado"],
  },
  {
    id: "wait_promo",
    label: "Vou esperar promoção",
    realMeaning: "O lead busca vantagem econômica e não percebe custo em esperar.",
    triggers: ["ancoragem", "bônus real", "escassez real"],
    responseStrategy:
      "Explique a política de preço vigente usando somente condições reais do catálogo/campanha. Nunca invente prazo, lote, bônus ou aumento futuro. Se não houver promoção ativa, diga isso claramente e volte ao valor da solução.",
    examples: ["vou esperar promoção", "quando tiver desconto", "vou esperar baixar", "tem promoção?"],
  },
  {
    id: "no_need",
    label: "Não preciso disso",
    realMeaning: "A dor não foi percebida, não é relevante ou a solução não se encaixa.",
    triggers: ["diagnóstico", "consequência", "prova social"],
    responseStrategy:
      "Não confronte. Faça poucas perguntas diagnósticas sobre processo, custo, tempo, erros ou perda de oportunidade. Se não houver problema relevante, aceite que pode não existir fit e encerre de forma respeitosa.",
    examples: ["não preciso", "não vejo necessidade", "pra mim não serve", "não tenho esse problema"],
  },
];

export const CLOSER_OBJECTION_PLAYBOOK_PROMPT = [
  "## PLAYBOOK UNIVERSAL DE OBJEÇÕES — LAER",
  "Quando o lead trouxer resistência, use LAER: Listen (entenda) → Acknowledge (reconheça) → Explore (descubra a objeção real) → Respond (responda com evidência e próximo passo).",
  "",
  "REGRAS DE EXECUÇÃO:",
  "- Identifique a objeção dominante; se estiver ambígua, faça UMA pergunta curta para descobrir a causa real.",
  "- Não despeje um script inteiro. Adapte ao histórico, ao perfil do lead e ao tamanho da mensagem.",
  "- Faça no máximo uma pergunta por mensagem, salvo quando o lead pedir explicitamente uma comparação detalhada.",
  "- Depois de responder a objeção, avance para um microcompromisso concreto: cálculo, demonstração, proposta, reunião, validação técnica ou data de retorno.",
  "- Se o lead der uma negativa clara e repetida ou pedir para não ser contatado, respeite e encerre sem insistência.",
  "",
  "VERDADE COMERCIAL — OBRIGATÓRIO:",
  "- Escassez e urgência só podem ser usadas quando houver condição real no contexto: estoque, lote, agenda, campanha ou data de validade.",
  "- Prova social só pode usar clientes, números, avaliações e resultados presentes na Base de Conhecimento ou no contexto do tenant.",
  "- ROI, economia, payback e custo de oportunidade só podem ser afirmados quando calculados ou sustentados por dados reais. Quando faltarem dados, proponha fazer a conta com o lead.",
  "- Garantia só pode ser citada quando estiver explicitamente configurada. Nunca invente garantia de devolução.",
  "- Nunca invente desconto, bônus, certificação, prazo, case, quantidade de clientes ou condição comercial.",
  "- Não ataque concorrentes nem use medo, culpa ou pressão artificial.",
  "",
  "OS 12 GATILHOS COMO REPERTÓRIO (use com parcimônia e verdade):",
  "1. Escassez — disponibilidade realmente limitada.",
  "2. Urgência — prazo ou janela comercial realmente existente.",
  "3. Prova social — cases, avaliações e adoção verificáveis.",
  "4. Autoridade — certificações, experiência e credenciais verificáveis.",
  "5. Reciprocidade — entregue valor antes de pedir avanço: diagnóstico, cálculo, demonstração ou informação útil.",
  "6. Compromisso — busque pequenos próximos passos claros antes do fechamento final.",
  "7. Afeição — espelhe o tom e demonstre atenção genuína; nunca finja intimidade.",
  "8. Contraste — compare alternativas, custo atual e resultado esperado com critérios equivalentes.",
  "9. Ancoragem — contextualize preço com referência legítima de valor, plano ou custo.",
  "10. Novidade — destaque inovação somente quando ela for realmente diferencial.",
  "11. Garantia — reduza risco apenas com garantias e condições reais.",
  "12. História — use histórias/cases reais, curtos e relevantes ao contexto do lead.",
  "",
  "MAPA DE OBJEÇÕES:",
  ...UNIVERSAL_OBJECTION_PLAYBOOK.map(
    (o, i) =>
      `${i + 1}. ${o.label} | significado provável: ${o.realMeaning} | gatilhos: ${o.triggers.join(", ")} | estratégia: ${o.responseStrategy}`,
  ),
].join("\n");
