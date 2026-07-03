// ─── AIE Mock Project Context ─────────────────────────────────────────────────
// Represents a realistic project state for demo purposes.

import type { ProjectContext } from './aie-types'

export const MOCK_PROJECT_CONTEXT: ProjectContext = {
  id:         'proj-alpha-001',
  name:       'Apartamento Alpha — Cozinha + Sala',
  renderGoal: 'Fotorrealista para apresentação ao cliente',
  cameraAngle: '35mm',
  lightingType: 'NATURAL',
  dna: 'Contemporâneo brasileiro, integração social, madeira natural e concreto aparente',
  style: {
    name: 'Contemporâneo',
    designIntent: ['Equilíbrio','Versatilidade','Atualidade'],
    palette: ['#FFFFFF','#2D2D2D','#9B6C3C','#C0C0C0','#6B8A68'],
    restrictions: ['Proporcionalidade obrigatória'],
  },
  objects: [
    { id:'obj-001', name:'Marcenaria Cozinha', category:'CABINETRY', material:'MDF Freijó Natural 15mm', finish:'Ultramate', color:'#9B6C3C', dimensions:{width:320,height:220,depth:60,unit:'cm'}, visualWeight:85, designIntent:['Definir ambiente','Linguagem principal','Funcionalidade'] },
    { id:'obj-002', name:'Ilha Central', category:'KITCHEN', material:'Dekton Laurent', finish:'Natural', color:'#5C4232', dimensions:{width:180,height:90,depth:90,unit:'cm'}, visualWeight:80, designIntent:['Ponto focal','Socialização','Hierarquia'] },
    { id:'obj-003', name:'Sofá 3 Lugares', category:'SOFA', material:'Veludo Azul Petróleo', finish:'Aveludado', color:'#1B4F72', dimensions:{width:250,height:85,depth:95,unit:'cm'}, visualWeight:70, designIntent:['Conforto','Âncora da sala','Contraste de cor'] },
    { id:'obj-004', name:'Mesa de Centro', category:'TABLE', material:'Vidro Temperado', finish:'Polido', color:'#CCCCCC', dimensions:{width:120,height:42,depth:60,unit:'cm'}, visualWeight:45, designIntent:['Leveza','Transparência','Não competir com sofá'] },
    { id:'obj-005', name:'Pendente sobre Ilha', category:'LIGHTING', finish:'Preto Fosco', color:'#1A1A1A', visualWeight:40, designIntent:['Iluminação funcional','Detalhe de estilo','Ritmo vertical'] },
    { id:'obj-006', name:'Refrigerador French Door', category:'REFRIGERATOR', material:'Inox Escovado', finish:'Escovado', manufacturerId:'mfr-005', dimensions:{width:90,height:178,depth:73,unit:'cm'}, visualWeight:60, designIntent:['Funcionalidade','Integração com marcenaria'] },
    { id:'obj-007', name:'Cooktop 5 Bocas', category:'COOKTOP', material:'Inox Escovado', finish:'Escovado', dimensions:{width:90,height:5,depth:52,unit:'cm'}, visualWeight:35 },
    { id:'obj-008', name:'Poltrona Leitura', category:'ARMCHAIR', material:'Linho Bege', finish:'Natural', color:'#D4B896', dimensions:{width:85,height:90,depth:85,unit:'cm'}, visualWeight:45, designIntent:['Complemento ao sofá','Textura natural'] },
    { id:'obj-009', name:'Tapete Sala', category:'FLOORING', finish:'Tramado', color:'#8C7B6B', dimensions:{width:250,height:2,depth:200,unit:'cm'}, visualWeight:50, designIntent:['Definir zona social','Textura','Calor'] },
    { id:'obj-010', name:'Planta Ficus', category:'PLANT', visualWeight:15, designIntent:['Vida','Natureza','Contrastar com materiais duros'] },
    { id:'obj-011', name:'Torneira Gourmet', category:'FAUCET', material:'Inox Escovado', finish:'Escovado', manufacturerId:'mfr-008', visualWeight:20, designIntent:['Detalhe funcional','Consistência metálica'] },
    { id:'obj-012', name:'Puxadores Marcenaria', category:'HANDLE', finish:'Preto Fosco', visualWeight:10, designIntent:['Minimalismo','Pouca interferência','Linhas contínuas'] },
  ],
  materials: [
    { id:'mat-001', name:'MDF Freijó Natural 15mm', category:'MADEIRAS', manufacturer:'Duratex', finish:'Ultramate', gloss:20, palette:['#9B6C3C','#B8844F','#7A5230'], usedByObjects:['obj-001'] },
    { id:'mat-010', name:'Dekton Laurent', category:'PEDRAS', manufacturer:'Cosentino', finish:'Natural', gloss:25, palette:['#5C4232','#6B4A3A','#4A3020'], usedByObjects:['obj-002'] },
    { id:'mat-050', name:'Veludo Azul Petróleo', category:'TECIDOS', manufacturer:'Teciflex', finish:'Aveludado', gloss:15, palette:['#1B4F72','#154060','#21608C'], usedByObjects:['obj-003'] },
    { id:'mat-040', name:'Inox Escovado 304', category:'METAIS', manufacturer:'Tramontina', finish:'Escovado', gloss:45, palette:['#C0C0C0','#B8B8B8','#D0D0D0'], usedByObjects:['obj-006','obj-007','obj-011'] },
    { id:'mat-030', name:'Branco Gesso Off White', category:'TINTAS', manufacturer:'Suvinil', finish:'Fosco', gloss:5, palette:['#F5F0E8','#EDE8DC'], usedByObjects:[] },
    { id:'mat-060', name:'Concreto Aparente Cinza', category:'CONCRETOS', manufacturer:'Viero', finish:'Acetinado', gloss:20, palette:['#787878','#686868'], usedByObjects:[] },
  ],
}

// Simulate a less complete project for comparison
export const MOCK_INCOMPLETE_CONTEXT: ProjectContext = {
  id:      'proj-beta-002',
  name:    'Apartamento Beta — Em desenvolvimento',
  objects: [
    { id:'obj-b01', name:'Sofá Desconhecido', category:'SOFA', visualWeight:70 },
    { id:'obj-b02', name:'Mesa Jantar', category:'TABLE', material:'MDF',visualWeight:55 },
    { id:'obj-b03', name:'Cadeiras', category:'CHAIR', visualWeight:30 },
    { id:'obj-b04', name:'Aparador', category:'CUSTOM', visualWeight:40 },
  ],
  materials:[],
}
