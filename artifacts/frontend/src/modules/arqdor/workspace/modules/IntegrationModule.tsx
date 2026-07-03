import { useState } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'
import { HUB_META, MOCK_AGENTS, MOCK_WORKFLOWS, MOCK_ANALYTICS, MOCK_VENDOR_TASKS, MOCK_KNOWLEDGE, MOCK_FILES, MOCK_PROJECT_CRM } from '../../integrations/mock/integration-mock-data'
import type { HubId, AgentSpec } from '../../integrations/integration-types'
import { T } from '../../shared/arqdor-theme'


type TabId = 'overview' | 'crm' | 'agents' | 'workflows' | 'analytics' | 'tasks' | 'knowledge' | 'files'

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id:'overview',   label:'Overview',     icon:'🌐' },
  { id:'crm',        label:'CRM',          icon:'🤝' },
  { id:'agents',     label:'Agentes',      icon:'🤖' },
  { id:'workflows',  label:'Workflows',    icon:'⚡' },
  { id:'analytics',  label:'Analytics',    icon:'📊' },
  { id:'tasks',      label:'Tasks',        icon:'✅' },
  { id:'knowledge',  label:'Knowledge',    icon:'📚' },
  { id:'files',      label:'Files',        icon:'📁' },
]

// ─── Hub status grid ──────────────────────────────────────────────────────────

function HubStatusGrid() {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:8 }}>
      {HUB_META.map(hub => (
        <div key={hub.id} style={{
          padding:'12px', borderRadius:9, border:`1px solid ${hub.connected?'rgba(124,58,237,0.25)':T.border}`,
          background:hub.connected?'rgba(124,58,237,0.05)':T.surface,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <span style={{ fontSize:20 }}>{hub.icon}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ margin:0, fontSize:10, fontWeight:700, color:hub.connected?'#fff':T.dim }}>{hub.label}</p>
              <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:2 }}>
                <div style={{ width:6, height:6, borderRadius:'50%', background:hub.connected?'#4ade80':'#475569' }}/>
                <span style={{ fontSize:8, color:hub.connected?'#4ade80':'#475569', fontWeight:700 }}>{hub.connected?'CONECTADO':'PENDENTE'}</span>
              </div>
            </div>
          </div>
          <p style={{ margin:0, fontSize:8, color:T.dim, lineHeight:1.4 }}>{hub.description}</p>
        </div>
      ))}
    </div>
  )
}

// ─── CRM tab ──────────────────────────────────────────────────────────────────

const ETAPA_COLOR: Record<string, string> = {
  em_aquecimento:'#60a5fa', novo:'#a78bfa', qualificado:'#fbbf24',
  proposta:'#fb923c', negociacao:'#f87171', ganho:'#4ade80', perdido:'#475569',
}

function CrmTab() {
  const { lead, deal } = MOCK_PROJECT_CRM

  return (
    <div style={{ display:'flex', flexDirection:'column' as const, gap:12 }}>
      {/* Em desenvolvimento — P1-003 */}
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 10px', borderRadius:6, background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.2)', marginBottom:8 }}>
        <span style={{ fontSize:10 }}>⚠️</span>
        <span style={{ fontSize:9, color:'#fbbf24', fontWeight:700 }}>EM DESENVOLVIMENTO</span>
        <span style={{ fontSize:8, color:'rgba(251,191,36,0.6)' }}>— dados demonstrativos; adapter real em progresso</span>
      </div>
      <div style={{ padding:'12px', borderRadius:9, background:T.surface, border:`1px solid ${T.border}` }}>
        <p style={{ margin:'0 0 8px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>PROJETO VINCULADO AO CRM</p>
        <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#fff' }}>Apartamento Alpha — Cozinha + Sala</p>
        <p style={{ margin:'3px 0 0', fontSize:10, color:T.purpleL }}>proj-alpha-001</p>
      </div>

      {lead && (
        <div style={{ padding:'12px', borderRadius:9, background:T.surface, border:`1px solid ${T.border}` }}>
          <p style={{ margin:'0 0 8px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>LEAD CRM</p>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:'50%', background:'rgba(124,58,237,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>👤</div>
            <div>
              <p style={{ margin:'0 0 2px', fontSize:12, fontWeight:700, color:'#fff' }}>{lead.name}</p>
              <p style={{ margin:'0 0 1px', fontSize:9, color:T.dim }}>{lead.email}</p>
              <p style={{ margin:0, fontSize:9, color:T.dim }}>{lead.phone}</p>
            </div>
            <div style={{ marginLeft:'auto', textAlign:'right' as const }}>
              <p style={{ margin:'0 0 2px', fontSize:9, color:T.dim }}>Propensão</p>
              <p style={{ margin:0, fontSize:16, fontWeight:800, color:'#4ade80' }}>{lead.propensityScore}%</p>
            </div>
          </div>
          {lead.roiEstimate && (
            <div style={{ marginTop:8, padding:'6px 8px', borderRadius:6, background:'rgba(74,222,128,0.07)', border:'1px solid rgba(74,222,128,0.2)' }}>
              <p style={{ margin:0, fontSize:9, color:'#4ade80' }}>ROI estimado: <strong>{lead.roiEstimate}</strong></p>
            </div>
          )}
        </div>
      )}

      {deal && (
        <div style={{ padding:'12px', borderRadius:9, background:T.surface, border:`1px solid ${T.border}` }}>
          <p style={{ margin:'0 0 8px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>DEAL / NEGOCIAÇÃO</p>
          <p style={{ margin:'0 0 6px', fontSize:11, fontWeight:700, color:'#fff' }}>{deal.name}</p>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const }}>
            <div style={{ flex:1, padding:'8px', borderRadius:6, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, textAlign:'center' as const }}>
              <p style={{ margin:'0 0 2px', fontSize:9, color:T.dim }}>Valor</p>
              <p style={{ margin:0, fontSize:13, fontWeight:800, color:'#fff' }}>
                R$ {deal.value.toLocaleString('pt-BR')}
              </p>
            </div>
            <div style={{ flex:1, padding:'8px', borderRadius:6, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, textAlign:'center' as const }}>
              <p style={{ margin:'0 0 2px', fontSize:9, color:T.dim }}>Probabilidade</p>
              <p style={{ margin:0, fontSize:13, fontWeight:800, color:'#4ade80' }}>{deal.probability}%</p>
            </div>
            <div style={{ flex:1, padding:'8px', borderRadius:6, background:`${ETAPA_COLOR[deal.etapa]}10`, border:`1px solid ${ETAPA_COLOR[deal.etapa]}30`, textAlign:'center' as const }}>
              <p style={{ margin:'0 0 2px', fontSize:9, color:T.dim }}>Etapa</p>
              <p style={{ margin:0, fontSize:10, fontWeight:800, color:ETAPA_COLOR[deal.etapa] }}>
                {deal.etapa.replace('_', ' ').toUpperCase()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Fluxo CRM */}
      <div style={{ padding:'12px', borderRadius:9, background:T.surface, border:`1px solid ${T.border}` }}>
        <p style={{ margin:'0 0 10px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>FLUXO DO PROJETO</p>
        <div style={{ display:'flex', alignItems:'center', gap:4, flexWrap:'wrap' as const }}>
          {['Lead CRM','Proposta','Contrato','Execução'].map((step, idx, arr) => (
            <div key={step} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <span style={{
                padding:'4px 8px', borderRadius:6, fontSize:9, fontWeight:700,
                background:idx<=1?'rgba(124,58,237,0.15)':'rgba(255,255,255,0.04)',
                color:idx<=1?T.purpleL:T.dim, border:`1px solid ${idx<=1?'rgba(124,58,237,0.3)':T.border}`,
              }}>{step}</span>
              {idx < arr.length-1 && <span style={{ color:T.dim, fontSize:10 }}>›</span>}
            </div>
          ))}
        </div>
      </div>

      <button style={{ padding:'8px', borderRadius:7, border:`1px solid ${T.purple}`, background:'rgba(124,58,237,0.1)', color:T.purpleL, cursor:'pointer', fontSize:10, fontWeight:700 }}>
        🔗 Abrir no CRM Vendor.ai
      </button>
    </div>
  )
}

// ─── Agents tab ───────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: AgentSpec }) {
  const [open, setOpen] = useState(false)
  const statusColor = agent.status==='ACTIVE'?'#4ade80':agent.status==='TRAINING'?'#fbbf24':'#475569'
  return (
    <div style={{ borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, marginBottom:8, overflow:'hidden' }}>
      <button onClick={()=>setOpen(p=>!p)} style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left' as const }}>
        <span style={{ fontSize:22, flexShrink:0 }}>{agent.icon}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'#fff' }}>{agent.name}</p>
          <p style={{ margin:0, fontSize:9, color:T.dim, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{agent.description}</p>
        </div>
        <div style={{ display:'flex', flexDirection:'column' as const, alignItems:'flex-end', gap:3, flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:statusColor }}/>
            <span style={{ fontSize:8, color:statusColor, fontWeight:700 }}>{agent.status}</span>
          </div>
          <span style={{ fontSize:8, color:T.dim }}>{agent.model}</span>
        </div>
        <span style={{ fontSize:10, color:T.dim }}>{open?'▲':'▼'}</span>
      </button>
      {open && (
        <div style={{ padding:'0 12px 10px', borderTop:`1px solid ${T.border}` }}>
          <p style={{ margin:'8px 0 5px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>CAPACIDADES</p>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
            {agent.capabilities.map(c=>(
              <span key={c} style={{ fontSize:9, padding:'2px 7px', borderRadius:6, background:'rgba(124,58,237,0.1)', color:T.purpleL }}>{c}</span>
            ))}
          </div>
          {agent.status==='ACTIVE' && (
            <button style={{ marginTop:8, padding:'5px 10px', borderRadius:6, border:'none', background:T.purple, color:'#fff', cursor:'pointer', fontSize:10, fontWeight:700 }}>
              ⚡ Invocar Agente
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function AgentsTab() {
  const active   = MOCK_AGENTS.filter(a=>a.status==='ACTIVE')
  const inactive = MOCK_AGENTS.filter(a=>a.status!=='ACTIVE')
  return (
    <div>
      {/* Em desenvolvimento — P1-003 */}
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 10px', borderRadius:6, background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.2)', marginBottom:8 }}>
        <span style={{ fontSize:10 }}>⚠️</span>
        <span style={{ fontSize:9, color:'#fbbf24', fontWeight:700 }}>EM DESENVOLVIMENTO</span>
        <span style={{ fontSize:8, color:'rgba(251,191,36,0.6)' }}>— dados demonstrativos; adapter real em progresso</span>
      </div>

      <p style={{ margin:'0 0 8px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>AGENTES ATIVOS ({active.length})</p>
      {active.map(a=><AgentCard key={a.id} agent={a}/>)}
      <p style={{ margin:'12px 0 8px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>INATIVOS ({inactive.length})</p>
      {inactive.map(a=><AgentCard key={a.id} agent={a}/>)}
    </div>
  )
}

// ─── Workflows tab ────────────────────────────────────────────────────────────

function WorkflowsTab() {
  return (
    <div>
      {/* Em desenvolvimento — P1-003 */}
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 10px', borderRadius:6, background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.2)', marginBottom:8 }}>
        <span style={{ fontSize:10 }}>⚠️</span>
        <span style={{ fontSize:9, color:'#fbbf24', fontWeight:700 }}>EM DESENVOLVIMENTO</span>
        <span style={{ fontSize:8, color:'rgba(251,191,36,0.6)' }}>— dados demonstrativos; adapter real em progresso</span>
      </div>

      {MOCK_WORKFLOWS.map(wf=>(
        <div key={wf.id} style={{ padding:'12px', borderRadius:9, background:T.surface, border:`1px solid ${wf.active?'rgba(124,58,237,0.25)':T.border}`, marginBottom:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <p style={{ flex:1, margin:0, fontSize:11, fontWeight:700, color:wf.active?'#fff':T.dim }}>{wf.name}</p>
            <span style={{ fontSize:8, padding:'2px 6px', borderRadius:5, background:wf.active?'rgba(74,222,128,0.1)':'rgba(71,85,105,0.2)', color:wf.active?'#4ade80':'#475569', fontWeight:700 }}>
              {wf.active?'ATIVO':'INATIVO'}
            </span>
          </div>
          <p style={{ margin:'0 0 10px', fontSize:9, color:T.dim }}>Trigger: <strong>{wf.triggerLabel}</strong></p>
          <div style={{ display:'flex', alignItems:'center', gap:3, flexWrap:'wrap' as const }}>
            {wf.steps.map((step, idx) => (
              <div key={step.id} style={{ display:'flex', alignItems:'center', gap:3 }}>
                <div style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 8px', borderRadius:6, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}` }}>
                  <span style={{ fontSize:11 }}>{step.icon}</span>
                  <span style={{ fontSize:9, color:T.text }}>{step.label}</span>
                </div>
                {idx < wf.steps.length-1 && <span style={{ color:T.dim, fontSize:10 }}>→</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Analytics tab ────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const a = MOCK_ANALYTICS
  const TREND_ICON = { UP:'↑', DOWN:'↓', STABLE:'→' }
  const TREND_COLOR = { UP:'#4ade80', DOWN:'#f87171', STABLE:T.dim }
  return (
    <div style={{ display:'flex', flexDirection:'column' as const, gap:12 }}>
      {/* Em desenvolvimento — P1-003 */}
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 10px', borderRadius:6, background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.2)', marginBottom:8 }}>
        <span style={{ fontSize:10 }}>⚠️</span>
        <span style={{ fontSize:9, color:'#fbbf24', fontWeight:700 }}>EM DESENVOLVIMENTO</span>
        <span style={{ fontSize:8, color:'rgba(251,191,36,0.6)' }}>— dados demonstrativos; adapter real em progresso</span>
      </div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const }}>
        {[
          ['Projetos', a.projectsCreated, 'mês'],
          ['Renders', a.rendersGenerated, 'mês'],
          ['Render Ready', `${a.avgRenderReady}%`, 'média'],
          ['Fidelity', `${a.avgFidelityScore}/100`, 'média'],
        ].map(([k,v,u])=>(
          <div key={k} style={{ flex:1, minWidth:100, padding:'10px', borderRadius:8, background:T.surface, border:`1px solid ${T.border}`, textAlign:'center' as const }}>
            <p style={{ margin:'0 0 2px', fontSize:16, fontWeight:900, color:T.purpleL }}>{v}</p>
            <p style={{ margin:'0 0 1px', fontSize:8, color:T.dim }}>{k}</p>
            <p style={{ margin:0, fontSize:8, color:T.dim }}>{u}</p>
          </div>
        ))}
      </div>

      <div style={{ padding:'12px', borderRadius:8, background:T.surface, border:`1px solid ${T.border}` }}>
        <p style={{ margin:'0 0 8px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>MÉTRICAS DETALHADAS — {a.period}</p>
        {a.metrics.map(m=>(
          <div key={m.key} style={{ display:'flex', alignItems:'center', gap:10, padding:'5px 0', borderBottom:`1px solid ${T.border}` }}>
            <p style={{ flex:1, margin:0, fontSize:10, color:T.text }}>{m.label}</p>
            <p style={{ margin:0, fontSize:11, fontWeight:700, color:'#fff' }}>{m.value}{m.unit&&` ${m.unit}`}</p>
            {m.trend && (
              <span style={{ fontSize:9, color:TREND_COLOR[m.trend], fontWeight:700 }}>
                {TREND_ICON[m.trend]}{m.trendPct?` ${m.trendPct}%`:''}
              </span>
            )}
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        {[
          ['Materiais top', MOCK_ANALYTICS.topMaterials],
          ['Fabricantes top', MOCK_ANALYTICS.topManufacturers],
        ].map(([label, items])=>(
          <div key={label as string} style={{ padding:'10px', borderRadius:8, background:T.surface, border:`1px solid ${T.border}` }}>
            <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim }}>{label as string}</p>
            {(items as string[]).map((i,idx)=>(
              <p key={i} style={{ margin:'0 0 3px', fontSize:9, color:T.text }}>
                <span style={{ color:T.dim }}>#{idx+1}</span> {i}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Tasks tab ────────────────────────────────────────────────────────────────

const VTASK_STATUS_COLOR: Record<string, string> = { TODO:'#f87171', IN_PROGRESS:'#fbbf24', DONE:'#4ade80', CANCELLED:'#475569' }
const VTASK_PRIORITY_COLOR: Record<string, string> = { CRITICAL:'#f87171', HIGH:'#fb923c', MEDIUM:'#fbbf24', LOW:'#60a5fa' }

function TasksTab() {
  return (
    <div>
      {/* Em desenvolvimento — P1-003 */}
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 10px', borderRadius:6, background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.2)', marginBottom:8 }}>
        <span style={{ fontSize:10 }}>⚠️</span>
        <span style={{ fontSize:9, color:'#fbbf24', fontWeight:700 }}>EM DESENVOLVIMENTO</span>
        <span style={{ fontSize:8, color:'rgba(251,191,36,0.6)' }}>— dados demonstrativos; adapter real em progresso</span>
      </div>
      <p style={{ margin:'0 0 8px', fontSize:9, color:T.dim }}>Tarefas Vendor.ai geradas pelo ARQ Copilot</p>
      {MOCK_VENDOR_TASKS.map(t=>(
        <div key={t.id} style={{ display:'flex', gap:8, padding:'8px 10px', borderRadius:7, background:T.surface, border:`1px solid ${T.border}`, marginBottom:6, alignItems:'flex-start' }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:VTASK_STATUS_COLOR[t.status], flexShrink:0, marginTop:3 }}/>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ margin:'0 0 3px', fontSize:10, color:t.status==='DONE'?T.dim:T.text, textDecoration:t.status==='DONE'?'line-through':'none' }}>{t.title}</p>
            <div style={{ display:'flex', gap:5 }}>
              <span style={{ fontSize:8, padding:'1px 5px', borderRadius:4, background:`${VTASK_PRIORITY_COLOR[t.priority]}15`, color:VTASK_PRIORITY_COLOR[t.priority] }}>{t.priority}</span>
              <span style={{ fontSize:8, color:T.dim }}>{t.sourceType.replace('_',' ').toLowerCase()}</span>
            </div>
          </div>
          <span style={{ fontSize:9, color:VTASK_STATUS_COLOR[t.status], fontWeight:700, flexShrink:0 }}>{t.status.replace('_',' ')}</span>
        </div>
      ))}
      <button style={{ width:'100%', marginTop:8, padding:'8px', borderRadius:7, border:`1px solid ${T.border}`, background:'transparent', color:T.purpleL, cursor:'pointer', fontSize:10, fontWeight:700 }}>
        + Criar task manualmente
      </button>
    </div>
  )
}

// ─── Knowledge tab ────────────────────────────────────────────────────────────

const KB_CAT_ICON: Record<string, string> = {
  NORMAS:'⚖️', MATERIAIS:'🪵', BOAS_PRATICAS:'✅', MEMORIAIS:'📋', FAQS:'❓', CATALOGOS:'📖', GUIAS_TECNICOS:'🔧',
}

function KnowledgeTab() {
  const sorted = [...MOCK_KNOWLEDGE].sort((a,b)=>(b.relevance??0)-(a.relevance??0))
  return (
    <div>
      {/* Em desenvolvimento — P1-003 */}
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 10px', borderRadius:6, background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.2)', marginBottom:8 }}>
        <span style={{ fontSize:10 }}>⚠️</span>
        <span style={{ fontSize:9, color:'#fbbf24', fontWeight:700 }}>EM DESENVOLVIMENTO</span>
        <span style={{ fontSize:8, color:'rgba(251,191,36,0.6)' }}>— dados demonstrativos; adapter real em progresso</span>
      </div>
      <p style={{ margin:'0 0 8px', fontSize:9, color:T.dim }}>Knowledge Hub consultado pelo AQM • ordenado por relevância para o projeto atual</p>
      {sorted.map(k=>(
        <div key={k.id} style={{ padding:'10px 12px', borderRadius:7, background:T.surface, border:`1px solid ${T.border}`, marginBottom:6 }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
            <span style={{ fontSize:16, flexShrink:0 }}>{KB_CAT_ICON[k.category]??'📄'}</span>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
                <p style={{ margin:0, fontSize:10, fontWeight:700, color:'#fff' }}>{k.title}</p>
                {k.relevance && (
                  <span style={{ fontSize:9, color:k.relevance>=80?'#4ade80':k.relevance>=60?'#fbbf24':'#94a3b8', fontWeight:700, flexShrink:0 }}>{k.relevance}% rel.</span>
                )}
              </div>
              <p style={{ margin:'0 0 5px', fontSize:9, color:T.dim, lineHeight:1.4 }}>{k.summary}</p>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
                <span style={{ fontSize:8, padding:'1px 5px', borderRadius:4, background:'rgba(124,58,237,0.1)', color:T.purpleL }}>{k.category}</span>
                {k.tags.map(t=><span key={t} style={{ fontSize:8, padding:'1px 5px', borderRadius:4, background:'rgba(255,255,255,0.04)', color:T.dim }}>{t}</span>)}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Files tab ────────────────────────────────────────────────────────────────

const FILE_CAT_ICON: Record<string, string> = { RENDER:'🎬', REFERENCE:'🖼️', PBR_TEXTURE:'🪵', PDF:'📄', CATALOG:'📖', BLUEPRINT:'📐' }

function FilesTab() {
  return (
    <div>
      {/* Em desenvolvimento — P1-003 */}
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 10px', borderRadius:6, background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.2)', marginBottom:8 }}>
        <span style={{ fontSize:10 }}>⚠️</span>
        <span style={{ fontSize:9, color:'#fbbf24', fontWeight:700 }}>EM DESENVOLVIMENTO</span>
        <span style={{ fontSize:8, color:'rgba(251,191,36,0.6)' }}>— dados demonstrativos; adapter real em progresso</span>
      </div>
      <p style={{ margin:'0 0 8px', fontSize:9, color:T.dim }}>Arquivos do projeto gerenciados pelo Files Hub</p>
      {MOCK_FILES.map(f=>(
        <div key={f.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:7, background:T.surface, border:`1px solid ${T.border}`, marginBottom:5 }}>
          <span style={{ fontSize:18, flexShrink:0 }}>{FILE_CAT_ICON[f.category]??'📄'}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ margin:'0 0 2px', fontSize:10, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{f.name}</p>
            <p style={{ margin:0, fontSize:8, color:T.dim }}>{f.category} · {f.sizeKb < 1000 ? `${f.sizeKb}KB` : `${(f.sizeKb/1024).toFixed(1)}MB`}</p>
          </div>
          <button style={{ padding:'3px 8px', borderRadius:5, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, cursor:'pointer', fontSize:9 }}>↓</button>
        </div>
      ))}
      <button style={{ width:'100%', marginTop:8, padding:'8px', borderRadius:7, border:`1px dashed ${T.border}`, background:'transparent', color:T.dim, cursor:'pointer', fontSize:10 }}>
        + Upload de arquivo
      </button>
    </div>
  )
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const ws = useWorkspace()
  const connectedHubs = HUB_META.filter(h=>h.connected).length

  return (
    <div style={{ display:'flex', flexDirection:'column' as const, gap:12 }}>
      {/* Workspace identity card */}
      <div style={{ padding:'14px', borderRadius:10, background:'rgba(124,58,237,0.07)', border:'1px solid rgba(124,58,237,0.2)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
          <div style={{ width:40, height:40, borderRadius:'50%', background:'rgba(124,58,237,0.2)', border:`2px solid ${T.purple}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>🏛️</div>
          <div>
            <p style={{ margin:'0 0 2px', fontSize:13, fontWeight:800, color:'#fff' }}>{ws.tenantName}</p>
            <p style={{ margin:0, fontSize:9, color:T.dim }}>Workspace Arquitetura · {ws.activeEnvironment}</p>
          </div>
          <span style={{ marginLeft:'auto', fontSize:9, padding:'3px 7px', borderRadius:6, background:'rgba(74,222,128,0.1)', color:'#4ade80', fontWeight:700 }}>DEMO</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
          {[
            ['Workspace ID', ws.workspaceId],
            ['Tenant ID',    ws.tenantId],
            ['User ID',      ws.userId],
            ['Team ID',      ws.teamId],
          ].map(([k,v])=>(
            <div key={k} style={{ padding:'5px 7px', borderRadius:5, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}` }}>
              <p style={{ margin:'0 0 1px', fontSize:7, color:T.dim, fontWeight:700, letterSpacing:'0.06em' }}>{k}</p>
              <p style={{ margin:0, fontSize:9, color:T.text, fontFamily:'monospace' }}>{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Active project + agent */}
      {ws.activeProject && (
        <div style={{ padding:'10px 12px', borderRadius:8, background:T.surface, border:`1px solid ${T.border}` }}>
          <p style={{ margin:'0 0 4px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>PROJETO ATIVO</p>
          <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'#fff' }}>{ws.activeProject.name}</p>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <span style={{ fontSize:8, padding:'2px 6px', borderRadius:4, background:`${ws.activeProject.status==='IN_PROGRESS'?'rgba(124,58,237,0.15)':'rgba(255,255,255,0.05)'}`, color:ws.activeProject.status==='IN_PROGRESS'?T.purpleL:T.dim }}>{ws.activeProject.status}</span>
            {ws.activeProject.crmLeadId && <span style={{ fontSize:8, color:T.dim }}>🤝 CRM vinculado</span>}
          </div>
        </div>
      )}

      {ws.activeAgent && (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:8, background:T.surface, border:`1px solid ${T.border}` }}>
          <span style={{ fontSize:22, flexShrink:0 }}>{ws.activeAgent.avatar}</span>
          <div>
            <p style={{ margin:'0 0 1px', fontSize:11, fontWeight:700, color:'#fff' }}>{ws.activeAgent.name}</p>
            <p style={{ margin:0, fontSize:9, color:T.dim }}>{ws.activeAgent.role}</p>
          </div>
          <span style={{ marginLeft:'auto', fontSize:8, padding:'2px 6px', borderRadius:4, background:'rgba(74,222,128,0.1)', color:'#4ade80', fontWeight:700 }}>ATIVO</span>
        </div>
      )}

      {/* Hub grid summary */}
      <div>
        <p style={{ margin:'0 0 8px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>VENDOR.AI HUBS ({connectedHubs}/{HUB_META.length} conectados)</p>
        <HubStatusGrid/>
      </div>

      {/* Permissions */}
      <div style={{ padding:'10px 12px', borderRadius:8, background:T.surface, border:`1px solid ${T.border}` }}>
        <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>PERMISSÕES ({ws.permissions.length})</p>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
          {ws.permissions.map(p=>(
            <span key={p} style={{ fontSize:8, padding:'2px 6px', borderRadius:5, background:'rgba(74,222,128,0.08)', color:'#4ade80' }}>✓ {p}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main module ──────────────────────────────────────────────────────────────

export function IntegrationModule() {
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const, background:T.bg }}>
      {/* Header */}
      <div style={{ padding:'12px 18px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontSize:22 }}>🌐</span>
        <div style={{ flex:1 }}>
          <p style={{ margin:'0 0 1px', fontSize:13, fontWeight:800, color:'#fff' }}>Vendor.ai Workspace Integration</p>
          <p style={{ margin:0, fontSize:9, color:T.dim }}>Todos os módulos do arqdor.ai compartilham a infraestrutura da Vendor.ai</p>
        </div>
        <span style={{ fontSize:9, padding:'3px 8px', borderRadius:8, background:'rgba(251,146,60,0.1)', color:'#fb923c', fontWeight:700 }}>ARQUITETURA</span>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:`1px solid ${T.border}`, flexShrink:0, overflowX:'auto' as const }}>
        {TABS.map(tab=>(
          <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{
            padding:'9px 12px', border:'none', background:'transparent', cursor:'pointer',
            color:activeTab===tab.id?'#fff':T.dim, fontSize:10, fontWeight:activeTab===tab.id?700:400,
            borderBottom:`2px solid ${activeTab===tab.id?T.purple:'transparent'}`, whiteSpace:'nowrap' as const,
            display:'flex', alignItems:'center', gap:5,
          }}>
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto' as const, padding:18 }}>
        {activeTab==='overview'   && <OverviewTab/>}
        {activeTab==='crm'        && <CrmTab/>}
        {activeTab==='agents'     && <AgentsTab/>}
        {activeTab==='workflows'  && <WorkflowsTab/>}
        {activeTab==='analytics'  && <AnalyticsTab/>}
        {activeTab==='tasks'      && <TasksTab/>}
        {activeTab==='knowledge'  && <KnowledgeTab/>}
        {activeTab==='files'      && <FilesTab/>}
      </div>
    </div>
  )
}
