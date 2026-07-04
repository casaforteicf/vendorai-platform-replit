import { useState } from 'react'
import { T } from '../../shared/arqdor-theme'

type AITranslatorStatus = 'ACTIVE' | 'PLANNED' | 'DISABLED'
type AITranslatorType   = 'IMAGE_GEN' | 'TEXT_GEN' | 'REVIEW' | 'CORRECTION' | 'MEMORY' | 'PROMPT'

interface AITranslator {
  id:           string
  name:         string
  provider:     string
  type:         AITranslatorType
  status:       AITranslatorStatus
  icon:         string
  description:  string
  capabilities: string[]
  configKeys:   string[]
}

const STATUS_COLOR: Record<AITranslatorStatus, string> = { ACTIVE:'#4ade80', PLANNED:'#fbbf24', DISABLED:'#f87171' }
const STATUS_LABEL: Record<AITranslatorStatus, string> = { ACTIVE:'Ativo', PLANNED:'Planejado', DISABLED:'Desativado' }
const TYPE_LABELS:  Record<AITranslatorType, string>   = {
  IMAGE_GEN:'Geração de Imagem', TEXT_GEN:'Geração de Texto',
  REVIEW:'Revisão', CORRECTION:'Correção', MEMORY:'Memória', PROMPT:'Prompt',
}
const TYPE_ICONS: Record<AITranslatorType, string> = {
  IMAGE_GEN:'🎨', TEXT_GEN:'📝', REVIEW:'🔍', CORRECTION:'🔄', MEMORY:'🧠', PROMPT:'⚡',
}

const AI_REGISTRY: AITranslator[] = [
  { id:'flux-kontext',  name:'Flux Kontext Pro',      provider:'Replicate', type:'IMAGE_GEN',  status:'ACTIVE',   icon:'⚡', description:'Motor de preservação — edição por instrução sem máscara. Modo Preservar do pipeline.',      capabilities:['Edição por instrução de texto','Preservação de geometria e materiais','Sem máscara necessária'],                     configKeys:['REPLICATE_API_TOKEN'] },
  { id:'flux-ultra',    name:'Flux 1.1 Pro Ultra',    provider:'Replicate', type:'IMAGE_GEN',  status:'ACTIVE',   icon:'🚀', description:'Motor de criação — geração livre raw:true. Modo Criar do pipeline.',                         capabilities:['Geração desde zero','Alta qualidade 4K','Modo raw para renders fotorrealistas'],                                   configKeys:['REPLICATE_API_TOKEN'] },
  { id:'flux-fill',     name:'Flux Fill Pro',         provider:'Replicate', type:'CORRECTION', status:'ACTIVE',   icon:'🎯', description:'Motor de ajuste pontual — inpainting com máscara. Ajuste pós-geração.',                      capabilities:['Inpainting por zona','Máscara automática por área','Preserva contexto externo à máscara'],                         configKeys:['REPLICATE_API_TOKEN'] },
  { id:'gpt-image',     name:'GPT Image 1',           provider:'OpenAI',    type:'IMAGE_GEN',  status:'ACTIVE',   icon:'🎨', description:'Geração de imagens via OpenAI. Retorna base64, upload para object storage.',                  capabilities:['Geração de referências visuais','Criação de variações','Upload automático para storage'],                          configKeys:['OPENAI_API_KEY'] },
  { id:'gpt4o',         name:'GPT-4o',                provider:'OpenAI',    type:'PROMPT',     status:'ACTIVE',   icon:'📝', description:'Motor de geração de prompts e análise de DNA do projeto via callOpenAI.',                    capabilities:['Geração de prompts FLUX','Análise de DNA do projeto','Extração de especificações'],                              configKeys:['OPENAI_API_KEY'] },
  { id:'anthropic',     name:'Claude (Anthropic)',    provider:'Anthropic', type:'REVIEW',     status:'PLANNED',  icon:'🔍', description:'Análise de renders e revisão crítica de conformidade com o briefing.',                       capabilities:['Análise comparativa render vs briefing','Detecção de divergências','Sugestões de correção'],                      configKeys:['ANTHROPIC_API_KEY'] },
  { id:'gemini-vision', name:'Gemini Vision',         provider:'Google',    type:'REVIEW',     status:'PLANNED',  icon:'👁️', description:'Reconhecimento de materiais e estilos via visão computacional.',                            capabilities:['Identificação de materiais','Classificação de estilos','Extração de paleta de cores'],                             configKeys:['GEMINI_API_KEY'] },
  { id:'arch-memory',   name:'ARQ Memory Engine',     provider:'Interno',   type:'MEMORY',     status:'ACTIVE',   icon:'🧠', description:'Sistema de memória AIE — aprende preferências por projeto via snapshots.',                   capabilities:['Armazenamento de snapshots AIE','Histórico de scores por projeto','Extração de preferências recorrentes'],         configKeys:[] },
  { id:'arch-prompt',   name:'Prompt Domain Engine',  provider:'Interno',   type:'PROMPT',     status:'ACTIVE',   icon:'⚡', description:'Motor de geração de prompts baseado em domínio arquitetônico.',                              capabilities:['Prompt para modo Preservar','Prompt para modo Criar','Variações e rascunhos'],                                     configKeys:[] },
]

const ALL_TYPES = [...new Set(AI_REGISTRY.map(a => a.type))] as AITranslatorType[]

function AiCard({ a, selected, onSelect }: { a: AITranslator; selected: boolean; onSelect: ()=>void }) {
  return (
    <div onClick={onSelect} style={{ cursor:'pointer', borderRadius:10, border:`1px solid ${selected?'rgba(124,58,237,0.5)':T.border}`, background:selected?'rgba(124,58,237,0.07)':T.surface, padding:14, transition:'border 0.15s' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <span style={{ fontSize:26 }}>{a.icon}</span>
        <span style={{ fontSize:9, padding:'2px 7px', borderRadius:6, background:`${STATUS_COLOR[a.status]}15`, color:STATUS_COLOR[a.status], fontWeight:700 }}>{STATUS_LABEL[a.status]}</span>
      </div>
      <p style={{ margin:'0 0 2px', fontSize:12, fontWeight:800, color:'#fff' }}>{a.name}</p>
      <p style={{ margin:'0 0 8px', fontSize:9, color:T.dim }}>{a.provider}</p>
      <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
        <span style={{ fontSize:8, padding:'2px 7px', borderRadius:6, background:'rgba(124,58,237,0.1)', color:T.purpleL }}>
          {TYPE_ICONS[a.type]} {TYPE_LABELS[a.type]}
        </span>
      </div>
    </div>
  )
}

function AiDetail({ a }: { a: AITranslator }) {
  return (
    <div style={{ height:'100%', overflowY:'auto' as const, padding:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
        <span style={{ fontSize:40 }}>{a.icon}</span>
        <div>
          <p style={{ margin:'0 0 3px', fontSize:14, fontWeight:900, color:'#fff' }}>{a.name}</p>
          <p style={{ margin:'0 0 4px', fontSize:10, color:T.dim }}>{a.provider}</p>
          <span style={{ fontSize:9, padding:'2px 8px', borderRadius:6, background:`${STATUS_COLOR[a.status]}15`, color:STATUS_COLOR[a.status], fontWeight:700 }}>{STATUS_LABEL[a.status]}</span>
        </div>
      </div>

      <p style={{ margin:'0 0 14px', fontSize:11, color:T.text, lineHeight:1.65 }}>{a.description}</p>

      <div style={{ padding:'8px 10px', borderRadius:7, background:'rgba(124,58,237,0.06)', border:'1px solid rgba(124,58,237,0.2)', marginBottom:14 }}>
        <p style={{ margin:'0 0 3px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>TIPO DE TRADUTOR</p>
        <p style={{ margin:0, fontSize:11, color:T.purpleL }}>{TYPE_ICONS[a.type]} {TYPE_LABELS[a.type]}</p>
      </div>

      <div style={{ marginBottom:12 }}>
        <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>CAPACIDADES</p>
        {a.capabilities.map(c => (
          <div key={c} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom:`1px solid ${T.border}` }}>
            <span style={{ color:'#4ade80', fontSize:11 }}>✓</span>
            <span style={{ fontSize:11, color:T.text }}>{c}</span>
          </div>
        ))}
      </div>

      {a.configKeys.length > 0 ? (
        <div style={{ marginBottom:14 }}>
          <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>CHAVES DE CONFIGURAÇÃO</p>
          {a.configKeys.map(k => (
            <div key={k} style={{ padding:'6px 10px', borderRadius:6, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, marginBottom:4 }}>
              <span style={{ fontSize:10, fontFamily:'monospace', color:'#fbbf24' }}>{k}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding:'8px 10px', borderRadius:7, background:'rgba(74,222,128,0.06)', border:'1px solid rgba(74,222,128,0.15)', marginBottom:14 }}>
          <p style={{ margin:0, fontSize:10, color:'#4ade80' }}>✓ Integração interna — sem chave necessária</p>
        </div>
      )}

      <div style={{ padding:'10px 12px', borderRadius:7, background:'rgba(255,255,255,0.02)', border:`1px solid ${T.border}` }}>
        <p style={{ margin:'0 0 4px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>STATUS DA INTEGRAÇÃO</p>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:STATUS_COLOR[a.status] }}/>
          <span style={{ fontSize:11, color:STATUS_COLOR[a.status], fontWeight:700 }}>{STATUS_LABEL[a.status]}</span>
          {a.status === 'PLANNED' && <span style={{ fontSize:10, color:T.dim }}>— Sem integração ativa ainda</span>}
        </div>
      </div>
    </div>
  )
}

export function AiHubView() {
  const [typeFilter,   setTypeFilter]   = useState<AITranslatorType|''>('')
  const [statusFilter, setStatusFilter] = useState<AITranslatorStatus|''>('')
  const [query,        setQuery]        = useState('')
  const [sel,          setSel]          = useState<AITranslator|null>(AI_REGISTRY[0])

  const filtered = AI_REGISTRY.filter(a => {
    if (typeFilter   && a.type   !== typeFilter)   return false
    if (statusFilter && a.status !== statusFilter) return false
    if (query) { const q=query.toLowerCase(); return a.name.toLowerCase().includes(q) || a.provider.toLowerCase().includes(q) }
    return true
  })

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const }}>
      <div style={{ padding:'8px 16px', background:'rgba(251,191,36,0.05)', borderBottom:`1px solid rgba(251,191,36,0.15)`, flexShrink:0 }}>
        <p style={{ margin:0, fontSize:10, color:'#fbbf24' }}>
          ⚡ <strong>Motores ativos:</strong> Flux Kontext Pro, Flux 1.1 Ultra, Flux Fill, GPT-4o, GPT Image 1. Tradutores "Planejado" aguardam integração.
        </p>
      </div>

      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', gap:8, flexWrap:'wrap' as const }}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar tradutor…"
          style={{ flex:1, minWidth:120, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, padding:'5px 10px', outline:'none' }}/>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value as AITranslatorType|'')}
          style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:typeFilter?T.text:T.dim, fontSize:10, padding:'5px 8px', cursor:'pointer' }}>
          <option value=''>Tipo</option>
          {ALL_TYPES.map(t=><option key={t} value={t}>{TYPE_ICONS[t]} {TYPE_LABELS[t]}</option>)}
        </select>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value as AITranslatorStatus|'')}
          style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:statusFilter?T.text:T.dim, fontSize:10, padding:'5px 8px', cursor:'pointer' }}>
          <option value=''>Status</option>
          <option value='ACTIVE'>Ativo</option>
          <option value='PLANNED'>Planejado</option>
          <option value='DISABLED'>Desativado</option>
        </select>
        <span style={{ fontSize:10, color:T.dim, alignSelf:'center' }}>{filtered.length} tradutores</span>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <div style={{ flex:1, overflowY:'auto' as const, padding:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
            {filtered.map(a=><AiCard key={a.id} a={a} selected={sel?.id===a.id} onSelect={()=>setSel(a)}/>)}
          </div>
        </div>
        {sel && <div style={{ width:300, flexShrink:0, borderLeft:`1px solid ${T.border}` }}><AiDetail a={sel}/></div>}
      </div>
    </div>
  )
}
