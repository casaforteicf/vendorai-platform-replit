import { useMemo, useState } from 'react'
import { T } from '../../shared/arqdor-theme'

type AIRegistryState = 'DECLARED' | 'PLANNED'
type AITranslatorType = 'IMAGE_GEN' | 'REVIEW' | 'CORRECTION' | 'MEMORY' | 'PROMPT'

interface AITranslator {
  id: string
  name: string
  provider: string
  type: AITranslatorType
  state: AIRegistryState
  icon: string
  description: string
  capabilities: string[]
}

const REGISTRY: AITranslator[] = [
  { id:'gpt-image', name:'Render Premium', provider:'OpenAI', type:'IMAGE_GEN', state:'DECLARED', icon:'✨', description:'Motor oficial do Arqdor para preservação, criação e ajustes de render.', capabilities:['Preservação arquitetônica','Geração fotorealista','Ajuste localizado'] },
  { id:'openai-prompt', name:'OpenAI via AI Gateway', provider:'OpenAI', type:'PROMPT', state:'DECLARED', icon:'📝', description:'Integração declarada para prompts, análise e Copilot conforme feature do gateway.', capabilities:['Prompt','Análise de projeto','Copilot'] },
  { id:'fidelity-review', name:'Fidelity / AI Review', provider:'AI Gateway', type:'REVIEW', state:'DECLARED', icon:'🔍', description:'Análise visual real base × versão, persistida por render.', capabilities:['Comparação visual','Evidências','Confidence por dimensão'] },
  { id:'project-memory', name:'ARQ Project Memory', provider:'Interno', type:'MEMORY', state:'DECLARED', icon:'🧠', description:'Contexto persistente do Workspace + trocas reais do Copilot.', capabilities:['Project DNA','Memória por projeto','Histórico do Copilot'] },
  { id:'gemini-vision', name:'Gemini Vision', provider:'Google', type:'REVIEW', state:'PLANNED', icon:'👁️', description:'Integração futura; não apresentada como disponível.', capabilities:['Visão computacional'] },
]

const TYPE_LABEL: Record<AITranslatorType,string> = {
  IMAGE_GEN:'Imagem', REVIEW:'Review', CORRECTION:'Correção', MEMORY:'Memória', PROMPT:'Prompt/Copilot',
}

export function AiHubView() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<AITranslator | null>(REGISTRY[0] ?? null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return REGISTRY
    return REGISTRY.filter((item) => [item.name,item.provider,item.description,TYPE_LABEL[item.type]].some(v=>v.toLowerCase().includes(q)))
  }, [query])

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, background:'rgba(251,191,36,0.04)' }}>
        <p style={{ margin:0, fontSize:10, color:'#fbbf24' }}>
          Este painel mostra <strong>integrações declaradas no produto</strong>, não health-check em tempo real. “Declarado” não significa que a credencial/provedor está saudável agora.
        </p>
      </div>

      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, display:'flex', gap:8, alignItems:'center' }}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar integração…" style={{ flex:1, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, padding:'6px 10px', outline:'none' }}/>
        <span style={{ fontSize:10, color:T.dim }}>{filtered.length} integrações</span>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <div style={{ flex:1, overflowY:'auto', padding:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
            {filtered.map((item)=><button key={item.id} onClick={()=>setSelected(item)} style={{ textAlign:'left', cursor:'pointer', padding:14, borderRadius:10, border:`1px solid ${selected?.id===item.id?'rgba(124,58,237,0.5)':T.border}`, background:selected?.id===item.id?'rgba(124,58,237,0.07)':T.surface }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}><span style={{ fontSize:24 }}>{item.icon}</span><span style={{ fontSize:9, padding:'2px 7px', borderRadius:6, background:item.state==='DECLARED'?'rgba(74,222,128,0.10)':'rgba(251,191,36,0.10)', color:item.state==='DECLARED'?'#4ade80':'#fbbf24', fontWeight:700 }}>{item.state==='DECLARED'?'Declarado':'Planejado'}</span></div>
              <p style={{ margin:'9px 0 2px', fontSize:12, fontWeight:800, color:'#fff' }}>{item.name}</p>
              <p style={{ margin:0, fontSize:9, color:T.dim }}>{item.provider} · {TYPE_LABEL[item.type]}</p>
            </button>)}
          </div>
        </div>

        {selected && <aside style={{ width:310, flexShrink:0, borderLeft:`1px solid ${T.border}`, padding:16, overflowY:'auto' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}><span style={{ fontSize:36 }}>{selected.icon}</span><div><h3 style={{ margin:0, fontSize:14, color:'#fff' }}>{selected.name}</h3><p style={{ margin:'3px 0 0', fontSize:10, color:T.dim }}>{selected.provider}</p></div></div>
          <p style={{ margin:'14px 0', fontSize:11, lineHeight:1.65, color:T.text }}>{selected.description}</p>
          <p style={{ margin:'0 0 6px', fontSize:9, color:T.dim, fontWeight:700 }}>CAPACIDADES DECLARADAS</p>
          {selected.capabilities.map((cap)=><div key={cap} style={{ padding:'6px 0', borderBottom:`1px solid ${T.border}`, fontSize:10, color:T.text }}>• {cap}</div>)}
          <div style={{ marginTop:16, padding:10, borderRadius:7, border:`1px solid ${T.border}`, background:'rgba(255,255,255,0.03)' }}>
            <p style={{ margin:0, fontSize:10, color:T.dim }}>Saúde do provedor, credencial e quota devem ser verificadas pelo gateway/observabilidade; esta tela não inventa estado operacional.</p>
          </div>
        </aside>}
      </div>
    </div>
  )
}
