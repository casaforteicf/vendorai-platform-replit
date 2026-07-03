// ─── VKG Taxonomy — Node type metadata registry ──────────────────────────────
// Defines visual and semantic metadata for every NodeType.
// Consumed by visualization, search weighting, and inference engines.

import type { NodeType, RelationshipType } from '../types'

export interface NodeTypeMeta {
  type:        NodeType
  icon:        string
  color:       string     // hex
  domain:      'identity' | 'architecture' | 'commerce' | 'crm' | 'workflow' | 'creative' | 'knowledge'
  description: string
  /** Property keys expected on this node type */
  schema:      string[]
}

export const NODE_TAXONOMY: Record<NodeType, NodeTypeMeta> = {
  User:          { type:'User',          icon:'👤', color:'#60a5fa', domain:'identity',     description:'Usuário da plataforma',           schema:['name','email','role']                },
  Tenant:        { type:'Tenant',        icon:'🏢', color:'#a78bfa', domain:'identity',     description:'Organização cliente',             schema:['name','plan','status']               },
  Workspace:     { type:'Workspace',     icon:'🖥️', color:'#818cf8', domain:'identity',     description:'Workspace vertical',             schema:['vertical','name']                   },
  Project:       { type:'Project',       icon:'🏗️', color:'#7c3aed', domain:'architecture', description:'Projeto arquitetônico ou obra',   schema:['titulo','tipoObra','areaM2','status']},
  Environment:   { type:'Environment',   icon:'🏠', color:'#6d28d9', domain:'architecture', description:'Ambiente dentro de um projeto',   schema:['name','category','sqm']             },
  Object:        { type:'Object',        icon:'📦', color:'#8b5cf6', domain:'architecture', description:'Objeto arquitetônico',            schema:['name','category','material']        },
  Material:      { type:'Material',      icon:'🪵', color:'#c4b5fd', domain:'architecture', description:'Material ou revestimento',        schema:['name','category','finish','gloss']  },
  Component:     { type:'Component',     icon:'🔩', color:'#ddd6fe', domain:'architecture', description:'Componente 3D ou de catálogo',    schema:['name','sku','category']             },
  Manufacturer:  { type:'Manufacturer',  icon:'🏭', color:'#f59e0b', domain:'commerce',     description:'Fabricante de materiais',         schema:['name','country','website']          },
  Supplier:      { type:'Supplier',      icon:'🚚', color:'#fbbf24', domain:'commerce',     description:'Fornecedor ou revendedor',        schema:['name','region','contact']           },
  Brand:         { type:'Brand',         icon:'⭐', color:'#fcd34d', domain:'commerce',     description:'Marca de produto',               schema:['name','segment','tier']             },
  Customer:      { type:'Customer',      icon:'🤝', color:'#4ade80', domain:'crm',          description:'Cliente final',                  schema:['name','email','phone','company']     },
  Lead:          { type:'Lead',          icon:'🎯', color:'#34d399', domain:'crm',          description:'Lead no pipeline CRM',           schema:['name','stage','value','source']     },
  Deal:          { type:'Deal',          icon:'💼', color:'#6ee7b7', domain:'crm',          description:'Negócio em andamento',            schema:['title','value','stage','probability']},
  Proposal:      { type:'Proposal',      icon:'📄', color:'#a7f3d0', domain:'crm',          description:'Proposta comercial',             schema:['title','value','validUntil']        },
  Workflow:      { type:'Workflow',      icon:'🔄', color:'#38bdf8', domain:'workflow',     description:'Fluxo de trabalho automatizado',  schema:['name','steps','status']             },
  Task:          { type:'Task',          icon:'✅', color:'#7dd3fc', domain:'workflow',     description:'Tarefa do workflow',             schema:['title','status','priority','due']   },
  Document:      { type:'Document',      icon:'📋', color:'#93c5fd', domain:'workflow',     description:'Documento ou memorial',          schema:['title','type','url']                },
  Asset:         { type:'Asset',         icon:'🖼️', color:'#bae6fd', domain:'creative',    description:'Asset digital (imagem, 3D)',     schema:['name','type','url','size']          },
  Prompt:        { type:'Prompt',        icon:'⚡', color:'#e879f9', domain:'creative',    description:'Prompt de geração de render',    schema:['text','negativePrompt','tokens']    },
  Render:        { type:'Render',        icon:'🎬', color:'#d946ef', domain:'creative',    description:'Imagem renderizada',             schema:['url','model','fidelity','status']   },
  Review:        { type:'Review',        icon:'🔍', color:'#c026d3', domain:'creative',    description:'Revisão de render pelo AI',      schema:['score','feedback','approved']       },
  DNA:           { type:'DNA',           icon:'🧬', color:'#f472b6', domain:'creative',    description:'DNA do projeto (estilo, paleta)',schema:['style','language','atmosphere','palette']},
  Style:         { type:'Style',         icon:'🎨', color:'#fb7185', domain:'creative',    description:'Estilo arquitetônico ou design', schema:['name','tags','characteristics']    },
  Moodboard:     { type:'Moodboard',     icon:'🗂️', color:'#fda4af', domain:'creative',    description:'Moodboard de referências',       schema:['name','images','keywords']         },
  Budget:        { type:'Budget',        icon:'💰', color:'#86efac', domain:'commerce',     description:'Orçamento do projeto',           schema:['total','currency','approvedAt']     },
  Purchase:      { type:'Purchase',      icon:'🛒', color:'#4ade80', domain:'commerce',     description:'Compra ou pedido',              schema:['items','total','status','supplier']  },
  Construction:  { type:'Construction',  icon:'⚒️', color:'#f97316', domain:'workflow',     description:'Fase de execução de obra',       schema:['status','progress','startDate']     },
  Agent:         { type:'Agent',         icon:'🤖', color:'#94a3b8', domain:'knowledge',   description:'Agente IA da plataforma',        schema:['name','type','model','capabilities']},
  Knowledge:     { type:'Knowledge',     icon:'📚', color:'#cbd5e1', domain:'knowledge',   description:'Fragmento de conhecimento',      schema:['title','content','tags','source']   },
}

// ─── Relationship metadata ────────────────────────────────────────────────────

export interface RelationshipMeta {
  type:        RelationshipType
  description: string
  bidirectional: boolean
  defaultWeight: number
}

export const RELATIONSHIP_TAXONOMY: Record<RelationshipType, RelationshipMeta> = {
  USES:            { type:'USES',            description:'Utiliza / Emprega',                 bidirectional:false, defaultWeight:0.9 },
  CONTAINS:        { type:'CONTAINS',        description:'Contém / Possui',                   bidirectional:false, defaultWeight:1.0 },
  PART_OF:         { type:'PART_OF',         description:'Faz parte de',                      bidirectional:false, defaultWeight:1.0 },
  RELATED_TO:      { type:'RELATED_TO',      description:'Relacionado a',                     bidirectional:true,  defaultWeight:0.5 },
  SIMILAR_TO:      { type:'SIMILAR_TO',      description:'Similar a / Parecido com',          bidirectional:true,  defaultWeight:0.7 },
  GENERATED_BY:    { type:'GENERATED_BY',    description:'Gerado por / Criado por motor',     bidirectional:false, defaultWeight:0.9 },
  APPROVED_BY:     { type:'APPROVED_BY',     description:'Aprovado por',                      bidirectional:false, defaultWeight:1.0 },
  PURCHASED_FROM:  { type:'PURCHASED_FROM',  description:'Comprado de / Adquirido de',        bidirectional:false, defaultWeight:0.8 },
  RENDERED_WITH:   { type:'RENDERED_WITH',   description:'Renderizado com',                   bidirectional:false, defaultWeight:0.8 },
  CONNECTED_TO:    { type:'CONNECTED_TO',    description:'Conectado a',                       bidirectional:true,  defaultWeight:0.6 },
  LOCATED_IN:      { type:'LOCATED_IN',      description:'Localizado em',                     bidirectional:false, defaultWeight:1.0 },
  BELONGS_TO:      { type:'BELONGS_TO',      description:'Pertence a',                        bidirectional:false, defaultWeight:1.0 },
  CREATED_BY:      { type:'CREATED_BY',      description:'Criado por usuário ou agente',      bidirectional:false, defaultWeight:1.0 },
  UPDATED_BY:      { type:'UPDATED_BY',      description:'Atualizado por',                    bidirectional:false, defaultWeight:0.7 },
  REFERENCES:      { type:'REFERENCES',      description:'Referencia / Cita',                 bidirectional:false, defaultWeight:0.6 },
  INSTALLED_BY:    { type:'INSTALLED_BY',    description:'Instalado por fornecedor',          bidirectional:false, defaultWeight:0.8 },
  ASSOCIATED_WITH: { type:'ASSOCIATED_WITH', description:'Associado a',                       bidirectional:true,  defaultWeight:0.5 },
  INFLUENCED_BY:   { type:'INFLUENCED_BY',   description:'Influenciado por',                  bidirectional:false, defaultWeight:0.6 },
  FOLLOWS:         { type:'FOLLOWS',         description:'Segue / Sucede',                    bidirectional:false, defaultWeight:0.8 },
  TRIGGERS:        { type:'TRIGGERS',        description:'Dispara / Ativa',                   bidirectional:false, defaultWeight:0.9 },
}

// ─── Domain color palette ─────────────────────────────────────────────────────

export const DOMAIN_COLORS: Record<NodeTypeMeta['domain'], string> = {
  identity:     '#818cf8',
  architecture: '#7c3aed',
  commerce:     '#f59e0b',
  crm:          '#4ade80',
  workflow:     '#38bdf8',
  creative:     '#e879f9',
  knowledge:    '#94a3b8',
}
