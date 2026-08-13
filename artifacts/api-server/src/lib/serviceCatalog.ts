export const SERVICE_CATALOG = {
  "Casa e construção": ["Eletricista", "Encanador", "Pedreiro", "Pintor", "Gesseiro", "Marceneiro", "Serralheiro", "Vidraceiro", "Instalação de pisos e revestimentos", "Impermeabilização", "Instalação de esquadrias", "Manutenção de piscinas", "Jardinagem e paisagismo", "Limpeza pós-obra", "Projeto de arquitetura", "Projeto de engenharia", "Vistoria e laudo técnico"],
  "Manutenção e assistência": ["Manutenção de ar-condicionado", "Refrigeração", "Assistência de eletrodomésticos", "Assistência de computadores e notebooks", "Assistência de celulares", "Instalação de câmeras e alarmes", "Manutenção de energia solar", "Manutenção de portões eletrônicos", "Dedetização", "Chaveiro", "Pequenos reparos"],
  Automotivo: ["Mecânica", "Elétrica automotiva", "Troca de óleo", "Pneus e alinhamento", "Funilaria e pintura", "Higienização e estética automotiva", "Guincho", "Inspeção veicular", "Instalação de acessórios", "Despachante veicular", "Locação de veículos"],
  "Saúde e beleza": ["Cabeleireiro", "Barbearia", "Manicure e pedicure", "Maquiagem", "Estética facial e corporal", "Massagem", "Depilação", "Fisioterapia", "Psicologia", "Nutrição", "Odontologia", "Atendimento domiciliar", "Exames e consultas", "Veterinário e pet care"],
  "Serviços profissionais": ["Contabilidade", "Advocacia", "Marketing", "Design", "Fotografia e vídeo", "Desenvolvimento de sites", "Suporte de informática", "Consultoria empresarial", "Seguros", "Crédito e financiamento", "Despachante", "Tradução"],
  "Eventos e lazer": ["Buffet", "Decoração de eventos", "Fotografia de eventos", "DJ e músicos", "Locação de equipamentos", "Espaço para eventos", "Recreação infantil", "Passeios e experiências", "Guia turístico", "Ingressos e reservas"],
  Logística: ["Frete urbano", "Motoboy", "Entrega expressa", "Mudanças", "Transporte de cargas", "Coleta programada", "Armazenagem", "Montagem e desmontagem", "Rastreamento", "Logística reversa"],
  Imóveis: ["Corretagem", "Avaliação de imóvel", "Fotografia imobiliária", "Vistoria de imóvel", "Administração de imóveis", "Limpeza e preparação do imóvel", "Mudança residencial", "Financiamento imobiliário", "Seguro residencial", "Registro e documentação"],
  "Viagens e hotelaria": ["Hospedagem", "Reserva de quartos", "Pacote turístico", "Passagens", "Transfer", "Aluguel de veículos para viagem", "Passeio turístico", "Guia de viagem", "Seguro-viagem", "Experiência gastronômica"],
} as const;

export const SERVICE_TEMPLATES = Object.entries(SERVICE_CATALOG).flatMap(([categoria, nomes]) =>
  nomes.map((nome) => ({
    categoria, nome,
    especialidade: nome.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 80),
    descricao: `${nome} com atendimento local, orçamento e acompanhamento pelo Vendor.ai.`,
    requerVisitaTecnica: !["Hospedagem", "Reserva de quartos", "Passagens", "Ingressos e reservas"].includes(nome),
  })),
);
