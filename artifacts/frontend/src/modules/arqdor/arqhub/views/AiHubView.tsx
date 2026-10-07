import { useEffect, useMemo, useState } from 'react'
import { T } from '../../shared/arqdor-theme'

type AIRegistryState = 'DECLARED' | 'PLANNED'
type AITranslatorType = 'IMAGE_GEN' | 'REVIEW' | 'CORRECTION' | 'MEMORY' | 'PROMPT'
type HealthState = 'healthy' | 'degraded' | 'unverified' | 'unavailable' | 'local'

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

  last_failure_at?: string | null
  recent_requests?: number
  recent_failures?: number
  last_model?: string | null
}

interface AiHealthResponse {
  success: boolean
  observed_window_hours: number
  providers?: {
    openai?: HealthEntry
    anthropic?: HealthEntry
  }
  features?: {
    fidelity_review?: HealthEntry
    project_memory?: HealthEntry
  }
}

interface HealthEntry {
  state: HealthState
  configured?: boolean
  last_success_at?: string | null
  last_failure_at?: string | null
  recent_requests?: number
  recent_failures?: number
  last_model?: string | null
}

interface AiHealthResponse {
  success: boolean
  observed_window_hours: number
  providers?: {
    openai?: HealthEntry
    anthropic?: HealthEntry
  }
  features?: {
    fidelity_review?: HealthEntry
    project_memory?: HealthEntry
  }
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

  unavailable:'Não configurado',
  local:'Interno',
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('vendorai_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function healthFor(item: AITranslator, health: AiHealthResponse | null): HealthEntry | null {
  if (!health || item.state === 'PLANNED') return null
  if (item.id === 'fidelity-review') return health.features?.fidelity_review ?? null
  if (item.id === 'project-memory') return health.features?.project_memory ?? null
  if (item.id === 'gpt-image' || item.id === 'openai-prompt') return health.providers?.openai ?? null
  return null
}

function healthColor(state?: HealthState) {
  if (state === 'healthy' || state === 'local') return '#4ade80'
  if (state === 'degraded') return '#f87171'
  if (state === 'unavailable') return '#fb7185'
  return '#fbbf24'
}

const HEALTH_LABEL: Record<HealthState,string> = {
  healthy:'Saudável',
  degraded:'Degradado',
  unverified:'Sem telemetria recente',
  unavailable:'Não configurado',
  local:'Interno',
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('vendorai_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function healthFor(item: AITranslator, health: AiHealthResponse | null): HealthEntry | null {
  if (!health || item.state === 'PLANNED') return null
  if (item.id === 'fidelity-review') return health.features?.fidelity_review ?? null
  if (item.id === 'project-memory') return health.features?.project_memory ?? null
  if (item.id === 'gpt-image' || item.id === 'openai-prompt') return health.providers?.openai ?? null
  return null
}

function healthColor(state?: HealthState) {
  if (state === 'healthy' || state === 'local') return '#4ade80'
  if (state === 'degraded') return '#f87171'
  if (state === 'unavailable') return '#fb7185'
  return '#fbbf24'
}

export function AiHubView() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<AITranslator | null>(REGISTRY[0] ?? null)
  useEffect(() => {
    let cancelled = false
    setHealthLoading(true)
    fetch('/api/arch/ai-health', { headers: authHeaders() })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
        return data as AiHealthResponse
      })
      .then((data) => {
        if (!cancelled) {
          setHealth(data)
          setHealthError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) setHealthError(err instanceof Error ? err.message : 'Falha ao carregar telemetria')
      .finally(() => {
        if (!cancelled) setHealthLoading(false)
      })
    return () => { cancelled = true }
  }, [])
  const [health, setHealth] = useState<AiHealthResponse | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setHealthLoading(true)
    fetch('/api/arch/ai-health', { headers: authHeaders() })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
        return data as AiHealthResponse
      })
      .then((data) => {
        if (!cancelled) {
          setHealth(data)
          setHealthError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) setHealthError(err instanceof Error ? err.message : 'Falha ao carregar telemetria')
      })
      .finally(() => {
        if (!cancelled) setHealthLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return REGISTRY
    return REGISTRY.filter((item) => [item.name,item.provider,item.description,TYPE_LABEL[item.type]].some(v=>v.toLowerCase().includes(q)))
  }, [query])

  const selectedHealth = selected ? healthFor(selected, health) : null

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' }}>
            : healthError
              ? `Telemetria indisponível: ${healthError}`
              : `Saúde baseada em configuração e chamadas reais das últimas ${health?.observed_window_hours ?? 24}h. Sem tráfego recente, o estado fica “Sem telemetria recente”.`}
      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, background:'rgba(74,222,128,0.035)' }}>
        <p style={{ margin:0, fontSize:10, color:healthError ? '#f87171' : T.dim }}>
          {healthLoading
            ? 'Carregando telemetria real do AI Gateway…'
            : healthError
              ? `Telemetria indisponível: ${healthError}`
              : `Saúde baseada em configuração e chamadas reais das últimas ${health?.observed_window_hours ?? 24}h. Sem tráfego recente, o estado fica “Sem telemetria recente”.`}
        </p>
      </div>

      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, display:'flex', gap:8, alignItems:'center' }}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar integração…" style={{ flex:1, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, padding:'6px 10px', outline:'none' }}/>
        <span style={{ fontSize:10, color:T.dim }}>{filtered.length} integrações</span>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <div style={{ flex:1, overflowY:'auto', padding:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
                  <span style={{ fontSize:24 }}>{item.icon}</span>
                  <span style={{ fontSize:9, padding:'2px 7px', borderRadius:6, background:item.state==='PLANNED'?'rgba(251,191,36,0.10)':`${healthColor(itemHealth?.state)}18`, color:item.state==='PLANNED'?'#fbbf24':healthColor(itemHealth?.state), fontWeight:700 }}>
                    {item.state==='PLANNED' ? 'Planejado' : itemHealth ? HEALTH_LABEL[itemHealth.state] : 'Declarado'}
                  </span>
                </div>
                <p style={{ margin:'9px 0 2px', fontSize:12, fontWeight:800, color:'#fff' }}>{item.name}</p>
                <p style={{ margin:0, fontSize:9, color:T.dim }}>{item.provider} · {TYPE_LABEL[item.type]}</p>
              </button>
            })}
            {filtered.map((item)=>{
              const itemHealth = healthFor(item, health)
              return <button key={item.id} onClick={()=>setSelected(item)} style={{ textAlign:'left', cursor:'pointer', padding:14, borderRadius:10, border:`1px solid ${selected?.id===item.id?'rgba(124,58,237,0.5)':T.border}`, background:selected?.id===item.id?'rgba(124,58,237,0.07)':T.surface }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                  <span style={{ fontSize:24 }}>{item.icon}</span>
                  <span style={{ fontSize:9, padding:'2px 7px', borderRadius:6, background:item.state==='PLANNED'?'rgba(251,191,36,0.10)':`${healthColor(itemHealth?.state)}18`, color:item.state==='PLANNED'?'#fbbf24':healthColor(itemHealth?.state), fontWeight:700 }}>
                    {item.state==='PLANNED' ? 'Planejado' : itemHealth ? HEALTH_LABEL[itemHealth.state] : 'Declarado'}
                  </span>
                </div>
                <p style={{ margin:'9px 0 2px', fontSize:12, fontWeight:800, color:'#fff' }}>{item.name}</p>
                <p style={{ margin:0, fontSize:9, color:T.dim }}>{item.provider} · {TYPE_LABEL[item.type]}</p>
              </button>
            })}
          </div>
        </div>

        {selected && <aside style={{ width:310, flexShrink:0, borderLeft:`1px solid ${T.border}`, padding:16, overflowY:'auto' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}><span style={{ fontSize:36 }}>{selected.icon}</span><div><h3 style={{ margin:0, fontSize:14, color:'#fff' }}>{selected.name}</h3><p style={{ margin:'3px 0 0', fontSize:10, color:T.dim }}>{selected.provider}</p></div></div>
          <p style={{ margin:'14px 0', fontSize:11, lineHeight:1.65, color:T.text }}>{selected.description}</p>
          <p style={{ margin:'0 0 6px', fontSize:9, color:T.dim, fontWeight:700 }}>CAPACIDADES DECLARADAS</p>
          {selected.capabilities.map((cap)=><div key={cap} style={{ padding:'6px 0', borderBottom:`1px solid ${T.border}`, fontSize:10, color:T.text }}>• {cap}</div>)}
              {selectedHealth ? <>
                <p style={{ margin:0, fontSize:11, fontWeight:800, color:healthColor(selectedHealth.state) }}>{HEALTH_LABEL[selectedHealth.state]}</p>
                {selectedHealth.configured !== undefined && <p style={{ margin:'5px 0 0', fontSize:10, color:T.dim }}>Configuração: {selectedHealth.configured ? 'disponível' : 'ausente'}</p>}
                {selectedHealth.recent_requests !== undefined && <p style={{ margin:'3px 0 0', fontSize:10, color:T.dim }}>24h: {selectedHealth.recent_requests} chamadas · {selectedHealth.recent_failures ?? 0} falhas</p>}
                {selectedHealth.last_success_at && <p style={{ margin:'3px 0 0', fontSize:10, color:T.dim }}>Último sucesso: {new Date(selectedHealth.last_success_at).toLocaleString('pt-BR')}</p>}
                {selectedHealth.last_failure_at && <p style={{ margin:'3px 0 0', fontSize:10, color:T.dim }}>Última falha: {new Date(selectedHealth.last_failure_at).toLocaleString('pt-BR')}</p>}
                {selectedHealth.last_model && <p style={{ margin:'3px 0 0', fontSize:10, color:T.dim }}>Modelo observado: {selectedHealth.last_model}</p>}
              </> : <p style={{ margin:0, fontSize:10, color:T.dim }}>Sem telemetria operacional disponível para esta integração.</p>}
            </div>
          )}

          {selected.state === 'DECLARED' && (
            <div style={{ marginTop:16, padding:10, borderRadius:7, border:`1px solid ${T.border}`, background:'rgba(255,255,255,0.03)' }}>
              <p style={{ margin:'0 0 6px', fontSize:9, color:T.dim, fontWeight:700 }}>SAÚDE OBSERVADA</p>
              {selectedHealth ? <>
                <p style={{ margin:0, fontSize:11, fontWeight:800, color:healthColor(selectedHealth.state) }}>{HEALTH_LABEL[selectedHealth.state]}</p>
                {selectedHealth.configured !== undefined && <p style={{ margin:'5px 0 0', fontSize:10, color:T.dim }}>Configuração: {selectedHealth.configured ? 'disponível' : 'ausente'}</p>}
                {selectedHealth.recent_requests !== undefined && <p style={{ margin:'3px 0 0', fontSize:10, color:T.dim }}>24h: {selectedHealth.recent_requests} chamadas · {selectedHealth.recent_failures ?? 0} falhas</p>}
                {selectedHealth.last_success_at && <p style={{ margin:'3px 0 0', fontSize:10, color:T.dim }}>Último sucesso: {new Date(selectedHealth.last_success_at).toLocaleString('pt-BR')}</p>}
                {selectedHealth.last_failure_at && <p style={{ margin:'3px 0 0', fontSize:10, color:T.dim }}>Última falha: {new Date(selectedHealth.last_failure_at).toLocaleString('pt-BR')}</p>}
                {selectedHealth.last_model && <p style={{ margin:'3px 0 0', fontSize:10, color:T.dim }}>Modelo observado: {selectedHealth.last_model}</p>}
              </> : <p style={{ margin:0, fontSize:10, color:T.dim }}>Sem telemetria operacional disponível para esta integração.</p>}
            </div>
          )}
        </aside>}
      </div>
    </div>
  )
}
