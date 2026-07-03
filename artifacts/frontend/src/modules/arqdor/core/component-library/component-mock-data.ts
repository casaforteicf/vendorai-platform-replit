// ─── Component Library — Mock Data ───────────────────────────────────────────
// 12 componentes iniciais para desenvolvimento.
// Substitua futuramente por importação de catálogos de fabricantes.

import type { ComponentItem } from './component-types'

const now = '2026-07-03T00:00:00Z'

export const MOCK_COMPONENTS: ComponentItem[] = [
  // ── 1. Cozinha Todeschini ─────────────────────────────────────────────────
  {
    id:'comp-tod-001', name:'Cozinha Planejada Linha Contemporânea',
    category:'KITCHEN', subcategory:'Cozinha Completa',
    manufacturer:'Todeschini', brand:'Todeschini', line:'Contemporânea', model:'CON-2026',
    code:'TOD-CON-2026',
    description:'Cozinha planejada com marcenaria em MDF revestido, puxadores embutidos e acabamento de alta durabilidade. Disponível em diversas configurações de planta.',
    dimensions:{ width:'360', height:'240', depth:'60', unit:'cm' },
    materials:[
      { name:'MDF Revestido BP',  finish:'Ultramate', color:'Branco Neve' },
      { name:'MDF Revestido BP',  finish:'Ultramate', color:'Grafite Escovado' },
    ],
    finishes:['Ultramate','Brilho'], colors:['Branco Neve','Grafite','Carvalho'],
    textures:['Liso','Amadeirado'],
    referenceImages:[], productImages:[], technicalFiles:[],
    tags:['cozinha','planejada','contemporânea','todeschini'],
    compatibleObjectCategories:['KITCHEN','CABINETRY'],
    replacementBehavior:'KEEP_GEOMETRY',
    source:'MANUAL_INPUT', createdAt:now, updatedAt:now,
  },

  // ── 2. Colchão Herval ─────────────────────────────────────────────────────
  {
    id:'comp-her-001', name:'Colchão Ortopédico Queen Molas Ensacadas',
    category:'MATTRESS', subcategory:'Colchão Queen',
    manufacturer:'Herval', brand:'Herval', line:'Sonowell', model:'SWQ-180',
    code:'HRV-SWQ-180',
    description:'Colchão queen size com sistema de molas ensacadas, espuma viscoelástica e pillow top. Conforto premium para projetos residenciais e hoteleiros.',
    dimensions:{ width:'158', height:'30', depth:'198', unit:'cm' },
    materials:[{ name:'Tecido Jacquard', finish:'Atoalhado', color:'Off White' }],
    finishes:['Atoalhado'], colors:['Off White','Cru'],
    textures:['Tecido'],
    referenceImages:[], productImages:[], technicalFiles:[],
    tags:['colchão','herval','queen','molas','ortopédico'],
    compatibleObjectCategories:['MATTRESS','BED'],
    replacementBehavior:'KEEP_GEOMETRY',
    source:'MANUAL_INPUT', createdAt:now, updatedAt:now,
  },

  // ── 3. Geladeira Brastemp ─────────────────────────────────────────────────
  {
    id:'comp-bra-001', name:'Geladeira French Door Inverse 540L Inox',
    category:'REFRIGERATOR',
    manufacturer:'Brastemp', brand:'Brastemp', line:'Gourmand', model:'BRO80AKBNA',
    code:'BRA-BRO80',
    description:'Refrigerador French Door Inverse em acabamento inox com 540L de capacidade. Design contemporâneo e tecnologia Frost Free Advanced.',
    dimensions:{ width:'83.5', height:'179.5', depth:'76', unit:'cm' },
    materials:[{ name:'Aço Inoxidável', finish:'Escovado', color:'Inox' }],
    finishes:['Escovado Inox'], colors:['Inox'],
    textures:['Metal'],
    referenceImages:[], productImages:[], technicalFiles:[],
    tags:['geladeira','brastemp','inox','french door','refrigerador'],
    compatibleObjectCategories:['REFRIGERATOR','APPLIANCE'],
    replacementBehavior:'KEEP_GEOMETRY',
    source:'MANUAL_INPUT', createdAt:now, updatedAt:now,
  },

  // ── 4. Forno Brastemp ─────────────────────────────────────────────────────
  {
    id:'comp-bra-002', name:'Forno Embutido 80L Inox com Grill',
    category:'OVEN',
    manufacturer:'Brastemp', brand:'Brastemp', line:'Gourmand', model:'BOB84ARANA',
    code:'BRA-BOB84',
    description:'Forno de embutir 80L com 9 funções, grill elétrico, iluminação interna e acabamento inox. Compatível com móvel de 60cm.',
    dimensions:{ width:'59.5', height:'59.5', depth:'55', unit:'cm' },
    materials:[{ name:'Aço Inoxidável', finish:'Escovado', color:'Inox' }],
    finishes:['Escovado Inox'], colors:['Inox','Preto'],
    textures:['Metal','Vidro'],
    referenceImages:[], productImages:[], technicalFiles:[],
    tags:['forno','brastemp','embutir','inox','elétrico'],
    compatibleObjectCategories:['OVEN','APPLIANCE'],
    replacementBehavior:'MATCH_DIMENSIONS',
    source:'MANUAL_INPUT', createdAt:now, updatedAt:now,
  },

  // ── 5. Micro-ondas Brastemp ───────────────────────────────────────────────
  {
    id:'comp-bra-003', name:'Micro-ondas de Embutir 30L Inox',
    category:'MICROWAVE',
    manufacturer:'Brastemp', brand:'Brastemp', line:'Gourmand', model:'BMO30ARANA',
    code:'BRA-BMO30',
    description:'Micro-ondas de embutir 30L com 10 níveis de potência e acabamento inox. Design integrado à torre de marcenaria.',
    dimensions:{ width:'59.5', height:'38', depth:'55', unit:'cm' },
    materials:[{ name:'Aço Inoxidável', finish:'Escovado', color:'Inox' }],
    finishes:['Escovado Inox'], colors:['Inox'],
    textures:['Metal','Vidro'],
    referenceImages:[], productImages:[], technicalFiles:[],
    tags:['micro-ondas','brastemp','embutir','inox'],
    compatibleObjectCategories:['MICROWAVE','APPLIANCE'],
    replacementBehavior:'MATCH_DIMENSIONS',
    source:'MANUAL_INPUT', createdAt:now, updatedAt:now,
  },

  // ── 6. Cuba Tramontina ────────────────────────────────────────────────────
  {
    id:'comp-tra-001', name:'Cuba de Embutir Retangular 58×36cm Inox',
    category:'SINK',
    manufacturer:'Tramontina', brand:'Tramontina', line:'Alto Brilho', model:'93858000',
    code:'TRA-93858000',
    description:'Cuba de embutir em aço inoxidável 304 com acabamento polido espelhado. Bordas arredondadas e profundidade de 17cm.',
    dimensions:{ width:'58', height:'17', depth:'36', unit:'cm' },
    materials:[{ name:'Aço Inoxidável 304', finish:'Polido Espelhado', color:'Inox Brilhante' }],
    finishes:['Polido Espelhado','Acetinado'], colors:['Inox'],
    textures:['Metal'],
    referenceImages:[], productImages:[], technicalFiles:[],
    tags:['cuba','tramontina','inox','embutir','cozinha','bancada'],
    compatibleObjectCategories:['SINK','APPLIANCE'],
    replacementBehavior:'MATCH_DIMENSIONS',
    source:'MANUAL_INPUT', createdAt:now, updatedAt:now,
  },

  // ── 7. Torneira Docol ─────────────────────────────────────────────────────
  {
    id:'comp-doc-001', name:'Torneira Monocomando Cozinha Preto Fosco',
    category:'FAUCET',
    manufacturer:'Docol', brand:'Docol', line:'Acqua Due', model:'00483849',
    code:'DOC-00483849',
    description:'Torneira monocomando para cozinha em acabamento preto fosco. Bica alta com aerador embutido. Design contemporâneo e minimalista.',
    dimensions:{ width:'5', height:'43', depth:'24', unit:'cm' },
    materials:[{ name:'Latão', finish:'Preto Fosco', color:'Preto' }],
    finishes:['Preto Fosco','Cromado'], colors:['Preto','Cromado','Dourado'],
    textures:['Metal'],
    referenceImages:[], productImages:[], technicalFiles:[],
    tags:['torneira','docol','preto fosco','monocomando','cozinha','minimalista'],
    compatibleObjectCategories:['FAUCET'],
    replacementBehavior:'REPLACE_OBJECT',
    source:'MANUAL_INPUT', createdAt:now, updatedAt:now,
  },

  // ── 8. Sofá Sierra ────────────────────────────────────────────────────────
  {
    id:'comp-sie-001', name:'Sofá Retrátil 4 Lugares Tecido Cinza',
    category:'SOFA',
    manufacturer:'Sierra Móveis', brand:'Sierra', line:'Confort', model:'SF-4L-CZ',
    code:'SIE-SF4L-CZ',
    description:'Sofá retrátil e reclinável com 4 lugares em tecido cinza grafite. Pés em madeira macissa e assento com espuma D33.',
    dimensions:{ width:'280', height:'95', depth:'95', unit:'cm' },
    materials:[
      { name:'Tecido Suede', finish:'Veludo', color:'Cinza Grafite' },
      { name:'Madeira Maciça', finish:'Natural', color:'Mogno' },
    ],
    finishes:['Tecido Suede','Couríssimo'], colors:['Cinza','Bege','Chumbo','Terracota'],
    textures:['Tecido','Suede'],
    referenceImages:[], productImages:[], technicalFiles:[],
    tags:['sofá','sierra','retrátil','4 lugares','cinza','sala'],
    compatibleObjectCategories:['SOFA','ARMCHAIR'],
    replacementBehavior:'KEEP_GEOMETRY',
    source:'MANUAL_INPUT', createdAt:now, updatedAt:now,
  },

  // ── 9. Cadeira Breton ────────────────────────────────────────────────────
  {
    id:'comp-bre-001', name:'Cadeira Estofada Bege com Base Giratória',
    category:'CHAIR',
    manufacturer:'Breton', brand:'Breton', line:'Design+', model:'CH-EST-BG',
    code:'BRE-CH-EST-BG',
    description:'Cadeira estofada em tecido bege com base giratória em aço cromado. Ideal para ambientes de trabalho e sala de jantar contemporânea.',
    dimensions:{ width:'58', height:'88', depth:'55', unit:'cm' },
    materials:[
      { name:'Tecido Linho', finish:'Natural', color:'Bege Areia' },
      { name:'Aço Cromado', finish:'Cromado', color:'Prata' },
    ],
    finishes:['Linho Natural','Couríssimo'], colors:['Bege','Off White','Cinza','Preto'],
    textures:['Tecido','Metal'],
    referenceImages:[], productImages:[], technicalFiles:[],
    tags:['cadeira','breton','estofada','bege','giratória','design'],
    compatibleObjectCategories:['CHAIR','ARMCHAIR'],
    replacementBehavior:'REFERENCE_STYLE_ONLY',
    source:'MANUAL_INPUT', createdAt:now, updatedAt:now,
  },

  // ── 10. Piso Portobello ───────────────────────────────────────────────────
  {
    id:'comp-por-001', name:'Porcelanato Acetinado Concreto 60×60cm Cinza',
    category:'FLOORING',
    manufacturer:'Portobello', brand:'Portobello', line:'Smart', model:'PTB-CON-6060',
    code:'PTB-CON-6060-CZ',
    description:'Porcelanato acetinado 60×60cm com textura que remete ao concreto aparente. Acabamento neutro e resistente para uso residencial e comercial.',
    dimensions:{ width:'60', height:'1', depth:'60', unit:'cm' },
    materials:[{ name:'Porcelanato', finish:'Acetinado', color:'Cinza Cimento' }],
    finishes:['Acetinado','Polido','Natural'], colors:['Cinza Cimento','Off White','Grafite'],
    textures:['Concreto','Pedra'],
    referenceImages:[], productImages:[], technicalFiles:[],
    tags:['piso','portobello','porcelanato','cinza','concreto','60x60'],
    compatibleObjectCategories:['FLOORING','WALL_COVERING'],
    replacementBehavior:'MATERIAL_ONLY',
    source:'MANUAL_INPUT', createdAt:now, updatedAt:now,
  },

  // ── 11. Pedra Cosentino ───────────────────────────────────────────────────
  {
    id:'comp-cos-001', name:'Dekton Laurent — Pedra Ultra-compacta',
    category:'STONE',
    manufacturer:'Cosentino', brand:'Dekton', line:'Stonika', model:'DKT-LAURENT',
    code:'CST-DKT-LRNT',
    description:'Superfície ultra-compacta inspirada no travertino com tom bege quente e veios profundos. Alta resistência a riscos, UV e manchas. Ideal para bancadas e fachadas.',
    dimensions:{ width:'320', height:'1.2', depth:'144', unit:'cm' },
    materials:[{ name:'Dekton Ultra-compacto', finish:'Acetinado', color:'Bege Travertino' }],
    finishes:['Acetinado','Polido','Textured'], colors:['Bege','Off White','Terracota'],
    textures:['Pedra','Travertino','Mármore'],
    referenceImages:[], productImages:[], technicalFiles:[],
    tags:['pedra','cosentino','dekton','laurent','bancada','ultra-compacta','travertino'],
    compatibleObjectCategories:['STONE','FLOORING','WALL_COVERING'],
    replacementBehavior:'MATERIAL_ONLY',
    source:'MANUAL_INPUT', createdAt:now, updatedAt:now,
  },

  // ── 12. Puxador Cava ─────────────────────────────────────────────────────
  {
    id:'comp-cav-001', name:'Perfil Cava Alumínio Natural — Sem Puxador',
    category:'HANDLE',
    manufacturer:'Häfele', brand:'Häfele', line:'Concepta', model:'HF-CAV-ALN',
    code:'HF-CAV-ALN-20',
    description:'Perfil de cava fresada em alumínio natural anodizado. Sem puxador aparente — grip integrado à fresagem da porta. Largura 20mm, profundidade 10mm.',
    dimensions:{ width:'20', height:'10', depth:'2500', unit:'mm' },
    materials:[{ name:'Alumínio Anodizado', finish:'Natural Fosco', color:'Alumínio' }],
    finishes:['Natural Fosco','Preto Anodizado','Dourado'], colors:['Alumínio Natural','Preto','Dourado'],
    textures:['Metal'],
    referenceImages:[], productImages:[], technicalFiles:[],
    tags:['puxador','cava','alumínio','sem puxador','freijó','minimalista','häfele'],
    compatibleObjectCategories:['HANDLE','HARDWARE','CABINETRY'],
    replacementBehavior:'REPLACE_OBJECT',
    source:'MANUAL_INPUT', createdAt:now, updatedAt:now,
  },
]

export const MOCK_MANUFACTURERS = [...new Set(MOCK_COMPONENTS.map(c => c.manufacturer))].sort()
export const MOCK_BRANDS        = [...new Set(MOCK_COMPONENTS.map(c => c.brand))].sort()
export const MOCK_CATEGORIES    = [...new Set(MOCK_COMPONENTS.map(c => c.category))]
