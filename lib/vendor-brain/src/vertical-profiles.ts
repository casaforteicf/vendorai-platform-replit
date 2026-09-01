import { resolveMarketingVertical } from './marketing-verticals'

export interface BrainVerticalProfile {
  key: string
  label: string
  icon: string
  focus: string
  customer: string
  operation: string
  offer: string
  goals: string[]
}

const PROFILES: BrainVerticalProfile[] = [
  { key:'construction', label:'Construção e projetos', icon:'🏗️', focus:'obra, orçamento, prazo e materiais', customer:'cliente da obra', operation:'projeto ou obra', offer:'materiais e serviços', goals:['Criar projeto com briefing, orçamento e cronograma','Criar proposta comercial com materiais e serviços','Comprar materiais comparando fornecedores e prazos','Analisar projeto e riscos de atraso da obra','Criar campanha para captar novos projetos'] },
  { key:'retail', label:'Varejo', icon:'🛍️', focus:'vendas, margem, estoque e recompra', customer:'cliente da loja', operation:'venda e estoque', offer:'produtos e coleções', goals:['Analisar vendas, margem e produtos parados','Criar campanha para clientes sem comprar há 45 dias','Comprar produtos com estoque abaixo do mínimo','Criar proposta para uma venda corporativa','Criar workflow de reposição e promoção de estoque'] },
  { key:'supermarket', label:'Supermercado', icon:'🛒', focus:'giro, ruptura, validade e ofertas', customer:'consumidor', operation:'loja e abastecimento', offer:'produtos e ofertas', goals:['Analisar rupturas, validade e giro do estoque','Criar campanha de ofertas da semana','Comprar itens abaixo do estoque mínimo','Criar relatório de margem por categoria','Criar workflow para reposição automática'] },
  { key:'beauty', label:'Beleza e bem-estar', icon:'✨', focus:'agenda, recorrência, profissionais e serviços', customer:'cliente', operation:'agenda e atendimento', offer:'serviços e produtos', goals:['Analisar horários ociosos e taxa de retorno','Criar campanha para clientes inativos','Agendar clientes na melhor janela disponível','Criar proposta de pacote recorrente de serviços','Criar workflow de confirmação e pós-atendimento'] },
  { key:'clinic', label:'Clínica e saúde', icon:'🩺', focus:'agenda, pacientes, retornos e conformidade', customer:'paciente', operation:'consulta e prontuário', offer:'consultas e procedimentos', goals:['Analisar agenda, faltas e retornos pendentes','Criar campanha de prevenção para pacientes elegíveis','Agendar retorno respeitando especialidade e convênio','Criar relatório operacional da clínica','Criar workflow de confirmação e acompanhamento'] },
  { key:'restaurant', label:'Restaurante', icon:'🍽️', focus:'pedidos, CMV, cardápio e recorrência', customer:'cliente', operation:'cozinha e atendimento', offer:'pratos e experiências', goals:['Analisar CMV, vendas e itens mais rentáveis','Criar campanha para movimento em horário ocioso','Comprar insumos considerando consumo e validade','Criar relatório de desempenho do cardápio','Criar workflow do pedido até a entrega'] },
  { key:'realestate', label:'Imóveis', icon:'🏠', focus:'carteira, leads, visitas e propostas', customer:'interessado', operation:'captação e negociação', offer:'imóveis', goals:['Analisar imóveis com baixa procura e leads compatíveis','Criar campanha para captar compradores qualificados','Agendar visitas agrupadas por região','Criar proposta comercial para um imóvel','Criar workflow do lead até o fechamento'] },
  { key:'automotive', label:'Veículos', icon:'🚗', focus:'estoque, leads, avaliação e test-drive', customer:'comprador', operation:'estoque e negociação', offer:'veículos e serviços', goals:['Analisar veículos parados e oportunidades de preço','Criar campanha para leads por faixa de veículo','Agendar test-drives com vendedores disponíveis','Criar proposta com entrada e financiamento','Criar workflow da avaliação até a entrega'] },
  { key:'logistics', label:'Fretes e logística', icon:'🚚', focus:'coletas, rotas, capacidade e entregas', customer:'embarcador ou destinatário', operation:'rota e entrega', offer:'fretes e capacidade', goals:['Analisar entregas pendentes e capacidade da frota','Criar workflow de coleta, rota e confirmação','Agendar coletas agrupadas por região','Criar proposta de frete com prazo e custo','Gerar relatório de SLA e ocorrências'] },
  { key:'travel', label:'Viagens e hotelaria', icon:'🏨', focus:'ocupação, reservas, diária e experiência', customer:'hóspede ou viajante', operation:'reserva e hospedagem', offer:'diárias e experiências', goals:['Analisar ocupação, diária média e períodos ociosos','Criar campanha para preencher datas disponíveis','Criar proposta de pacote de viagem ou hospedagem','Agendar serviços e experiências da reserva','Criar workflow da reserva ao pós-estadia'] },
]

const FALLBACK: BrainVerticalProfile = { key:'business', label:'Gestão do negócio', icon:'🏢', focus:'vendas, clientes, operação e resultado', customer:'cliente', operation:'operação', offer:'produtos e serviços', goals:['Analisar oportunidades comerciais prioritárias','Criar campanha para reativar clientes','Criar proposta comercial com preços e condições','Comprar itens necessários para a operação','Criar workflow da venda ao pós-venda'] }

function normalized(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function fromOfficialMarketingVertical(vertical: string): BrainVerticalProfile | undefined {
  const marketing = resolveMarketingVertical(vertical)
  if (!marketing) return undefined
  return {
    key: marketing.id,
    label: marketing.name,
    icon: marketing.macrosegment === 'clinics' ? '🩺'
      : marketing.macrosegment === 'dealerships' ? '🚗'
      : marketing.macrosegment === 'distributors' ? '📦'
      : marketing.macrosegment === 'industries' ? '🏭'
      : marketing.macrosegment === 'services' ? '💼'
      : '🛍️',
    focus: marketing.corePain,
    customer: marketing.audience === 'B2B' ? 'conta ou empresa cliente' : 'cliente',
    operation: marketing.journey.join(' → '),
    offer: marketing.promise,
    goals: [
      `Executar jornada: ${marketing.journey.join(' → ')}`,
      `Criar campanha orientada à receita para ${marketing.name}`,
      `Acompanhar KPIs: ${marketing.kpis.join(', ')}`,
      `Executar Revenue Scout com sinais: ${marketing.revenueScout.signals.join(', ')}`,
      'Relacionar campanha, oportunidade, venda e receita',
    ],
  }
}

export function resolveBrainVerticalProfile(vertical?: string | null): BrainVerticalProfile {
  const raw = vertical ?? ''
  const official = fromOfficialMarketingVertical(raw)
  if (official) return official

  const value = normalized(raw)
  if (/construcao|reforma|arquitet|engenharia/.test(value)) return PROFILES[0]
  if (/supermercado|mercado|mercearia/.test(value)) return PROFILES[2]
  if (/salao|barbearia|beleza|estetica/.test(value)) return PROFILES[3]
  if (/clinica|saude|odonto|medic/.test(value)) return PROFILES[4]
  if (/restaurante|alimentacao|gastronomia/.test(value)) return PROFILES[5]
  if (/imove|imobiliaria/.test(value)) return PROFILES[6]
  if (/veiculo|automotivo|concessionaria/.test(value)) return PROFILES[7]
  if (/frete|logistica|transport/.test(value)) return PROFILES[8]
  if (/viagem|hotel|turismo|pousada/.test(value)) return PROFILES[9]
  if (/varejo|roupa|eletron|decoracao|bebe|esporte|papelaria|joia|calcado|moveis|brinquedo|instrumento|perfumaria|floricultura|adega|pet shop|farmacia/.test(value)) return PROFILES[1]
  return FALLBACK
}
