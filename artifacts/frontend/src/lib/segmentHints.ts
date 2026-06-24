export interface SegmentHints {
  leadEmpresaPlaceholder: string;
  leadObjetivoPlaceholder: string;
  briefingDemandaPlaceholder: string;
  briefingSegmentoPlaceholder: string;
  briefingNotasPlaceholder: string;
  briefingRespostaPlaceholder: string;
  briefingImpactoPlaceholder: string;
  campanhasNomePlaceholder: string;
  campanhasMensagemPlaceholder: string;
}

const DEFAULT: SegmentHints = {
  leadEmpresaPlaceholder: "Nome da empresa",
  leadObjetivoPlaceholder: "Ex: automatizar atendimento, escalar vendas sem contratar...",
  briefingDemandaPlaceholder: "Ex: quer automatizar atendimento via WhatsApp, reduzir custo com pessoal, escalar vendas...",
  briefingSegmentoPlaceholder: "Ex: varejo alimentar, clínica estética, distribuidora...",
  briefingNotasPlaceholder: "Informações adicionais sobre o lead, contexto do negócio...",
  briefingRespostaPlaceholder: "Resposta obtida na conversa...",
  briefingImpactoPlaceholder: "Ex: R$ 5.000/mês",
  campanhasNomePlaceholder: "Ex: Reativação Q3 2026",
  campanhasMensagemPlaceholder: "Escreva a mensagem que será enviada aos leads…",
};

const HINTS_BY_VERTICAL: Record<string, SegmentHints> = {
  "Construção & Reforma": {
    leadEmpresaPlaceholder: "Nome da construtora / empreiteira",
    leadObjetivoPlaceholder: "Ex: fechar mais orçamentos de obra, reduzir desistências pós-proposta...",
    briefingDemandaPlaceholder: "Ex: quer responder orçamentos mais rápido, acompanhar clientes de reforma, não perder obra para o concorrente...",
    briefingSegmentoPlaceholder: "Ex: construção civil, reforma residencial, pintura, elétrica...",
    briefingNotasPlaceholder: "Tipo de obra, etapa do projeto, perfil do cliente (pessoa física/construtora)...",
    briefingRespostaPlaceholder: "Resposta obtida — ex: 'Estou com 3 orçamentos parados há 2 semanas'...",
    briefingImpactoPlaceholder: "Ex: R$ 15.000 por obra perdida",
    campanhasNomePlaceholder: "Ex: Reativação pós-orçamento — Reforma",
    campanhasMensagemPlaceholder: "Olá, [nome]! Seu orçamento está pronto. Posso te enviar agora pelo WhatsApp?",
  },

  "Varejo de Roupas & Acessórios": {
    leadEmpresaPlaceholder: "Nome da loja / boutique",
    leadObjetivoPlaceholder: "Ex: aumentar retorno de clientes, vender nova coleção via WhatsApp...",
    briefingDemandaPlaceholder: "Ex: quer reativar clientes que sumiram, lançar nova coleção, aumentar ticket médio da loja...",
    briefingSegmentoPlaceholder: "Ex: moda feminina, multimarcas, calçados, acessórios...",
    briefingNotasPlaceholder: "Estilo preferido, tamanho, histórico de compras, datas de aniversário...",
    briefingRespostaPlaceholder: "Resposta — ex: 'Minha cliente compra uma vez e não volta mais'...",
    briefingImpactoPlaceholder: "Ex: R$ 800 por cliente reativado",
    campanhasNomePlaceholder: "Ex: Lançamento coleção inverno 2026",
    campanhasMensagemPlaceholder: "Olá, [nome]! Chegou coleção nova na loja e separei peças no seu estilo 😍 Quer ver?",
  },

  "Supermercado": {
    leadEmpresaPlaceholder: "Nome do supermercado / mercado",
    leadObjetivoPlaceholder: "Ex: aumentar frequência de visitas, reativar clientes inativos...",
    briefingDemandaPlaceholder: "Ex: quer avisar promoções semanais, recuperar clientes que pararam de vir, aumentar ticket médio...",
    briefingSegmentoPlaceholder: "Ex: supermercado de bairro, atacarejo, mercearia, hortifrúti...",
    briefingNotasPlaceholder: "Produtos preferidos, frequência de compra, última visita, perfil de consumo...",
    briefingRespostaPlaceholder: "Resposta — ex: 'O cliente veio 3x e parou de aparecer'...",
    briefingImpactoPlaceholder: "Ex: R$ 200/mês por cliente reativado",
    campanhasNomePlaceholder: "Ex: Promoção do fim de semana",
    campanhasMensagemPlaceholder: "Olá, [nome]! Esta semana no mercado: promoções imperdíveis. Vem conferir? 🛒",
  },

  "Varejo físico": {
    leadEmpresaPlaceholder: "Nome da loja / estabelecimento",
    leadObjetivoPlaceholder: "Ex: aumentar retorno de clientes, vender estoque parado...",
    briefingDemandaPlaceholder: "Ex: quer trazer clientes de volta, avisar promoções, aumentar frequência de visitas...",
    briefingSegmentoPlaceholder: "Ex: loja de eletrônicos, pet shop, papelaria, farmácia...",
    briefingNotasPlaceholder: "Histórico de compras, produtos preferidos, datas especiais do cliente...",
    briefingRespostaPlaceholder: "Resposta — ex: 'Tenho clientes que compraram uma vez e nunca mais voltaram'...",
    briefingImpactoPlaceholder: "Ex: R$ 500 por cliente reativado",
    campanhasNomePlaceholder: "Ex: Promoção de liquidação",
    campanhasMensagemPlaceholder: "Olá, [nome]! Temos uma oferta especial para você essa semana. Vem conferir!",
  },

  "Saúde e Bem-estar": {
    leadEmpresaPlaceholder: "Nome da clínica / consultório / estúdio",
    leadObjetivoPlaceholder: "Ex: agendar consultas, reativar pacientes, vender pacotes de tratamento...",
    briefingDemandaPlaceholder: "Ex: quer automatizar agendamentos, reativar pacientes inativos, reduzir faltas e cancelamentos...",
    briefingSegmentoPlaceholder: "Ex: clínica estética, consultório odontológico, academia, spa...",
    briefingNotasPlaceholder: "Tratamentos de interesse, histórico de consultas, frequência de retorno, datas importantes...",
    briefingRespostaPlaceholder: "Resposta — ex: 'Pacientes fazem a consulta e nunca voltam para o retorno'...",
    briefingImpactoPlaceholder: "Ex: R$ 300 por paciente reativado",
    campanhasNomePlaceholder: "Ex: Reativação pacientes inativos — 90 dias",
    campanhasMensagemPlaceholder: "Olá, [nome]! Está na hora do seu retorno. Vamos agendar para essa semana?",
  },

  "Serviços B2B": {
    leadEmpresaPlaceholder: "Nome da empresa / CNPJ",
    leadObjetivoPlaceholder: "Ex: fechar contrato de serviço, apresentar proposta, marcar reunião de diagnóstico...",
    briefingDemandaPlaceholder: "Ex: quer escalar prospecção B2B, reduzir ciclo de venda, melhorar follow-up com decisores...",
    briefingSegmentoPlaceholder: "Ex: consultoria, TI, contabilidade, marketing, jurídico...",
    briefingNotasPlaceholder: "Setor, porte da empresa, cargo do decisor, dores identificadas, histórico de interações...",
    briefingRespostaPlaceholder: "Resposta — ex: 'Já enviamos proposta há 2 semanas e o prospect sumiu'...",
    briefingImpactoPlaceholder: "Ex: R$ 20.000 por contrato perdido",
    campanhasNomePlaceholder: "Ex: Prospecção ativa Q3 2026",
    campanhasMensagemPlaceholder: "Olá, [nome]! Gostaria de apresentar uma proposta rápida para [empresa]. Posso ligar hoje?",
  },

  "Serviços B2C": {
    leadEmpresaPlaceholder: "Nome do prestador / empresa",
    leadObjetivoPlaceholder: "Ex: fechar mais serviços, reativar clientes que sumiram...",
    briefingDemandaPlaceholder: "Ex: quer automatizar follow-up de orçamentos, reduzir clientes que pedem e desaparecem...",
    briefingSegmentoPlaceholder: "Ex: salão de beleza, auto center, dedetizadora, fotógrafo...",
    briefingNotasPlaceholder: "Serviço de interesse, frequência de visitas, última visita, preferências do cliente...",
    briefingRespostaPlaceholder: "Resposta — ex: 'Cliente pede orçamento e não responde mais'...",
    briefingImpactoPlaceholder: "Ex: R$ 250 por serviço recuperado",
    campanhasNomePlaceholder: "Ex: Reativação clientes inativos",
    campanhasMensagemPlaceholder: "Olá, [nome]! Faz tempo que não nos vemos. Quer agendar um horário?",
  },

  "Alimentação / Restaurante": {
    leadEmpresaPlaceholder: "Nome do restaurante / lanchonete",
    leadObjetivoPlaceholder: "Ex: aumentar pedidos recorrentes, lançar cardápio novo, reativar clientes...",
    briefingDemandaPlaceholder: "Ex: quer avisar promoções, recuperar clientes que pararam de pedir, aumentar ticket médio...",
    briefingSegmentoPlaceholder: "Ex: restaurante, hamburgueria, pizzaria, marmitaria...",
    briefingNotasPlaceholder: "Preferências alimentares, frequência de pedidos, última visita, restrições alimentares...",
    briefingRespostaPlaceholder: "Resposta — ex: 'Clientes pedem uma vez e não voltam mais'...",
    briefingImpactoPlaceholder: "Ex: R$ 150 por cliente reativado",
    campanhasNomePlaceholder: "Ex: Promoção do almoço — semana",
    campanhasMensagemPlaceholder: "Olá, [nome]! Hoje tem prato especial no cardápio. Bora pedir? 🍽️",
  },

  "Educação": {
    leadEmpresaPlaceholder: "Nome da escola / curso / plataforma",
    leadObjetivoPlaceholder: "Ex: matricular alunos, reter alunos na renovação, vender novos cursos...",
    briefingDemandaPlaceholder: "Ex: quer automatizar comunicação com leads de matrícula, reativar alunos desistentes...",
    briefingSegmentoPlaceholder: "Ex: escola de idiomas, curso técnico, plataforma EAD, reforço escolar...",
    briefingNotasPlaceholder: "Área de interesse, nível de ensino, histórico de contato, objeções frequentes...",
    briefingRespostaPlaceholder: "Resposta — ex: 'Leads entram em contato e somem antes de matricular'...",
    briefingImpactoPlaceholder: "Ex: R$ 800 por matrícula perdida",
    campanhasNomePlaceholder: "Ex: Abertura de turmas — agosto 2026",
    campanhasMensagemPlaceholder: "Olá, [nome]! Turmas novas abertas. Ainda dá tempo de garantir sua vaga! Posso te ajudar?",
  },
};

export function getSegmentHints(vertical: string | null | undefined): SegmentHints {
  if (!vertical) return DEFAULT;
  return HINTS_BY_VERTICAL[vertical] ?? DEFAULT;
}
