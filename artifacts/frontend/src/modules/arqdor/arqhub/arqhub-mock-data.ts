// ─── ARQ HUB — Mock Data ─────────────────────────────────────────────────────
// Dados de demonstração para todos os hubs.
// Substituir por API calls futuramente.

import type {
  HubMaterial, HubComponent, SpaceTemplate, HubStyle,
  HubManufacturer, AITranslator, Asset, MarketplaceItem,
} from './arqhub-types'

const now = '2026-07-03T00:00:00Z'

// ═══════════════════════════════════════════════════════════════════════════
// MATERIAL HUB
// ═══════════════════════════════════════════════════════════════════════════

export const MOCK_HUB_MATERIALS: HubMaterial[] = [
  // MADEIRAS
  {
    id:'mat-001', name:'MDF Freijó Natural 15mm', category:'MADEIRAS',
    manufacturer:'Duratex', brand:'Durafloor', line:'Tábuas Especiais', collection:'Freijó',
    code:'DRX-FRJ-15', description:'MDF com revestimento Freijó natural, textura de poro aberto e aspecto amadeirado autêntico. Alta resistência à umidade.',
    finish:'Acetinado', texture:'Amadeirado', grain:true, gloss:20,
    pbrMaps:{}, images:[], tags:['mdf','freijó','amadeirado','cozinha','marcenaria'],
    palette:['#9B6C3C','#B8844F','#7A5230'], relatedColors:['#C8A87A','#6B4423'],
    projectsUsing:47, relatedComponents:['comp-tod-001'], visualWeight:65,
    designIntent:['Aconchego','Natural','Orgânico'], visibility:'COMMUNITY',
  },
  {
    id:'mat-002', name:'Carvalho Europeu Claro 12mm', category:'MADEIRAS',
    manufacturer:'Arauco', brand:'Arauco', line:'Wood Pro', collection:'Carvalho',
    code:'ARC-CE-12', description:'Carvalho europeu com veio suave e tonalidade clara. Perfeito para ambientes contemporâneos e escandinávos.',
    finish:'Ultramate', texture:'Amadeirado Suave', grain:true, gloss:5,
    pbrMaps:{}, images:[], tags:['carvalho','europeu','claro','escandinavo','contemporâneo'],
    palette:['#D4B896','#C4A67E','#B89060'], relatedColors:['#E8D4BC'],
    projectsUsing:83, relatedComponents:[], visualWeight:45,
    designIntent:['Minimalismo','Leveza','Escandinavo'], visibility:'COMMUNITY',
  },
  {
    id:'mat-003', name:'Nogal Americano Escuro 18mm', category:'MADEIRAS',
    manufacturer:'Duratex', brand:'Duratex', line:'Premium', collection:'Nogal',
    code:'DRX-NG-18', description:'Nogal americano escuro com veio pronunciado. Alta classe e sofisticação para ambientes de luxo.',
    finish:'Brilho', texture:'Veio Pronunciado', grain:true, gloss:60,
    pbrMaps:{}, images:[], tags:['nogal','escuro','luxo','sofisticado'],
    palette:['#3D2B1F','#4A3628','#5C4232'], relatedColors:['#2A1F14'],
    projectsUsing:29, relatedComponents:[], visualWeight:80,
    designIntent:['Luxo','Sofisticação','Poder'], visibility:'COMMUNITY',
  },

  // PEDRAS
  {
    id:'mat-010', name:'Calacatta Gold Extra', category:'PEDRAS',
    manufacturer:'Cosentino', brand:'Silestone', line:'Premium', collection:'Gold Series',
    code:'SIL-CG-EX', description:'Quartzito premium com fundo branco e veios dourados pronunciados. Símbolo de elegância e exclusividade.',
    finish:'Polido', texture:'Pedra Natural', grain:false, gloss:90,
    pbrMaps:{}, images:[], tags:['mármore','calacatta','gold','luxo','bancada'],
    palette:['#F5F0EB','#E8DDD0','#D4C4AA'], relatedColors:['#C4B090','#F0E8D8'],
    projectsUsing:112, relatedComponents:['comp-cos-001'], visualWeight:85,
    designIntent:['Luxo','Exclusividade','Elegância'], visibility:'COMMUNITY',
  },
  {
    id:'mat-011', name:'Basalto Negro Absolute', category:'PEDRAS',
    manufacturer:'Portobello', brand:'Portobello', line:'Stone', collection:'Basalto',
    code:'PTB-BNA-30', description:'Basalto negro com textura superficial leve. Transmite solidez e modernidade.',
    finish:'Flameado', texture:'Pedra Vulcânica', grain:false, gloss:10,
    pbrMaps:{}, images:[], tags:['basalto','negro','moderno','contemporâneo'],
    palette:['#1A1A1A','#252525','#2F2F2F'], relatedColors:['#0D0D0D'],
    projectsUsing:38, relatedComponents:[], visualWeight:90,
    designIntent:['Força','Modernidade','Drama'], visibility:'COMMUNITY',
  },

  // PORCELANATOS
  {
    id:'mat-020', name:'Porcelanato Cimento Cinza 60×60', category:'PORCELANATOS',
    manufacturer:'Portobello', brand:'Portobello', line:'Smart', collection:'Cimento',
    code:'PTB-CC-6060', description:'Porcelanato acetinado que remete ao concreto aparente. Neutro, versátil e contemporâneo.',
    finish:'Acetinado', texture:'Concreto', grain:false, gloss:30,
    pbrMaps:{}, images:[], tags:['porcelanato','cimento','cinza','contemporâneo'],
    palette:['#9E9E9E','#8E8E8E','#B0B0B0'], relatedColors:['#707070'],
    projectsUsing:201, relatedComponents:[], visualWeight:40,
    designIntent:['Neutro','Versatilidade','Contemporâneo'], visibility:'COMMUNITY',
  },
  {
    id:'mat-021', name:'Porcelanato Travertino Bege 80×80', category:'PORCELANATOS',
    manufacturer:'Portinari', brand:'Portinari', line:'Gran', collection:'Travertino',
    code:'PRT-TVB-8080', description:'Porcelanato com textura travertino em tonalidades bege quente. Sofisticação italiana.',
    finish:'Natural', texture:'Travertino', grain:false, gloss:25,
    pbrMaps:{}, images:[], tags:['travertino','bege','italiano','sofisticado'],
    palette:['#D4B898','#C8A880','#BCAA78'], relatedColors:['#E0C8A8'],
    projectsUsing:88, relatedComponents:[], visualWeight:55,
    designIntent:['Sofisticação','Calor','Italiano'], visibility:'COMMUNITY',
  },

  // TINTAS
  {
    id:'mat-030', name:'Branco Gesso Off White', category:'TINTAS',
    manufacturer:'Suvinil', brand:'Suvinil', line:'Acqua', collection:'Neutros',
    code:'SUV-BGO-01', description:'Tinta premium cor Branco Gesso em acabamento fosco. Tom quente e acolhedor.',
    finish:'Fosco', texture:'Liso', grain:false, gloss:5,
    pbrMaps:{}, images:[], tags:['tinta','branco','off white','fosco','neutro'],
    palette:['#F5F0E8','#EDE8DC','#F0EBE0'], relatedColors:['#FFFFFF'],
    projectsUsing:334, relatedComponents:[], visualWeight:20,
    designIntent:['Amplitude','Leveza','Neutro'], visibility:'COMMUNITY',
  },
  {
    id:'mat-031', name:'Verde Sage Fosco', category:'TINTAS',
    manufacturer:'Coral', brand:'Coral', line:'Fosco Interior', collection:'Naturais',
    code:'CRL-VSG-01', description:'Verde sage em acabamento ultra-fosco. Tendência 2025-2026 para sala e quarto.',
    finish:'Ultramate', texture:'Liso', grain:false, gloss:2,
    pbrMaps:{}, images:[], tags:['tinta','verde','sage','fosco','tendência'],
    palette:['#8FA888','#7D9878','#96B090'], relatedColors:['#6B8A68'],
    projectsUsing:156, relatedComponents:[], visualWeight:35,
    designIntent:['Natureza','Calma','Tendência'], visibility:'COMMUNITY',
  },

  // METAIS
  {
    id:'mat-040', name:'Inox Escovado 304', category:'METAIS',
    manufacturer:'Tramontina', brand:'Tramontina', line:'Pro', collection:'Industrial',
    code:'TRM-INX-304', description:'Aço inox escovado 304 para bancadas, rodapés e detalhes. Alta resistência e durabilidade.',
    finish:'Escovado', texture:'Metal Linear', grain:false, gloss:45,
    pbrMaps:{}, images:[], tags:['inox','escovado','industrial','cozinha'],
    palette:['#C0C0C0','#B8B8B8','#D0D0D0'], relatedColors:['#A0A0A0'],
    projectsUsing:178, relatedComponents:['comp-tra-001'], visualWeight:60,
    designIntent:['Durabilidade','Industrial','Precisão'], visibility:'COMMUNITY',
  },
  {
    id:'mat-041', name:'Cobre Envelhecido', category:'METAIS',
    manufacturer:'Docol', brand:'Docol', line:'Especiais', collection:'Vintage',
    code:'DOC-CEB-VT', description:'Acabamento cobre envelhecido para torneiras e metais sanitários. Personalidade única.',
    finish:'Envelhecido', texture:'Metálico Oxidado', grain:false, gloss:30,
    pbrMaps:{}, images:[], tags:['cobre','vintage','envelhecido','banheiro'],
    palette:['#B87333','#A06020','#C48040'], relatedColors:['#8B5A1C'],
    projectsUsing:41, relatedComponents:[], visualWeight:75,
    designIntent:['Personalidade','Vintage','Sofisticação'], visibility:'COMMUNITY',
  },

  // TECIDOS
  {
    id:'mat-050', name:'Veludo Azul Petróleo', category:'TECIDOS',
    manufacturer:'Teciflex', brand:'Teciflex', line:'Velvet Premium', collection:'Oceano',
    code:'TCF-VAP-BL', description:'Veludo de alta gramatura em azul petróleo. Textura macia e profundidade de cor única.',
    finish:'Aveludado', texture:'Veludo', grain:false, gloss:15,
    pbrMaps:{}, images:[], tags:['veludo','azul','petróleo','sofá','poltrona'],
    palette:['#1B4F72','#154060','#21608C'], relatedColors:['#0D3352'],
    projectsUsing:67, relatedComponents:['comp-sie-001'], visualWeight:70,
    designIntent:['Sofisticação','Profundidade','Luxo'], visibility:'COMMUNITY',
  },

  // CONCRETOS
  {
    id:'mat-060', name:'Concreto Aparente Cinza Médio', category:'CONCRETOS',
    manufacturer:'Viero', brand:'Viero', line:'Microcimento', collection:'Industrial',
    code:'VIR-CAP-GM', description:'Microcimento para paredes e pisos que remete ao concreto aparente. Superfície contínua e contemporânea.',
    finish:'Acetinado', texture:'Concreto Texturizado', grain:false, gloss:20,
    pbrMaps:{}, images:[], tags:['concreto','microcimento','industrial','contemporâneo'],
    palette:['#787878','#686868','#888888'], relatedColors:['#585858'],
    projectsUsing:94, relatedComponents:[], visualWeight:50,
    designIntent:['Industrial','Modernidade','Minimalismo'], visibility:'COMMUNITY',
  },
]

// ═══════════════════════════════════════════════════════════════════════════
// SPACE HUB
// ═══════════════════════════════════════════════════════════════════════════

export const MOCK_SPACE_TEMPLATES: SpaceTemplate[] = [
  {
    id:'space-001', name:'Cozinha Contemporânea Integrada', type:'COZINHA',
    description:'Template de cozinha integrada com marcenaria planejada, ilha central e eletrodomésticos embutidos. Estilo contemporâneo com toques de madeira e inox.',
    objects:['Marcenaria','Ilha Central','Geladeira','Forno','Cooktop','Cuba','Torneira','Pendentes'],
    materials:['MDF Freijó','Porcelanato Cimento','Dekton Laurent','Inox Escovado'],
    dna:'Contemporâneo, Integrado, Funcional', cameraConfig:{ angle:'35mm', height:'1.2m' },
    renderConfig:{ engine:'flux-1.1-pro-ultra', quality:'ultra', samples:64 },
    style:'CONTEMPORANEO', prompt:'Contemporary integrated kitchen with wood cabinetry, center island, built-in appliances, concrete floor, natural lighting',
    tags:['cozinha','integrada','contemporânea','ilha'], author:'arqdor.ai',
    visibility:'COMMUNITY', visualWeight:75, designIntent:['Funcionalidade','Integração','Contemporâneo'],
    createdAt:now,
  },
  {
    id:'space-002', name:'Sala de Estar Minimalista', type:'SALA',
    description:'Sala minimalista com paleta neutra, sofá em linho, mesa de centro em pedra e iluminação indireta. Poucos elementos de alto impacto.',
    objects:['Sofá','Mesa Centro','Painel TV','Luminária Piso','Tapete','Poltrona'],
    materials:['Tinta Off White','Carvalho Claro','Veludo Cinza','Pedra Natural'],
    dna:'Minimalista, Calmo, Pensado', cameraConfig:{ angle:'28mm', height:'1.0m' },
    renderConfig:{ engine:'flux-1.1-pro-ultra', quality:'ultra', samples:64 },
    style:'MINIMALISTA', prompt:'Minimalist living room, neutral palette, linen sofa, stone coffee table, indirect lighting, oak floor',
    tags:['sala','minimalista','neutro','sofisticado'], author:'arqdor.ai',
    visibility:'COMMUNITY', visualWeight:45, designIntent:['Calma','Minimalismo','Curadoria'],
    createdAt:now,
  },
  {
    id:'space-003', name:'Banheiro Japandi', type:'BANHEIRO',
    description:'Banheiro em estilo Japandi com tons terracota, madeira clara, cuba de apoio e espelho com moldura. Harmonia entre funcional e belo.',
    objects:['Cuba Apoio','Torneira','Espelho','Prateleira Madeira','Luminária Banheiro'],
    materials:['Porcelanato Terracota','Carvalho Claro','Cobre','Tinta Areia'],
    dna:'Japandi, Zen, Harmonioso', cameraConfig:{ angle:'35mm', height:'1.1m' },
    renderConfig:{ engine:'flux-1.1-pro-ultra', quality:'ultra', samples:64 },
    style:'JAPANDI', prompt:'Japandi bathroom, terracotta tiles, light oak accents, copper faucet, zen atmosphere, soft natural light',
    tags:['banheiro','japandi','terracota','zen'], author:'arqdor.ai',
    visibility:'COMMUNITY', visualWeight:60, designIntent:['Harmonia','Zen','Japandi'],
    createdAt:now,
  },
  {
    id:'space-004', name:'Quarto Escandinavo Acolhedor', type:'QUARTO',
    description:'Quarto escandinavo com cama estofada, roupa de cama em linho, prateleiras de madeira e plantas. Atmosfera quente e acolhedora.',
    objects:['Cama','Criado Mudo','Luminária Pendente','Prateleira','Tapete','Planta'],
    materials:['Carvalho Claro','Tinta Off White','Linho Bege','Cerâmica Branca'],
    dna:'Escandinavo, Acolhedor, Natural', cameraConfig:{ angle:'35mm', height:'1.0m' },
    renderConfig:{ engine:'flux-1.1-pro-ultra', quality:'ultra', samples:64 },
    style:'ESCANDINAVO', prompt:'Scandinavian bedroom, linen bedding, oak shelves, warm light, plants, hygge atmosphere',
    tags:['quarto','escandinavo','aconchego','hygge'], author:'arqdor.ai',
    visibility:'COMMUNITY', visualWeight:50, designIntent:['Aconchego','Natureza','Simplicidade'],
    createdAt:now,
  },
  {
    id:'space-005', name:'Home Office Produtivo', type:'HOME_OFFICE',
    description:'Home office com mesa ampla, cadeira ergonômica, estante para livros e iluminação para videoconferência.',
    objects:['Mesa Escritório','Cadeira Escritório','Estante','Luminária Mesa','Monitor'],
    materials:['MDF Nogal','Concreto Cinza','Tinta Off White'],
    dna:'Produtivo, Organizado, Contemporâneo', cameraConfig:{ angle:'35mm', height:'1.1m' },
    renderConfig:{ engine:'flux-1.1-pro-ultra', quality:'ultra', samples:64 },
    style:'CONTEMPORANEO', prompt:'Contemporary home office, wide desk, ergonomic chair, bookshelf, professional lighting, walnut and concrete',
    tags:['home office','escritório','produtivo','contemporâneo'], author:'arqdor.ai',
    visibility:'COMMUNITY', visualWeight:55, designIntent:['Produtividade','Foco','Organização'],
    createdAt:now,
  },
  {
    id:'space-006', name:'Área Gourmet Industrial', type:'AREA_GOURMET',
    description:'Área gourmet com churrasqueira embutida, bancada de granito, pergolado de madeira e iluminação de efeito.',
    objects:['Churrasqueira','Bancada Granito','Pergolado','Luminária Rústica','Mesa Rústica'],
    materials:['Granito Preto','Madeira Demolição','Tijolo Aparente','Inox'],
    dna:'Industrial, Rústico, Festivo', cameraConfig:{ angle:'28mm', height:'1.2m' },
    renderConfig:{ engine:'flux-1.1-pro-ultra', quality:'ultra', samples:64 },
    style:'INDUSTRIAL', prompt:'Industrial gourmet area, built-in barbecue, granite counter, wood pergola, exposed brick, warm lighting',
    tags:['área gourmet','churrasqueira','industrial','rústico'], author:'arqdor.ai',
    visibility:'COMMUNITY', visualWeight:70, designIntent:['Convivência','Festivo','Rústico'],
    createdAt:now,
  },
]

// ═══════════════════════════════════════════════════════════════════════════
// STYLE HUB
// ═══════════════════════════════════════════════════════════════════════════

export const MOCK_HUB_STYLES: HubStyle[] = [
  {
    id:'sty-001', name:'MINIMALISTA', label:'Minimalista',
    description:'Menos é mais. Espaços limpos, paleta neutra, objetos intencionais. Cada elemento tem propósito.',
    palette:['#F5F0EB','#E8E0D5','#9E9E9E','#1A1A1A','#8FA888'],
    materials:['Concreto aparente','Madeira clara','Linho','Vidro'],
    lighting:'Difusa, natural, sem sombras duras',
    photography:'Angular baixo, grande angular, estilo editorial minimalista',
    decoration:['Plantas únicas','Obra de arte singular','Objeto escultural'],
    atmosphere:'Silêncio visual, paz, foco, intencionalidade',
    restrictions:['Sem padrões estampados','Sem excesso de objetos','Sem cores vibrantes'],
    designIntent:['Silêncio','Intencionalidade','Paz'],
    visualWeight:20,
  },
  {
    id:'sty-002', name:'CONTEMPORANEO', label:'Contemporâneo',
    description:'Atual, versátil e equilibrado. Mistura materiais, formas e culturas de forma harmoniosa.',
    palette:['#FFFFFF','#2D2D2D','#9B6C3C','#C0C0C0','#6B8A68'],
    materials:['MDF','Porcelanato','Inox','Vidro temperado'],
    lighting:'Natural cruzada, spots embutidos, iluminação em camadas',
    photography:'45° médio, balanço entre perspectiva e detalhes',
    decoration:['Vasos','Livros design','Texturas variadas'],
    atmosphere:'Elegante mas acessível, moderno sem ser frio',
    restrictions:['Sem exageros de estilo','Proporcionalidade obrigatória'],
    designIntent:['Equilíbrio','Versatilidade','Atualidade'],
    visualWeight:50,
  },
  {
    id:'sty-003', name:'ESCANDINAVO', label:'Escandinavo',
    description:'Funcionalidade, natureza e aconchego. Hygge e lagom como princípios. Madeira e luz natural.',
    palette:['#FFFFFF','#F5EFE6','#D4B896','#8FA888','#4A4A4A'],
    materials:['Carvalho','Pinho','Linho','Cerâmica artesanal','Couro natural'],
    lighting:'Luz natural máxima, velas, iluminação quente',
    photography:'Wide com luz lateral, tons quentes, estilo editorial hygge',
    decoration:['Velas','Plantas','Livros','Cestas de fibra natural'],
    atmosphere:'Acolhedor, honesto, conectado à natureza',
    restrictions:['Sem exageros decorativos','Madeira sempre presente'],
    designIntent:['Aconchego','Natureza','Honestidade'],
    visualWeight:35,
  },
  {
    id:'sty-004', name:'INDUSTRIAL', label:'Industrial',
    description:'Cru, honesto, urbano. Materiais expostos, estruturas aparentes e iluminação dramática.',
    palette:['#1A1A1A','#3D3D3D','#C0C0C0','#8B4513','#2D4A2D'],
    materials:['Concreto aparente','Tijolo','Aço','Madeira demolição','Ferro'],
    lighting:'Spots direcionais, filamentos Edison, luz contrastada',
    photography:'Angular dramático, alto contraste, estilo editorial urbano',
    decoration:['Tubulações aparentes','Bancadas aço','Prateleiras industriais'],
    atmosphere:'Urbano, cru, autêntico, com história',
    restrictions:['Sem elementos decorativos excessivos','Materiais reais, nunca imitação'],
    designIntent:['Autenticidade','Força','Urbanidade'],
    visualWeight:80,
  },
  {
    id:'sty-005', name:'JAPANDI', label:'Japandi',
    description:'Fusão do minimalismo japonês com o aconchego escandinavo. Equilíbrio perfeito entre vazio e presença.',
    palette:['#F5EFE6','#8FA888','#D4B896','#4A4A4A','#C8A87A'],
    materials:['Madeira clara','Bambu','Linho','Cerâmica japonesa','Pedra natural'],
    lighting:'Difusa de baixa intensidade, shoji screens, lanterna',
    photography:'Angular baixo, espaço negativo intencional, equilíbrio zen',
    decoration:['Ikebana','Ceramics wabi-sabi','Nada em excesso'],
    atmosphere:'Serenidade, vazio contemplativo, presença',
    restrictions:['Máximo 7 objetos visíveis por espaço','Simetria ou assimetria intencional'],
    designIntent:['Serenidade','Equilíbrio','Presença'],
    visualWeight:30,
  },
  {
    id:'sty-006', name:'LUXO', label:'Luxo',
    description:'Materiais premium, proporções generosas e atenção obsessiva aos detalhes. O melhor de tudo.',
    palette:['#FFFFFF','#C8A87A','#2D1F0E','#C0B090','#1A1A1A'],
    materials:['Mármore Calacatta','Latão dourado','Couro genuíno','Seda','Pedra natural premium'],
    lighting:'Iluminação de museu, spots precisos, luz escondida',
    photography:'35mm, iluminação de joia, retoque profissional',
    decoration:['Arte original','Esculturas','Detalhes em ouro'],
    atmosphere:'Exclusivo, silencioso, poderoso, raro',
    restrictions:['Apenas materiais reais premium','Proporções generosas obrigatórias'],
    designIntent:['Exclusividade','Poder','Raridade'],
    visualWeight:95,
  },
  {
    id:'sty-007', name:'JAPANDI', label:'Boho',
    description:'Bohemian chic com camadas de texturas, cores vibrantes e mistura cultural rica.',
    palette:['#D4784A','#E8C870','#8FA888','#4A3A8A','#C87840'],
    materials:['Rattan','Macramê','Tecidos étnicos','Cerâmica artesanal','Plantas'],
    lighting:'Festões de luz, velas, luz quente difusa',
    photography:'Wide colorido, estilo lifestyle descontraído',
    decoration:['Tapetes sobrepostos','Plantas em abundância','Itens de viagem'],
    atmosphere:'Livre, criativo, colorido, sem regras fixas',
    restrictions:['Mínimo 3 padrões diferentes','Plantas obrigatórias'],
    designIntent:['Liberdade','Criatividade','Diversidade'],
    visualWeight:65,
  },
  {
    id:'sty-008', name:'ORGANICO', label:'Orgânico',
    description:'Formas curvas, materiais naturais e conexão com a terra. Anti-retilíneo por princípio.',
    palette:['#C8A87A','#8FA888','#D4784A','#F5EFE6','#6B8A68'],
    materials:['Pedra bruta','Madeira com veio','Areia','Terracota','Bambu'],
    lighting:'Natural total, skylight, luz de vela',
    photography:'Drone leve, perspectiva orgânica, ausência de retas',
    decoration:['Pedras','Plantas terrestres','Objetos artesanais'],
    atmosphere:'Terrestre, ancestral, conectado, autêntico',
    restrictions:['Sem ângulos retos aparentes','Formas curvas predominantes'],
    designIntent:['Conexão','Natureza','Autenticidade'],
    visualWeight:55,
  },
]

// ═══════════════════════════════════════════════════════════════════════════
// MANUFACTURER HUB
// ═══════════════════════════════════════════════════════════════════════════

export const MOCK_MANUFACTURERS: HubManufacturer[] = [
  { id:'mfr-001', name:'Portobello', site:'portobello.com.br', categories:['Porcelanato','Cerâmica','Pedra'], products:['Coleção Smart','Coleção Gran','Coleção Stone'], collections:['Smart 2026','Stone Premium'], finishes:['Acetinado','Polido','Natural','Brilhante'], materials:['Porcelanato','Cerâmica'], dna:'Inovação italiana com produção brasileira', status:'OFFICIAL', description:'Maior fabricante de pisos e revestimentos cerâmicos da América Latina.', origin:'Brasil' },
  { id:'mfr-002', name:'Todeschini', site:'todeschini.com.br', categories:['Cozinhas','Marcenaria','Dormitórios'], products:['Linha Contemporânea','Linha Treviso','Linha Dubai'], collections:['Colecção 2026'], finishes:['Ultramate','Brilho','Texturizado'], materials:['MDF BP','Vidro','Alumínio'], dna:'Móveis planejados com tecnologia e design', status:'OFFICIAL', description:'Referência nacional em móveis planejados para cozinhas e dormitórios.', origin:'Brasil' },
  { id:'mfr-003', name:'Florense', site:'florense.com.br', categories:['Cozinhas','Closets','Home Office'], products:['Linha Volare','Linha Origine'], collections:['2026 Collection'], finishes:['Fosco','Laca Brilho','Wood'], materials:['MDF','Lacado','Madeira'], dna:'Design contemporâneo com acabamento premium', status:'OFFICIAL', description:'Fabricante premium de ambientes planejados para alto padrão.', origin:'Brasil' },
  { id:'mfr-004', name:'Dell Anno', site:'dellanno.com.br', categories:['Cozinhas','Closets'], products:['Linha Belíssima','Linha Solare'], collections:['Bella 2026'], finishes:['Ultramate','Cristal','Natural'], materials:['MDF','Vidro','Alumínio'], dna:'Elegância italiana acessível', status:'OFFICIAL', description:'Móveis planejados de alto padrão com influência italiana.', origin:'Brasil' },
  { id:'mfr-005', name:'Brastemp', site:'brastemp.com.br', categories:['Eletrodomésticos','Linha Branca'], products:['Gourmand','Inverse','Compact'], collections:['Inox Line','Preto Premium'], finishes:['Inox Escovado','Preto','Branco'], materials:['Aço Inox','ABS'], dna:'Tecnologia doméstica premium', status:'OFFICIAL', description:'Marca premium da Whirlpool Corporation no Brasil.', origin:'Brasil' },
  { id:'mfr-006', name:'Electrolux', site:'electrolux.com.br', categories:['Eletrodomésticos','Ar Condicionado'], products:['Série A','Série Experience'], collections:['2026 Life'], finishes:['Inox','Titanium','Dark Edition'], materials:['Aço Inox','ABS Premium'], dna:'Inovação escandinava', status:'OFFICIAL', description:'Empresa sueca-brasileira de eletrodomésticos e eletroportáteis.', origin:'Suécia/Brasil' },
  { id:'mfr-007', name:'Tramontina', site:'tramontina.com.br', categories:['Cutelaria','Utensílios','Acessórios'], products:['Linha Alto Brilho','Linha Pro'], collections:['Premium','Pro Series'], finishes:['Polido','Escovado','Fosco'], materials:['Aço Inox 304','Alumínio'], dna:'Qualidade e tradição gaúcha', status:'OFFICIAL', description:'Fabricante centenário de cutelaria, utensílios e acessórios premium.', origin:'Brasil' },
  { id:'mfr-008', name:'Docol', site:'docol.com.br', categories:['Metais Sanitários','Torneiras','Chuveiros'], products:['Linha Acqua Due','Linha Futura'], collections:['Black Series','Gold Edition'], finishes:['Preto Fosco','Cromado','Dourado','Ouro Rose'], materials:['Latão','Aço Inox'], dna:'Design e performance hídrica', status:'OFFICIAL', description:'Fabricante premium de metais sanitários com design premiado.', origin:'Brasil' },
  { id:'mfr-009', name:'Deca', site:'deca.com.br', categories:['Metais Sanitários','Louças','Cubas'], products:['Linha Decalux','Linha Spin'], collections:['Smart','Premium'], finishes:['Cromado','Fosco','Dourado'], materials:['Louça','Latão','Acrílico'], dna:'Inovação em banho', status:'OFFICIAL', description:'Marca Duratex para produtos de banheiro e cozinha.', origin:'Brasil' },
  { id:'mfr-010', name:'Portinari', site:'portinari.com.br', categories:['Porcelanato','Cerâmica','Revestimentos'], products:['Gran Portinari','Craft','Nature'], collections:['Gran 2026','Textura'], finishes:['Acetinado','Natural','Brilhante'], materials:['Porcelanato','Cerâmica'], dna:'Arte e técnica na produção cerâmica', status:'OFFICIAL', description:'Fabricante brasileiro com design premiado internacionalmente.', origin:'Brasil' },
  { id:'mfr-011', name:'Cosentino', site:'cosentino.com/br', categories:['Pedras','Superfícies'], products:['Silestone','Dekton','Scalea'], collections:['Stonika','Marengo'], finishes:['Polido','Acetinado','Natural'], materials:['Quartzo','Ultra-compacto','Granito'], dna:'Superfícies de alto desempenho', status:'OFFICIAL', description:'Empresa espanhola líder global em superfícies de pedra e ultra-compactos.', origin:'Espanha' },
  { id:'mfr-012', name:'Guararapes', site:'guararapes.ind.br', categories:['MDF','Painéis'], products:['MDF BP','MDF Eucatex'], collections:['Freijó','Carvalho','Branco'], finishes:['BP Ultramate','BP Brilho','Texturizado'], materials:['MDF','Aglomerado'], dna:'Painel de qualidade para marcenaria', status:'OFFICIAL', description:'Fabricante de painéis de MDF e aglomerado para marcenaria.', origin:'Brasil' },
  { id:'mfr-013', name:'Arauco', site:'arauco.com/brasil', categories:['MDF','Aglomerado'], products:['MDF Arauco','RDP Arauco'], collections:['Carvalho','Nogal','Ripado'], finishes:['Fosco','Ultramate','Natural'], materials:['MDF','Aglomerado'], dna:'Madeira da floresta plantada', status:'OFFICIAL', description:'Empresa chileno-brasileira de painéis de madeira e celulose.', origin:'Chile/Brasil' },
  { id:'mfr-014', name:'Duratex', site:'duratex.com.br', categories:['MDF','Durafloor'], products:['MDF Premium','Durafloor Wide'], collections:['Tábuas Especiais','Plurale'], finishes:['Ultramate','Brilho','Textured'], materials:['MDF','Vinílico'], dna:'Soluções completas em madeira', status:'OFFICIAL', description:'Holding brasileira de painéis de madeira e revestimentos de piso.', origin:'Brasil' },
  { id:'mfr-015', name:'Häfele', site:'hafele.com/br', categories:['Ferragens','Puxadores','Sistemas'], products:['Concept','Concepta','Dialock'], collections:['Alumínio Cava','Inox','Preto'], finishes:['Alumínio Natural','Preto Anodizado','Cromado'], materials:['Alumínio','Aço Inox','Zamak'], dna:'Engenharia alemã para marcenaria', status:'OFFICIAL', description:'Empresa alemã de ferragens, ferramentas e serviços para móveis.', origin:'Alemanha' },
]

// ═══════════════════════════════════════════════════════════════════════════
// AI HUB
// ═══════════════════════════════════════════════════════════════════════════

export const MOCK_AI_TRANSLATORS: AITranslator[] = [
  { id:'ai-001', name:'Flux 1.1 Pro Ultra', provider:'Black Forest Labs', type:'IMAGE_GEN', description:'Modelo de geração de imagens de alta qualidade. Motor principal para renders fotorrealistas.', capabilities:['Render arquitetônico','Inpainting','Outpainting','Upscaling'], status:'ACTIVE', configKeys:['REPLICATE_API_TOKEN'], icon:'🎨' },
  { id:'ai-002', name:'Flux Kontext Pro', provider:'Black Forest Labs', type:'IMAGE_GEN', description:'Geração contextual de imagens preservando geometria e estrutura. Ideal para substituição de elementos.', capabilities:['Edição contextual','Preservação de estrutura','Substituição de material'], status:'ACTIVE', configKeys:['REPLICATE_API_TOKEN'], icon:'🔄' },
  { id:'ai-003', name:'Flux Fill Pro', provider:'Black Forest Labs', type:'IMAGE_GEN', description:'Inpainting avançado com máscara precisa. Para ajustes pontuais no render.', capabilities:['Inpainting com máscara','Preenchimento inteligente','Correção pontual'], status:'ACTIVE', configKeys:['REPLICATE_API_TOKEN'], icon:'🖌️' },
  { id:'ai-004', name:'OpenAI GPT-4o', provider:'OpenAI', type:'TEXT_GEN', description:'Geração e interpretação de prompts avançados. Revisão e melhoria de prompts de render.', capabilities:['Prompt refinement','Análise de projeto','Sugestões de materiais'], status:'PLANNED', configKeys:['OPENAI_API_KEY'], icon:'🤖' },
  { id:'ai-005', name:'Gemini Pro Vision', provider:'Google', type:'REVIEW', description:'Análise visual de renders gerados. Detecta inconsistências e sugere melhorias.', capabilities:['Análise de render','Detecção de erros','Comparação visual'], status:'PLANNED', configKeys:['GEMINI_API_KEY'], icon:'🔍' },
  { id:'ai-006', name:'Midjourney v7', provider:'Midjourney', type:'IMAGE_GEN', description:'Geração artística de alta qualidade. Para apresentações conceituais e moodboards.', capabilities:['Concept art','Moodboard','Variações estéticas'], status:'PLANNED', configKeys:['MIDJOURNEY_API_KEY'], icon:'🎭' },
  { id:'ai-007', name:'Nano Banana', provider:'Arqdor Internal', type:'PROMPT', description:'Micro-transformador de prompts específico para arquitetura. Converte DNA de projeto em prompt otimizado.', capabilities:['DNA → Prompt','Otimização de prompt','Validação de consistência'], status:'ACTIVE', configKeys:[], icon:'🍌' },
  { id:'ai-008', name:'AI Memory', provider:'Arqdor Internal', type:'MEMORY', description:'Sistema de memória contextual. Aprende preferências do arquiteto ao longo dos projetos.', capabilities:['Preferências pessoais','Estilo recorrente','DNA acumulado'], status:'ACTIVE', configKeys:[], icon:'🧠' },
]

// ═══════════════════════════════════════════════════════════════════════════
// ASSET LIBRARY
// ═══════════════════════════════════════════════════════════════════════════

export const MOCK_ASSETS: Asset[] = [
  { id:'asset-001', type:'STYLE_PACK', name:'Japandi Essentials Pack', description:'Pack completo com 12 estilos Japandi, paletas, prompts e configurações de render.', author:'arqdor.ai', version:'1.2.0', tags:['japandi','escandinavo','japonês','zen'], category:'Estilo', license:'FREE', visibility:'COMMUNITY', visualWeight:35, designIntent:['Serenidade','Equilíbrio'], createdAt:now, updatedAt:now, versions:[{version:'1.2.0',description:'Novos prompts e paletas',createdAt:now},{version:'1.1.0',description:'Primeira versão',createdAt:now}] },
  { id:'asset-002', type:'PROMPT_PACK', name:'Luxury Interiors Prompts', description:'50 prompts calibrados para interiores de luxo. Inclui materiais premium, iluminação de joia e estilos hotel boutique.', author:'@arqdesign', version:'2.0.0', tags:['luxo','prompts','hotel','premium'], category:'Prompts', license:'PREMIUM', visibility:'MARKETPLACE', visualWeight:90, designIntent:['Luxo','Exclusividade'], createdAt:now, updatedAt:now, versions:[{version:'2.0.0',description:'50 prompts completos',createdAt:now}] },
  { id:'asset-003', type:'PHOTOGRAPHY_PROFILE', name:'Golden Hour Residential', description:'Perfil de fotografia para residências em hora dourada. Temperatura de cor 3200K, bokeh suave.', author:'arqdor.ai', version:'1.0.0', tags:['fotografia','golden hour','residencial'], category:'Fotografia', license:'FREE', visibility:'COMMUNITY', visualWeight:60, designIntent:['Aconchego','Calor'], createdAt:now, updatedAt:now, versions:[{version:'1.0.0',description:'Perfil inicial',createdAt:now}] },
  { id:'asset-004', type:'DNA', name:'DNA Contemporâneo Brasileiro', description:'DNA arquitetônico com identidade brasileira contemporânea. Paleta de madeiras nacionais e espaços integrados.', author:'arqdor.ai', version:'1.0.0', tags:['dna','brasileiro','contemporâneo','madeira'], category:'DNA', license:'FREE', visibility:'COMMUNITY', visualWeight:55, designIntent:['Identidade','Integração','Nacional'], createdAt:now, updatedAt:now, versions:[{version:'1.0.0',description:'DNA base',createdAt:now}] },
  { id:'asset-005', type:'RENDER_CONFIG', name:'Ultra Photorealistic Config', description:'Configuração de render para resultados ultra-fotorrealistas. Calibrado para interiores a partir de 40m².', author:'arqdor.ai', version:'3.1.0', tags:['render','fotorrealista','ultra','configuração'], category:'Render', license:'FREE', visibility:'COMMUNITY', visualWeight:75, designIntent:['Precisão','Fotorrealismo'], createdAt:now, updatedAt:now, versions:[{version:'3.1.0',description:'Calibração atualizada',createdAt:now},{version:'3.0.0',description:'Nova engine',createdAt:now}] },
  { id:'asset-006', type:'MATERIAL', name:'Material Pack — Madeiras Nacionais', description:'12 materiais de madeiras nativas brasileiras com texturas PBR, paletas e DNAs.', author:'arqdor.ai', version:'1.0.0', tags:['material','madeira','brasil','pbr'], category:'Material', license:'FREE', visibility:'COMMUNITY', visualWeight:50, designIntent:['Natural','Sustentável','Nacional'], createdAt:now, updatedAt:now, versions:[{version:'1.0.0',description:'12 madeiras nativas',createdAt:now}] },
  { id:'asset-007', type:'LIGHTING_PROFILE', name:'Studio Lighting — Day Interior', description:'Perfil de iluminação natural interna para dia claro. Janelas leste com difusão total.', author:'@luz_arq', version:'2.2.0', tags:['iluminação','natural','interior','dia'], category:'Iluminação', license:'OPEN', visibility:'COMMUNITY', visualWeight:45, designIntent:['Naturalidade','Amplitude'], createdAt:now, updatedAt:now, versions:[{version:'2.2.0',description:'Novo perfil difuso',createdAt:now}] },
  { id:'asset-008', type:'TEMPLATE', name:'Cozinha Americana Template', description:'Template completo de cozinha americana integrada com sala. Inclui objetos, materiais e prompt.', author:'arqdor.ai', version:'1.0.0', tags:['template','cozinha','americana','sala'], category:'Ambientes', license:'FREE', visibility:'COMMUNITY', visualWeight:65, designIntent:['Integração','Funcionalidade'], createdAt:now, updatedAt:now, versions:[{version:'1.0.0',description:'Versão inicial',createdAt:now}] },
]

// ═══════════════════════════════════════════════════════════════════════════
// MARKETPLACE
// ═══════════════════════════════════════════════════════════════════════════

export const MOCK_MARKETPLACE: MarketplaceItem[] = [
  { id:'mkt-001', type:'PROMPT_PACK', name:'Luxury Hotel Suite — 50 Prompts', description:'Pack exclusivo para suítes de hotel de luxo. Materiais premium, iluminação cinematográfica.', author:'@interiorpro', version:'1.0.0', tags:['luxo','hotel','prompts'], category:'Prompts', license:'PREMIUM', visibility:'MARKETPLACE', visualWeight:92, designIntent:['Luxo'], createdAt:now, updatedAt:now, versions:[], price:197, currency:'BRL', downloads:342, rating:4.9, reviews:87, featured:true },
  { id:'mkt-002', type:'STYLE_PACK', name:'Japandi Complete Collection', description:'Coleção completa Japandi com estilos, materiais, paletas e configurações de render.', author:'@studio.zen', version:'2.0.0', tags:['japandi'], category:'Estilo', license:'PREMIUM', visibility:'MARKETPLACE', visualWeight:30, designIntent:['Serenidade'], createdAt:now, updatedAt:now, versions:[], price:147, currency:'BRL', downloads:891, rating:4.8, reviews:203, featured:true },
  { id:'mkt-003', type:'MATERIAL', name:'Materiais de Luxo — Pack Premium', description:'24 materiais premium com texturas PBR, incluindo mármores Calacatta, latão e couro.', author:'arqdor.ai', version:'1.0.0', tags:['materiais','luxo','pbr'], category:'Material', license:'PREMIUM', visibility:'MARKETPLACE', visualWeight:88, designIntent:['Luxo'], createdAt:now, updatedAt:now, versions:[], price:97, currency:'BRL', downloads:567, rating:4.7, reviews:134, featured:false },
  { id:'mkt-004', type:'TEMPLATE', name:'Apartamento Studio Completo', description:'Template completo de studio com 7 ambientes, 4 estilos e prompts otimizados.', author:'@arqdor.community', version:'1.0.0', tags:['template','studio','apartamento'], category:'Ambientes', license:'FREE', visibility:'MARKETPLACE', visualWeight:55, designIntent:['Funcionalidade'], createdAt:now, updatedAt:now, versions:[], price:null, currency:'BRL', downloads:1243, rating:4.6, reviews:312, featured:true },
  { id:'mkt-005', type:'PHOTOGRAPHY_PROFILE', name:'Commercial Photography Pack', description:'8 perfis de fotografia para projetos comerciais. Iluminação, ângulo e pós-produção.', author:'@photo.arch', version:'1.2.0', tags:['fotografia','comercial'], category:'Fotografia', license:'PREMIUM', visibility:'MARKETPLACE', visualWeight:70, designIntent:['Profissionalismo'], createdAt:now, updatedAt:now, versions:[], price:79, currency:'BRL', downloads:289, rating:4.5, reviews:71, featured:false },
  { id:'mkt-006', type:'DNA', name:'DNA Moderno Minimalista', description:'DNA base para projetos minimalistas modernos. Compatível com todos os módulos do arqdor.', author:'arqdor.ai', version:'1.0.0', tags:['dna','minimalista'], category:'DNA', license:'FREE', visibility:'MARKETPLACE', visualWeight:20, designIntent:['Minimalismo'], createdAt:now, updatedAt:now, versions:[], price:null, currency:'BRL', downloads:2187, rating:4.9, reviews:445, featured:true },
]
