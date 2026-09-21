export type StandardCompositionItem = {
  codigo: string;
  nome: string;
  unidade: string;
  tipo: "material" | "mao_de_obra" | "equipamento" | "servico";
  categoria: string;
  quantidade: string;
};

export type StandardConstructionComposition = {
  codigo: string;
  nome: string;
  descricao: string;
  unidade: string;
  etapaKey:
    | "estrutura"
    | "hidraulica"
    | "eletrica"
    | "esquadrias"
    | "revestimentos"
    | "forros_pintura"
    | "acabamentos"
    | "areas_externas";
  sistemasConstrutivos: Array<"icf" | "alvenaria" | "steel_frame" | "wood_frame" | "madeira" | "concreto" | "outro">;
  comumTodosSistemas: boolean;
  ordem: number;
  itens: StandardCompositionItem[];
};

/**
 * Catálogo-base do Arqdor para orçamento e composição de custos.
 *
 * Os coeficientes são referências iniciais editáveis, não substituem projeto,
 * memorial, especificação do fabricante ou levantamento quantitativo da obra.
 * Nenhum preço é gravado aqui: os preços vêm exclusivamente da Tabela Mestre
 * de Insumos do tenant.
 */
export const STANDARD_CONSTRUCTION_COMPOSITIONS: StandardConstructionComposition[] = [
  {
    codigo: "ARQ-REV-001",
    nome: "Porcelanato em piso",
    descricao: "Composição referencial por m² para assentamento de porcelanato em piso, incluindo perdas, argamassa, rejunte e mão de obra.",
    unidade: "m²",
    etapaKey: "revestimentos",
    sistemasConstrutivos: [],
    comumTodosSistemas: true,
    ordem: 10,
    itens: [
      { codigo: "ARQ-MAT-PORC", nome: "Porcelanato", unidade: "m²", tipo: "material", categoria: "Revestimentos", quantidade: "1.10" },
      { codigo: "ARQ-MAT-ARGAC3", nome: "Argamassa colante ACIII", unidade: "kg", tipo: "material", categoria: "Argamassas", quantidade: "5.00" },
      { codigo: "ARQ-MAT-REJUNTE", nome: "Rejunte para porcelanato", unidade: "kg", tipo: "material", categoria: "Revestimentos", quantidade: "0.25" },
      { codigo: "ARQ-MO-PORC", nome: "Mão de obra assentamento de porcelanato", unidade: "m²", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "1.00" },
    ],
  },
  {
    codigo: "ARQ-REV-002",
    nome: "Revestimento cerâmico/porcelanato em parede",
    descricao: "Composição referencial por m² para revestimento de paredes com cerâmica ou porcelanato.",
    unidade: "m²",
    etapaKey: "revestimentos",
    sistemasConstrutivos: [],
    comumTodosSistemas: true,
    ordem: 20,
    itens: [
      { codigo: "ARQ-MAT-REVPAR", nome: "Revestimento de parede", unidade: "m²", tipo: "material", categoria: "Revestimentos", quantidade: "1.10" },
      { codigo: "ARQ-MAT-ARGAC3", nome: "Argamassa colante ACIII", unidade: "kg", tipo: "material", categoria: "Argamassas", quantidade: "5.00" },
      { codigo: "ARQ-MAT-REJUNTE", nome: "Rejunte para porcelanato", unidade: "kg", tipo: "material", categoria: "Revestimentos", quantidade: "0.30" },
      { codigo: "ARQ-MO-REVPAR", nome: "Mão de obra revestimento de parede", unidade: "m²", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "1.00" },
    ],
  },
  {
    codigo: "ARQ-REV-003",
    nome: "Basecoat sobre ICF/EPS",
    descricao: "Composição referencial por m² para camada armada com basecoat, tela e acessórios sobre ICF/EPS.",
    unidade: "m²",
    etapaKey: "revestimentos",
    sistemasConstrutivos: ["icf"],
    comumTodosSistemas: false,
    ordem: 30,
    itens: [
      { codigo: "ARQ-MAT-BASECOAT", nome: "Basecoat", unidade: "kg", tipo: "material", categoria: "ICF / Fachada", quantidade: "4.00" },
      { codigo: "ARQ-MAT-TELAFV", nome: "Tela de fibra de vidro alcalino-resistente", unidade: "m²", tipo: "material", categoria: "ICF / Fachada", quantidade: "1.10" },
      { codigo: "ARQ-MAT-CANTPVC", nome: "Cantoneira PVC com tela", unidade: "m", tipo: "material", categoria: "ICF / Fachada", quantidade: "0.20" },
      { codigo: "ARQ-MO-BASECOAT", nome: "Mão de obra aplicação de basecoat", unidade: "m²", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "1.00" },
    ],
  },
  {
    codigo: "ARQ-REV-004",
    nome: "Revestimento com chapa de drywall",
    descricao: "Composição referencial por m² para revestimento seco de uma face com chapa, estrutura, fixação e tratamento de juntas.",
    unidade: "m²",
    etapaKey: "revestimentos",
    sistemasConstrutivos: ["icf", "alvenaria", "steel_frame", "wood_frame", "concreto"],
    comumTodosSistemas: false,
    ordem: 40,
    itens: [
      { codigo: "ARQ-MAT-DRYCHAPA", nome: "Chapa de drywall", unidade: "m²", tipo: "material", categoria: "Drywall", quantidade: "1.05" },
      { codigo: "ARQ-MAT-DRYPERF", nome: "Perfis metálicos para drywall", unidade: "m", tipo: "material", categoria: "Drywall", quantidade: "0.70" },
      { codigo: "ARQ-MAT-DRYPAR", nome: "Parafusos para drywall", unidade: "un", tipo: "material", categoria: "Drywall", quantidade: "15.00" },
      { codigo: "ARQ-MAT-DRYFITA", nome: "Fita para tratamento de juntas", unidade: "m", tipo: "material", categoria: "Drywall", quantidade: "1.50" },
      { codigo: "ARQ-MAT-DRYMASSA", nome: "Massa para tratamento de juntas drywall", unidade: "kg", tipo: "material", categoria: "Drywall", quantidade: "0.60" },
      { codigo: "ARQ-MO-DRYREV", nome: "Mão de obra revestimento em drywall", unidade: "m²", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "1.00" },
    ],
  },
  {
    codigo: "ARQ-FOR-001",
    nome: "Massa corrida em parede/teto",
    descricao: "Composição referencial por m² para aplicação de massa corrida, lixamento e preparação para pintura.",
    unidade: "m²",
    etapaKey: "forros_pintura",
    sistemasConstrutivos: [],
    comumTodosSistemas: true,
    ordem: 10,
    itens: [
      { codigo: "ARQ-MAT-MASSAC", nome: "Massa corrida", unidade: "kg", tipo: "material", categoria: "Pintura", quantidade: "1.50" },
      { codigo: "ARQ-MAT-LIXA", nome: "Lixa para massa/pintura", unidade: "un", tipo: "material", categoria: "Pintura", quantidade: "0.10" },
      { codigo: "ARQ-MO-MASSAC", nome: "Mão de obra aplicação e lixamento de massa corrida", unidade: "m²", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "1.00" },
    ],
  },
  {
    codigo: "ARQ-FOR-002",
    nome: "Pintura interna",
    descricao: "Composição referencial por m² para selador/fundo, tinta interna e mão de obra. Ajustar rendimento conforme fabricante e número de demãos.",
    unidade: "m²",
    etapaKey: "forros_pintura",
    sistemasConstrutivos: [],
    comumTodosSistemas: true,
    ordem: 20,
    itens: [
      { codigo: "ARQ-MAT-SELADOR", nome: "Selador/fundo preparador", unidade: "l", tipo: "material", categoria: "Pintura", quantidade: "0.12" },
      { codigo: "ARQ-MAT-TINTINT", nome: "Tinta acrílica interna", unidade: "l", tipo: "material", categoria: "Pintura", quantidade: "0.22" },
      { codigo: "ARQ-MO-PINTINT", nome: "Mão de obra pintura interna", unidade: "m²", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "1.00" },
    ],
  },
  {
    codigo: "ARQ-FOR-003",
    nome: "Pintura externa",
    descricao: "Composição referencial por m² para fundo, tinta externa e mão de obra. Ajustar conforme substrato e fabricante.",
    unidade: "m²",
    etapaKey: "forros_pintura",
    sistemasConstrutivos: [],
    comumTodosSistemas: true,
    ordem: 30,
    itens: [
      { codigo: "ARQ-MAT-FUNDOEXT", nome: "Fundo preparador externo", unidade: "l", tipo: "material", categoria: "Pintura", quantidade: "0.12" },
      { codigo: "ARQ-MAT-TINTEXT", nome: "Tinta acrílica externa", unidade: "l", tipo: "material", categoria: "Pintura", quantidade: "0.24" },
      { codigo: "ARQ-MO-PINTEXT", nome: "Mão de obra pintura externa", unidade: "m²", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "1.00" },
    ],
  },
  {
    codigo: "ARQ-FOR-004",
    nome: "Forro de gesso acartonado",
    descricao: "Composição referencial por m² para forro de drywall completo com estrutura, suspensão, fixação e tratamento de juntas.",
    unidade: "m²",
    etapaKey: "forros_pintura",
    sistemasConstrutivos: [],
    comumTodosSistemas: true,
    ordem: 40,
    itens: [
      { codigo: "ARQ-MAT-DRYCHAPA", nome: "Chapa de drywall", unidade: "m²", tipo: "material", categoria: "Drywall", quantidade: "1.05" },
      { codigo: "ARQ-MAT-FORPERF", nome: "Perfis para forro drywall", unidade: "m", tipo: "material", categoria: "Drywall", quantidade: "2.50" },
      { codigo: "ARQ-MAT-FORTIR", nome: "Tirante/suporte de forro", unidade: "un", tipo: "material", categoria: "Drywall", quantidade: "0.70" },
      { codigo: "ARQ-MAT-DRYPAR", nome: "Parafusos para drywall", unidade: "un", tipo: "material", categoria: "Drywall", quantidade: "15.00" },
      { codigo: "ARQ-MAT-DRYFITA", nome: "Fita para tratamento de juntas", unidade: "m", tipo: "material", categoria: "Drywall", quantidade: "1.50" },
      { codigo: "ARQ-MAT-DRYMASSA", nome: "Massa para tratamento de juntas drywall", unidade: "kg", tipo: "material", categoria: "Drywall", quantidade: "0.60" },
      { codigo: "ARQ-MO-FORDRY", nome: "Mão de obra forro drywall", unidade: "m²", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "1.00" },
    ],
  },
  {
    codigo: "ARQ-ELE-001",
    nome: "Ponto de plafon",
    descricao: "Composição referencial por ponto para infraestrutura e ligação de plafon. A luminária pode ser orçada separadamente.",
    unidade: "un",
    etapaKey: "eletrica",
    sistemasConstrutivos: [],
    comumTodosSistemas: true,
    ordem: 10,
    itens: [
      { codigo: "ARQ-MAT-ELETRO20", nome: "Eletroduto corrugado 20 mm", unidade: "m", tipo: "material", categoria: "Elétrica", quantidade: "3.00" },
      { codigo: "ARQ-MAT-CAB15", nome: "Cabo elétrico 1,5 mm²", unidade: "m", tipo: "material", categoria: "Elétrica", quantidade: "6.00" },
      { codigo: "ARQ-MAT-CXPLAF", nome: "Caixa de teto para luminária", unidade: "un", tipo: "material", categoria: "Elétrica", quantidade: "1.00" },
      { codigo: "ARQ-MO-PTPLAF", nome: "Mão de obra ponto de plafon", unidade: "h", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "0.50" },
    ],
  },
  {
    codigo: "ARQ-ELE-002",
    nome: "Ponto elétrico — tomada 10 A",
    descricao: "Composição referencial por ponto de tomada 10 A, incluindo infraestrutura, cabos, caixa, mecanismo e mão de obra.",
    unidade: "un",
    etapaKey: "eletrica",
    sistemasConstrutivos: [],
    comumTodosSistemas: true,
    ordem: 20,
    itens: [
      { codigo: "ARQ-MAT-ELETRO20", nome: "Eletroduto corrugado 20 mm", unidade: "m", tipo: "material", categoria: "Elétrica", quantidade: "3.00" },
      { codigo: "ARQ-MAT-CAB25", nome: "Cabo elétrico 2,5 mm²", unidade: "m", tipo: "material", categoria: "Elétrica", quantidade: "9.00" },
      { codigo: "ARQ-MAT-CX4X2", nome: "Caixa elétrica 4x2", unidade: "un", tipo: "material", categoria: "Elétrica", quantidade: "1.00" },
      { codigo: "ARQ-MAT-TOM10", nome: "Tomada 10 A completa", unidade: "un", tipo: "material", categoria: "Elétrica", quantidade: "1.00" },
      { codigo: "ARQ-MO-PTELE", nome: "Mão de obra ponto elétrico", unidade: "h", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "0.80" },
    ],
  },
  {
    codigo: "ARQ-ELE-003",
    nome: "Ponto elétrico — tomada 20 A",
    descricao: "Composição referencial por ponto de tomada 20 A. Bitola e proteção devem ser verificadas conforme carga/projeto.",
    unidade: "un",
    etapaKey: "eletrica",
    sistemasConstrutivos: [],
    comumTodosSistemas: true,
    ordem: 30,
    itens: [
      { codigo: "ARQ-MAT-ELETRO20", nome: "Eletroduto corrugado 20 mm", unidade: "m", tipo: "material", categoria: "Elétrica", quantidade: "3.00" },
      { codigo: "ARQ-MAT-CAB25", nome: "Cabo elétrico 2,5 mm²", unidade: "m", tipo: "material", categoria: "Elétrica", quantidade: "9.00" },
      { codigo: "ARQ-MAT-CX4X2", nome: "Caixa elétrica 4x2", unidade: "un", tipo: "material", categoria: "Elétrica", quantidade: "1.00" },
      { codigo: "ARQ-MAT-TOM20", nome: "Tomada 20 A completa", unidade: "un", tipo: "material", categoria: "Elétrica", quantidade: "1.00" },
      { codigo: "ARQ-MO-PTELE", nome: "Mão de obra ponto elétrico", unidade: "h", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "0.80" },
    ],
  },
  {
    codigo: "ARQ-ELE-004",
    nome: "Ponto de interruptor",
    descricao: "Composição referencial por ponto de interruptor simples com infraestrutura, cabos, caixa e acabamento.",
    unidade: "un",
    etapaKey: "eletrica",
    sistemasConstrutivos: [],
    comumTodosSistemas: true,
    ordem: 40,
    itens: [
      { codigo: "ARQ-MAT-ELETRO20", nome: "Eletroduto corrugado 20 mm", unidade: "m", tipo: "material", categoria: "Elétrica", quantidade: "3.00" },
      { codigo: "ARQ-MAT-CAB15", nome: "Cabo elétrico 1,5 mm²", unidade: "m", tipo: "material", categoria: "Elétrica", quantidade: "6.00" },
      { codigo: "ARQ-MAT-CX4X2", nome: "Caixa elétrica 4x2", unidade: "un", tipo: "material", categoria: "Elétrica", quantidade: "1.00" },
      { codigo: "ARQ-MAT-INTSIMP", nome: "Interruptor simples completo", unidade: "un", tipo: "material", categoria: "Elétrica", quantidade: "1.00" },
      { codigo: "ARQ-MO-PTELE", nome: "Mão de obra ponto elétrico", unidade: "h", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "0.70" },
    ],
  },
  {
    codigo: "ARQ-HID-001",
    nome: "Ponto hidráulico — água fria",
    descricao: "Composição referencial por ponto de água fria. Diâmetros e conexões devem ser ajustados conforme projeto.",
    unidade: "un",
    etapaKey: "hidraulica",
    sistemasConstrutivos: [],
    comumTodosSistemas: true,
    ordem: 10,
    itens: [
      { codigo: "ARQ-MAT-TUBAF", nome: "Tubulação água fria", unidade: "m", tipo: "material", categoria: "Hidráulica", quantidade: "3.00" },
      { codigo: "ARQ-MAT-CONAF", nome: "Conexões água fria", unidade: "un", tipo: "material", categoria: "Hidráulica", quantidade: "3.00" },
      { codigo: "ARQ-MO-PTAF", nome: "Mão de obra ponto de água fria", unidade: "h", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "0.80" },
    ],
  },
  {
    codigo: "ARQ-HID-002",
    nome: "Ponto hidráulico — água quente",
    descricao: "Composição referencial por ponto de água quente. Material, isolamento e diâmetros devem seguir o sistema adotado.",
    unidade: "un",
    etapaKey: "hidraulica",
    sistemasConstrutivos: [],
    comumTodosSistemas: true,
    ordem: 20,
    itens: [
      { codigo: "ARQ-MAT-TUBAQ", nome: "Tubulação água quente", unidade: "m", tipo: "material", categoria: "Hidráulica", quantidade: "3.00" },
      { codigo: "ARQ-MAT-CONAQ", nome: "Conexões água quente", unidade: "un", tipo: "material", categoria: "Hidráulica", quantidade: "3.00" },
      { codigo: "ARQ-MO-PTAQ", nome: "Mão de obra ponto de água quente", unidade: "h", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "0.90" },
    ],
  },
  {
    codigo: "ARQ-HID-003",
    nome: "Ponto hidráulico — esgoto",
    descricao: "Composição referencial por ponto de esgoto. Diâmetro, ventilação e acessórios devem seguir o projeto hidrossanitário.",
    unidade: "un",
    etapaKey: "hidraulica",
    sistemasConstrutivos: [],
    comumTodosSistemas: true,
    ordem: 30,
    itens: [
      { codigo: "ARQ-MAT-TUBESG", nome: "Tubulação de esgoto", unidade: "m", tipo: "material", categoria: "Hidráulica", quantidade: "3.00" },
      { codigo: "ARQ-MAT-CONESG", nome: "Conexões de esgoto", unidade: "un", tipo: "material", categoria: "Hidráulica", quantidade: "3.00" },
      { codigo: "ARQ-MO-PTESG", nome: "Mão de obra ponto de esgoto", unidade: "h", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "0.90" },
    ],
  },
  {
    codigo: "ARQ-HID-004",
    nome: "Ponto hidráulico — chuveiro",
    descricao: "Composição referencial por ponto de chuveiro, considerando alimentação de água, conexão terminal e mão de obra. A alimentação elétrica do chuveiro deve ser dimensionada pelo projeto elétrico quando aplicável.",
    unidade: "un",
    etapaKey: "hidraulica",
    sistemasConstrutivos: [],
    comumTodosSistemas: true,
    ordem: 40,
    itens: [
      { codigo: "ARQ-MAT-TUBAF", nome: "Tubulação água fria", unidade: "m", tipo: "material", categoria: "Hidráulica", quantidade: "3.00" },
      { codigo: "ARQ-MAT-CONAF", nome: "Conexões água fria", unidade: "un", tipo: "material", categoria: "Hidráulica", quantidade: "3.00" },
      { codigo: "ARQ-MAT-SACHUV", nome: "Saída/conexão para chuveiro", unidade: "un", tipo: "material", categoria: "Hidráulica", quantidade: "1.00" },
      { codigo: "ARQ-MO-PTCHUV", nome: "Mão de obra ponto de chuveiro", unidade: "h", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "1.00" },
    ],
  },
  {
    codigo: "ARQ-HID-005",
    nome: "Ponto hidráulico — torneira",
    descricao: "Composição referencial por ponto de torneira com alimentação de água, conexão terminal e mão de obra. A torneira pode ser orçada separadamente como acabamento.",
    unidade: "un",
    etapaKey: "hidraulica",
    sistemasConstrutivos: [],
    comumTodosSistemas: true,
    ordem: 50,
    itens: [
      { codigo: "ARQ-MAT-TUBAF", nome: "Tubulação água fria", unidade: "m", tipo: "material", categoria: "Hidráulica", quantidade: "3.00" },
      { codigo: "ARQ-MAT-CONAF", nome: "Conexões água fria", unidade: "un", tipo: "material", categoria: "Hidráulica", quantidade: "3.00" },
      { codigo: "ARQ-MAT-SATORN", nome: "Saída/conexão para torneira", unidade: "un", tipo: "material", categoria: "Hidráulica", quantidade: "1.00" },
      { codigo: "ARQ-MO-PTTORN", nome: "Mão de obra ponto de torneira", unidade: "h", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "0.80" },
    ],
  },
  {
    codigo: "ARQ-ESQ-001",
    nome: "Portão de garagem — estrutura e fechamento",
    descricao: "Composição referencial por m² de portão. Perfis, fechamento, ferragens e acabamento devem ser ajustados ao modelo escolhido.",
    unidade: "m²",
    etapaKey: "esquadrias",
    sistemasConstrutivos: [],
    comumTodosSistemas: true,
    ordem: 10,
    itens: [
      { codigo: "ARQ-MAT-PORTAO", nome: "Estrutura/fechamento de portão de garagem", unidade: "m²", tipo: "material", categoria: "Esquadrias", quantidade: "1.00" },
      { codigo: "ARQ-MAT-FERRPORT", nome: "Ferragens e acessórios de portão", unidade: "cj", tipo: "material", categoria: "Esquadrias", quantidade: "0.20" },
      { codigo: "ARQ-MO-PORTAO", nome: "Mão de obra fabricação/instalação de portão", unidade: "m²", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "1.00" },
    ],
  },
  {
    codigo: "ARQ-ESQ-002",
    nome: "Automação de portão de garagem",
    descricao: "Composição por unidade para motor, acessórios e instalação de automação de portão.",
    unidade: "un",
    etapaKey: "esquadrias",
    sistemasConstrutivos: [],
    comumTodosSistemas: true,
    ordem: 20,
    itens: [
      { codigo: "ARQ-MAT-MOTORPORT", nome: "Kit motor para portão", unidade: "un", tipo: "material", categoria: "Esquadrias", quantidade: "1.00" },
      { codigo: "ARQ-MAT-ACCSP", nome: "Acessórios de automação de portão", unidade: "cj", tipo: "material", categoria: "Esquadrias", quantidade: "1.00" },
      { codigo: "ARQ-MO-AUTPORT", nome: "Mão de obra automação de portão", unidade: "h", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "3.00" },
    ],
  },
  {
    codigo: "ARQ-EXT-001",
    nome: "Muro de alvenaria — elevação e acabamento",
    descricao: "Composição referencial por m² de muro acima da fundação, incluindo bloco, argamassa, reforços, revestimento e mão de obra.",
    unidade: "m²",
    etapaKey: "areas_externas",
    sistemasConstrutivos: [],
    comumTodosSistemas: true,
    ordem: 10,
    itens: [
      { codigo: "ARQ-MAT-BLOCOMURO", nome: "Bloco para muro", unidade: "un", tipo: "material", categoria: "Áreas externas", quantidade: "12.50" },
      { codigo: "ARQ-MAT-ARGASS", nome: "Argamassa de assentamento", unidade: "kg", tipo: "material", categoria: "Argamassas", quantidade: "8.00" },
      { codigo: "ARQ-MAT-ACO", nome: "Aço para reforços", unidade: "kg", tipo: "material", categoria: "Estrutura", quantidade: "1.50" },
      { codigo: "ARQ-MAT-REVARG", nome: "Argamassa para revestimento", unidade: "kg", tipo: "material", categoria: "Argamassas", quantidade: "16.00" },
      { codigo: "ARQ-MO-MURO", nome: "Mão de obra execução de muro", unidade: "m²", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "1.00" },
    ],
  },
  {
    codigo: "ARQ-EXT-002",
    nome: "Fundação para muro",
    descricao: "Composição referencial por metro linear para fundação de muro. Dimensões devem ser recalculadas conforme altura, solo e projeto estrutural.",
    unidade: "m",
    etapaKey: "areas_externas",
    sistemasConstrutivos: [],
    comumTodosSistemas: true,
    ordem: 20,
    itens: [
      { codigo: "ARQ-MAT-CONC", nome: "Concreto para fundação", unidade: "m³", tipo: "material", categoria: "Estrutura", quantidade: "0.08" },
      { codigo: "ARQ-MAT-ACO", nome: "Aço para reforços", unidade: "kg", tipo: "material", categoria: "Estrutura", quantidade: "4.00" },
      { codigo: "ARQ-MO-FUNDMURO", nome: "Mão de obra fundação de muro", unidade: "m", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "1.00" },
    ],
  },
  {
    codigo: "ARQ-EXT-003",
    nome: "Calçada em concreto",
    descricao: "Composição referencial por m² de calçada em concreto com preparo de base, malha e acabamento.",
    unidade: "m²",
    etapaKey: "areas_externas",
    sistemasConstrutivos: [],
    comumTodosSistemas: true,
    ordem: 30,
    itens: [
      { codigo: "ARQ-MAT-BRITA", nome: "Brita/base para calçada", unidade: "m³", tipo: "material", categoria: "Áreas externas", quantidade: "0.06" },
      { codigo: "ARQ-MAT-CONC", nome: "Concreto para fundação", unidade: "m³", tipo: "material", categoria: "Estrutura", quantidade: "0.08" },
      { codigo: "ARQ-MAT-MALHA", nome: "Tela soldada/malha de aço", unidade: "m²", tipo: "material", categoria: "Estrutura", quantidade: "1.05" },
      { codigo: "ARQ-MO-CALCCONC", nome: "Mão de obra calçada em concreto", unidade: "m²", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "1.00" },
    ],
  },
  {
    codigo: "ARQ-EXT-004",
    nome: "Calçada em paver",
    descricao: "Composição referencial por m² para pavimento intertravado, incluindo base, areia, peças, compactação e mão de obra.",
    unidade: "m²",
    etapaKey: "areas_externas",
    sistemasConstrutivos: [],
    comumTodosSistemas: true,
    ordem: 40,
    itens: [
      { codigo: "ARQ-MAT-BRITA", nome: "Brita/base para calçada", unidade: "m³", tipo: "material", categoria: "Áreas externas", quantidade: "0.08" },
      { codigo: "ARQ-MAT-AREIAPAV", nome: "Areia para assentamento de paver", unidade: "m³", tipo: "material", categoria: "Áreas externas", quantidade: "0.05" },
      { codigo: "ARQ-MAT-PAVER", nome: "Paver/piso intertravado", unidade: "m²", tipo: "material", categoria: "Áreas externas", quantidade: "1.05" },
      { codigo: "ARQ-EQP-COMPACT", nome: "Compactador de placa", unidade: "h", tipo: "equipamento", categoria: "Equipamentos", quantidade: "0.10" },
      { codigo: "ARQ-MO-CALCPAV", nome: "Mão de obra calçada em paver", unidade: "m²", tipo: "mao_de_obra", categoria: "Mão de obra", quantidade: "1.00" },
    ],
  },
];
