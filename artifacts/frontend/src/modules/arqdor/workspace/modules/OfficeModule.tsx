// ─── OfficeModule — Sprint 9: Office Operating System ─────────────────────────
// Sistema operacional completo para escritórios de arquitetura.
// Pipeline · Dashboard · DNA · Templates · Agenda · Indicadores

import { useState, useEffect, useCallback } from 'react'
import { T } from '../../shared/arqdor-theme'

const BASE = '/api'
function hdr(): Record<string, string> {
  const t = localStorage.getItem('vendorai_token')
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Project {
  id: string; titulo: string; clienteNome?: string; pipelineStage?: string
  status?: string; tipoObra?: string; areaM2?: string; updatedAt?: string; prazoEstimado?: number
}
interface PipelineData { stages: string[]; projects: Record<string, Project[]> }
interface DashboardData {
  totalProjetos: number; projetosAtivos: number; emRender: number; concluidos: number
  approvalRate: number; totalRenders: number; avgRevisoes: number
  totalTemplates: number; totalParceiros: number; byStage: Record<string,number>; recentActivity: Project[]
}
interface DNA {
  materiaisPreferidos: {nome:string;count:number;categoria:string}[]
  fabricantesFavoritos:{nome:string;count:number}[]
  promptsFrequentes:   {texto:string;count:number}[]
  estilos:             {tag:string;tipo:string;count:number}[]
  padroes:             {tag:string;tipo:string;count:number}[]
  parceiros:           {nome:string;tipo:string;cidade?:string}[]
  biblioteca:          {nome:string;categoria?:string;fornecedor?:string}[]
  categoriasLibrary:   {cat:string;count:number}[]
  totalProjetos:       number
}
interface AgendaEvent {
  id:string; titulo:string; clienteNome?:string; pipelineStage:string
  tipoObra?:string; dueDate:string|null; daysRemaining:number|null; urgente:boolean; atrasado:boolean
}
interface AgendaData { events: AgendaEvent[]; semPrazo: AgendaEvent[]; total: number }
interface Template {
  id:string; nome:string; descricao?:string; tipoObra?:string; estiloBase?:string
  prazoEstimado?:number; orcamentoBase?:string; ambientes?:{nome:string}[]
  materiais?:{nome:string;categoria:string}[]; prompts?:string[]; vezesCriado:number
}
interface Indicators {
  totalProjetos:number; projetosUltimos30Dias:number; tempMedioProjeto:number
  totalRenders:number; taxaAprovacao:number; avgRendersPerProjeto:number
  avgRevisoes:number; usoIA:number; funnel:Record<string,number>
}

// ─── Pipeline stage colors ─────────────────────────────────────────────────────
const STAGE_COLORS: Record<string, string> = {
  lead:'#6b7280', briefing:'#60a5fa', anteprojeto:'#818cf8', projeto:'#a78bfa',
  render:'#c084fc', cliente:'#f472b6', executivo:'#fb923c', obra:'#fbbf24', concluido:'#4ade80',
}
const STAGE_ICONS: Record<string, string> = {
  lead:'🎯', briefing:'📋', anteprojeto:'✏️', projeto:'📐', render:'🎨',
  cliente:'👤', executivo:'📁', obra:'🏗️', concluido:'✅',
}
const STAGE_LABELS: Record<string, string> = {
  lead:'Lead', briefing:'Briefing', anteprojeto:'Anteprojeto', projeto:'Projeto',
  render:'Render', cliente:'Cliente', executivo:'Executivo', obra:'Obra', concluido:'Concluído',
}

// ─── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
  @keyframes os-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes os-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
  .os-card { animation: os-in .25s ease both; }
  .os-card:hover { border-color: rgba(124,58,237,.3) !important; }
  .os-kanban-col { min-width: 172px; flex-shrink: 0; }
  .os-stage-btn { transition: background .13s, border-color .13s !important; cursor: pointer; }
  .os-stage-btn:hover { background: rgba(255,255,255,.06) !important; }
  .os-tab { transition: all .15s !important; cursor: pointer; }
  .os-bar { transition: width .5s ease !important; }
`

// ─── Shared helpers ─────────────────────────────────────────────────────────────
function MetricCard({ icon, label, value, sub, color = T.purple }: { icon:string;label:string;value:string|number;sub?:string;color?:string }) {
  return (
    <div className="os-card" style={{ padding:'14px 16px', borderRadius:12, border:`1px solid ${T.border}`, background:T.surface, flex:1, minWidth:110 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
        <span style={{ fontSize:18 }}>{icon}</span>
        <p style={{ margin:0, fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'.07em' }}>{label}</p>
      </div>
      <p style={{ margin:0, fontSize:26, fontWeight:900, color }}>{value}</p>
      {sub && <p style={{ margin:'2px 0 0', fontSize:9, color:T.dim }}>{sub}</p>}
    </div>
  )
}

function HBar({ label, value, max, color=T.purple, suffix='' }: { label:string;value:number;max:number;color?:string;suffix?:string }) {
  const pct = max > 0 ? Math.round((value/max)*100) : 0
  return (
    <div style={{ marginBottom:6 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
        <span style={{ fontSize:10, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'65%' }}>{label}</span>
        <span style={{ fontSize:9, fontWeight:700, color }}>{value}{suffix}</span>
      </div>
      <div style={{ height:4, borderRadius:2, background:'rgba(255,255,255,.06)' }}>
        <div className="os-bar" style={{ height:'100%', width:`${pct}%`, borderRadius:2, background:color }} />
      </div>
    </div>
  )
}

// ─── Pipeline Tab ──────────────────────────────────────────────────────────────
function PipelineTab({ data, onMove, movingProjectId }: { data:PipelineData|null; onMove:(pid:string,stage:string)=>void; movingProjectId:string|null }) {
  const [expanded, setExpanded] = useState<string|null>(null)

  if (!data) return <Loader />

  return (
    <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
      {/* Kanban horizontal scroll */}
      <div style={{ flex:1, overflowX:'auto', overflowY:'hidden', padding:'12px 16px', display:'flex', gap:10 }}>
        {data.stages.map(stage => {
          const cards = data.projects[stage] ?? []
          const color = STAGE_COLORS[stage] ?? T.dim
          return (
            <div key={stage} className="os-kanban-col" style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {/* Column header */}
              <div style={{ padding:'6px 10px', borderRadius:8, background:`${color}12`, border:`1px solid ${color}25`, marginBottom:2 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:13 }}>{STAGE_ICONS[stage]}</span>
                  <p style={{ margin:0, fontSize:9, fontWeight:800, color, letterSpacing:'.06em' }}>{STAGE_LABELS[stage]}</p>
                  <span style={{ marginLeft:'auto', fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:6, background:`${color}20`, color }}>{cards.length}</span>
                </div>
              </div>
              {/* Cards */}
              <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:6, paddingBottom:4 }}>
                {cards.map(p => (
                  <div key={p.id} className="os-card" style={{
                    padding:'9px 10px', borderRadius:8, border:`1px solid ${T.border}`,
                    background:T.surface, cursor:'pointer', transition:'border-color .15s',
                  }} onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                    <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.titulo}</p>
                    {p.clienteNome && <p style={{ margin:'0 0 4px', fontSize:9, color:T.dim }}>{p.clienteNome}</p>}
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
                      {p.tipoObra && <span style={{ fontSize:7, padding:'1px 5px', borderRadius:5, background:'rgba(255,255,255,.05)', color:T.dim }}>{p.tipoObra}</span>}
                      {p.areaM2 && <span style={{ fontSize:7, padding:'1px 5px', borderRadius:5, background:'rgba(255,255,255,.05)', color:T.dim }}>{p.areaM2}m²</span>}
                    </div>
                    {/* Move stage buttons — appear on expand */}
                    {expanded === p.id && (
                      <div style={{ marginTop:8, borderTop:`1px solid ${T.border}`, paddingTop:6 }}>
                        <p style={{ margin:'0 0 4px', fontSize:8, color:T.dim, fontWeight:700 }}>MOVER PARA:</p>
                        <div style={{ display:'flex', flexWrap:'wrap' as const, gap:3 }}>
                          {data.stages.filter(s => s !== stage).map(s => (
                            <button
                              key={s}
                              className="os-stage-btn"
                              disabled={movingProjectId !== null}
                              onClick={e => { e.stopPropagation(); onMove(p.id, s) }}
                              style={{
                                padding:'2px 6px', borderRadius:5, border:`1px solid ${STAGE_COLORS[s]}30`,
                                background:`${STAGE_COLORS[s]}10`, color:STAGE_COLORS[s], fontSize:7, fontWeight:700,
                                cursor:movingProjectId ? 'wait' : 'pointer', opacity:movingProjectId ? .45 : 1,
                              }}
                            >
                              {movingProjectId === p.id ? '⏳' : STAGE_ICONS[s]} {STAGE_LABELS[s]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {cards.length === 0 && (
                  <div style={{ padding:'10px 8px', borderRadius:8, border:`1px dashed ${T.border}`, textAlign:'center' as const }}>
                    <p style={{ margin:0, fontSize:9, color:T.dim }}>Vazio</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Dashboard Tab ─────────────────────────────────────────────────────────────
function DashboardTab({ data }: { data:DashboardData|null }) {
  if (!data) return <Loader />
  const maxStage = Math.max(...Object.values(data.byStage), 1)
  return (
    <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:12 }}>
      {/* Metric row */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap' as const }}>
        <MetricCard icon="📁" label="PROJETOS TOTAL"   value={data.totalProjetos}  color={T.purpleL} />
        <MetricCard icon="⚡" label="EM ANDAMENTO"      value={data.projetosAtivos} color={T.blue}    />
        <MetricCard icon="🎨" label="EM RENDER"         value={data.emRender}       color='#c084fc'   />
        <MetricCard icon="✅" label="CONCLUÍDOS"        value={data.concluidos}     color={T.green}   />
        <MetricCard icon="📐" label="APROVAÇÃO"         value={`${data.approvalRate}%`} color={data.approvalRate>70?T.green:data.approvalRate>40?T.amber:T.red} />
        <MetricCard icon="🌐" label="PARCEIROS ATIVOS"  value={data.totalParceiros} color={T.amber}   />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        {/* Pipeline funnel */}
        <div className="os-card" style={{ padding:'14px 16px', borderRadius:12, border:`1px solid ${T.border}`, background:T.surface }}>
          <p style={{ margin:'0 0 12px', fontSize:10, fontWeight:800, color:T.dim, letterSpacing:'.07em' }}>🚀 FUNIL DE PIPELINE</p>
          {Object.entries(data.byStage).map(([stage, count]) => (
            <HBar key={stage} label={`${STAGE_ICONS[stage]} ${STAGE_LABELS[stage]}`} value={count} max={maxStage} color={STAGE_COLORS[stage] ?? T.purple} />
          ))}
        </div>

        {/* Recent activity */}
        <div className="os-card" style={{ padding:'14px 16px', borderRadius:12, border:`1px solid ${T.border}`, background:T.surface }}>
          <p style={{ margin:'0 0 12px', fontSize:10, fontWeight:800, color:T.dim, letterSpacing:'.07em' }}>⏱️ ATIVIDADE RECENTE</p>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {data.recentActivity.slice(0,8).map(p => {
              const s = p.pipelineStage ?? p.status ?? 'briefing'
              const c = STAGE_COLORS[s] ?? T.dim
              return (
                <div key={p.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:11 }}>{STAGE_ICONS[s] ?? '📁'}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ margin:0, fontSize:10, fontWeight:700, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.titulo}</p>
                    <p style={{ margin:0, fontSize:8, color:T.dim }}>{p.clienteNome ?? '—'}</p>
                  </div>
                  <span style={{ fontSize:8, padding:'2px 6px', borderRadius:6, background:`${c}12`, color:c, fontWeight:700, flexShrink:0 }}>
                    {STAGE_LABELS[s] ?? s}
                  </span>
                </div>
              )
            })}
            {data.recentActivity.length === 0 && <p style={{ fontSize:11, color:T.dim, margin:0 }}>Nenhum projeto ainda</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── DNA Tab ───────────────────────────────────────────────────────────────────
function DNATab({ dna }: { dna:DNA|null }) {
  if (!dna) return <Loader />
  const maxMat = Math.max(...dna.materiaisPreferidos.map(m => m.count), 1)
  const maxFab = Math.max(...dna.fabricantesFavoritos.map(f => f.count), 1)
  return (
    <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:12 }}>
      {/* Header banner */}
      <div style={{ padding:'12px 16px', borderRadius:10, background:'rgba(124,58,237,.08)', border:`1px solid rgba(124,58,237,.2)` }}>
        <p style={{ margin:0, fontSize:11, color:T.textSub }}>
          🧬 <strong style={{ color:'#fff' }}>Office DNA</strong> — identidade única do escritório extraída de{' '}
          <strong style={{ color:T.purpleL }}>{dna.totalProjetos} projeto(s)</strong>. Registrado automaticamente.
        </p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
        {/* Materiais preferidos */}
        <div className="os-card" style={{ padding:'14px 16px', borderRadius:12, border:`1px solid ${T.border}`, background:T.surface, gridColumn:'span 1' }}>
          <p style={{ margin:'0 0 10px', fontSize:10, fontWeight:800, color:T.dim, letterSpacing:'.07em' }}>🪨 MATERIAIS PREFERIDOS</p>
          {dna.materiaisPreferidos.length === 0 ? <Empty /> : dna.materiaisPreferidos.slice(0,8).map(m => <HBar key={m.nome} label={m.nome} value={m.count} max={maxMat} color={T.green} />)}
        </div>

        {/* Fabricantes */}
        <div className="os-card" style={{ padding:'14px 16px', borderRadius:12, border:`1px solid ${T.border}`, background:T.surface }}>
          <p style={{ margin:'0 0 10px', fontSize:10, fontWeight:800, color:T.dim, letterSpacing:'.07em' }}>🏭 FABRICANTES FAVORITOS</p>
          {dna.fabricantesFavoritos.length === 0 ? <Empty /> : dna.fabricantesFavoritos.slice(0,8).map(f => <HBar key={f.nome} label={f.nome} value={f.count} max={maxFab} color={T.amber} />)}
        </div>

        {/* Estilos + padrões */}
        <div className="os-card" style={{ padding:'14px 16px', borderRadius:12, border:`1px solid ${T.border}`, background:T.surface }}>
          <p style={{ margin:'0 0 10px', fontSize:10, fontWeight:800, color:T.dim, letterSpacing:'.07em' }}>🎨 ESTILOS & PADRÕES</p>
          {[...dna.estilos, ...dna.padroes].length === 0 ? <Empty /> : (
            <div style={{ display:'flex', flexWrap:'wrap' as const, gap:5 }}>
              {[...dna.estilos, ...dna.padroes].slice(0,12).map(e => (
                <span key={e.tag} style={{ padding:'3px 8px', borderRadius:8, fontSize:9, fontWeight:700, background:'rgba(167,139,250,.1)', color:T.purpleL, border:`1px solid rgba(167,139,250,.15)` }}>
                  {e.tag} <span style={{ opacity:.6 }}>×{e.count}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Prompts */}
        <div className="os-card" style={{ padding:'14px 16px', borderRadius:12, border:`1px solid ${T.border}`, background:T.surface }}>
          <p style={{ margin:'0 0 10px', fontSize:10, fontWeight:800, color:T.dim, letterSpacing:'.07em' }}>✨ PROMPTS FREQUENTES</p>
          {dna.promptsFrequentes.length === 0 ? <Empty /> : dna.promptsFrequentes.slice(0,4).map((p, i) => (
            <div key={i} style={{ marginBottom:6, padding:'6px 8px', borderRadius:7, background:'rgba(255,255,255,.03)', border:`1px solid ${T.border}` }}>
              <p style={{ margin:0, fontSize:9, color:T.textSub, lineHeight:1.4, overflow:'hidden', textOverflow:'ellipsis', WebkitLineClamp:2, display:'-webkit-box', WebkitBoxOrient:'vertical' as const }}>
                "{p.texto}"
              </p>
              <p style={{ margin:'3px 0 0', fontSize:8, color:T.dim }}>×{p.count}</p>
            </div>
          ))}
        </div>

        {/* Parceiros */}
        <div className="os-card" style={{ padding:'14px 16px', borderRadius:12, border:`1px solid ${T.border}`, background:T.surface }}>
          <p style={{ margin:'0 0 10px', fontSize:10, fontWeight:800, color:T.dim, letterSpacing:'.07em' }}>🌐 PARCEIROS ATIVOS</p>
          {dna.parceiros.length === 0 ? <Empty /> : dna.parceiros.slice(0,6).map(p => (
            <div key={p.nome} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
              <span style={{ fontSize:10 }}>🤝</span>
              <div>
                <p style={{ margin:0, fontSize:10, fontWeight:700, color:'#fff' }}>{p.nome}</p>
                <p style={{ margin:0, fontSize:8, color:T.dim }}>{p.tipo} {p.cidade ? `· ${p.cidade}` : ''}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Biblioteca */}
        <div className="os-card" style={{ padding:'14px 16px', borderRadius:12, border:`1px solid ${T.border}`, background:T.surface }}>
          <p style={{ margin:'0 0 10px', fontSize:10, fontWeight:800, color:T.dim, letterSpacing:'.07em' }}>📚 BIBLIOTECA CORPORATIVA</p>
          {dna.categoriasLibrary.length === 0 ? <Empty /> : (
            <div style={{ display:'flex', flexWrap:'wrap' as const, gap:5 }}>
              {dna.categoriasLibrary.slice(0,10).map(c => (
                <span key={c.cat} style={{ padding:'3px 8px', borderRadius:8, fontSize:9, fontWeight:600, background:'rgba(96,165,250,.1)', color:T.blue, border:`1px solid rgba(96,165,250,.15)` }}>
                  {c.cat} <span style={{ opacity:.6 }}>({c.count})</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Templates Tab ─────────────────────────────────────────────────────────────
function TemplatesTab({ templates, onSave, onDelete }: { templates:Template[];onSave:(t:Partial<Template>)=>void;onDelete:(id:string)=>void }) {
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<Partial<Template>>({ nome:'', descricao:'', tipoObra:'', prazoEstimado:30 })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.nome) return
    setSaving(true)
    await onSave(form)
    setForm({ nome:'', descricao:'', tipoObra:'', prazoEstimado:30 })
    setCreating(false)
    setSaving(false)
  }

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:10 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <p style={{ margin:0, fontSize:11, color:T.dim }}>{templates.length} template(s) salvo(s)</p>
        <button onClick={() => setCreating(!creating)} style={{
          marginLeft:'auto', padding:'5px 14px', borderRadius:8, border:`1px solid ${T.purple}`,
          background:'rgba(124,58,237,.15)', color:T.purpleL, fontSize:10, fontWeight:700, cursor:'pointer',
        }}>
          {creating ? '✕ Cancelar' : '+ Novo Template'}
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="os-card" style={{ padding:'14px 16px', borderRadius:12, border:`1px solid rgba(124,58,237,.25)`, background:'rgba(124,58,237,.06)' }}>
          <p style={{ margin:'0 0 12px', fontSize:11, fontWeight:800, color:T.purpleL }}>📋 Novo Template</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {[
              { field:'nome',         label:'Nome *',        type:'text', placeholder:'Ex: Residencial Minimalista' },
              { field:'tipoObra',     label:'Tipo de Obra',  type:'text', placeholder:'residencial' },
              { field:'estiloBase',   label:'Estilo Base',   type:'text', placeholder:'minimalista' },
              { field:'prazoEstimado',label:'Prazo (dias)',  type:'number', placeholder:'60' },
            ].map(f => (
              <div key={f.field}>
                <label style={{ display:'block', fontSize:9, fontWeight:700, color:T.dim, marginBottom:3 }}>{f.label}</label>
                <input
                  type={f.type}
                  placeholder={f.placeholder}
                  value={(form as Record<string,unknown>)[f.field] as string ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, [f.field]: f.type==='number'?Number(e.target.value):e.target.value }))}
                  style={{ width:'100%', padding:'6px 10px', borderRadius:7, border:`1px solid ${T.border}`, background:'rgba(255,255,255,.05)', color:'#fff', fontSize:10, boxSizing:'border-box' as const }}
                />
              </div>
            ))}
            <div style={{ gridColumn:'span 2' }}>
              <label style={{ display:'block', fontSize:9, fontWeight:700, color:T.dim, marginBottom:3 }}>Descrição</label>
              <textarea
                rows={2}
                placeholder="Descrição do template..."
                value={form.descricao ?? ''}
                onChange={e => setForm(prev => ({ ...prev, descricao: e.target.value }))}
                style={{ width:'100%', padding:'6px 10px', borderRadius:7, border:`1px solid ${T.border}`, background:'rgba(255,255,255,.05)', color:'#fff', fontSize:10, resize:'none', boxSizing:'border-box' as const }}
              />
            </div>
          </div>
          <button onClick={handleSave} disabled={saving || !form.nome} style={{
            marginTop:10, padding:'6px 18px', borderRadius:8, border:'none',
            background:T.purple, color:'#fff', fontSize:10, fontWeight:700, cursor:'pointer', opacity:(!form.nome||saving)?0.5:1,
          }}>
            {saving ? 'Salvando…' : '💾 Salvar Template'}
          </button>
        </div>
      )}

      {/* Template grid */}
      {templates.length === 0 && !creating ? (
        <div style={{ textAlign:'center' as const, padding:'32px', opacity:.5 }}>
          <span style={{ fontSize:36 }}>📋</span>
          <p style={{ margin:'8px 0 0', fontSize:12, color:T.dim }}>Nenhum template salvo ainda.<br/>Crie o primeiro para padronizar projetos do escritório.</p>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:8 }}>
          {templates.map(t => (
            <div key={t.id} className="os-card" style={{ padding:'12px 14px', borderRadius:10, border:`1px solid ${T.border}`, background:T.surface }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:6, marginBottom:6 }}>
                <div style={{ flex:1 }}>
                  <p style={{ margin:'0 0 2px', fontSize:12, fontWeight:800, color:'#fff' }}>{t.nome}</p>
                  {t.descricao && <p style={{ margin:0, fontSize:9, color:T.dim, lineHeight:1.4 }}>{t.descricao}</p>}
                </div>
                <button onClick={() => onDelete(t.id)} style={{ padding:'2px 6px', borderRadius:5, border:`1px solid ${T.border}`, background:'transparent', color:T.red, fontSize:9, cursor:'pointer' }}>✕</button>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap' as const, gap:4, marginBottom:6 }}>
                {t.tipoObra && <Tag label={t.tipoObra} color={T.blue} />}
                {t.estiloBase && <Tag label={t.estiloBase} color={T.purpleL} />}
                {t.prazoEstimado && <Tag label={`${t.prazoEstimado}d`} color={T.amber} />}
              </div>
              <div style={{ display:'flex', gap:8, fontSize:9, color:T.dim }}>
                {t.ambientes && <span>{t.ambientes.length} amb.</span>}
                {t.materiais && <span>{t.materiais.length} mat.</span>}
                {t.prompts && <span>{t.prompts.length} prompts</span>}
                <span style={{ marginLeft:'auto' }}>×{t.vezesCriado}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Agenda Tab ────────────────────────────────────────────────────────────────
function AgendaTab({ agenda }: { agenda:AgendaData|null }) {
  if (!agenda) return <Loader />
  const urgent = agenda.events.filter(e => e.urgente || e.atrasado)
  const upcoming = agenda.events.filter(e => !e.urgente && !e.atrasado)

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:12 }}>
      {/* Stats */}
      <div style={{ display:'flex', gap:10 }}>
        <MetricCard icon="📅" label="COM PRAZO" value={agenda.total} color={T.blue} />
        <MetricCard icon="🚨" label="URGENTES" value={urgent.length} color={T.red} sub="≤7 dias ou atrasados" />
        <MetricCard icon="⏳" label="SEM PRAZO" value={agenda.semPrazo.length} color={T.dim} sub="backlog" />
      </div>

      {/* Urgent / overdue */}
      {urgent.length > 0 && (
        <div>
          <p style={{ margin:'0 0 8px', fontSize:10, fontWeight:800, color:T.red, letterSpacing:'.07em' }}>🚨 URGENTES / ATRASADOS</p>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {urgent.map(e => <AgendaCard key={e.id} e={e} />)}
          </div>
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div>
          <p style={{ margin:'0 0 8px', fontSize:10, fontWeight:800, color:T.dim, letterSpacing:'.07em' }}>📅 PRÓXIMOS PRAZOS</p>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {upcoming.map(e => <AgendaCard key={e.id} e={e} />)}
          </div>
        </div>
      )}

      {/* Backlog */}
      {agenda.semPrazo.length > 0 && (
        <div>
          <p style={{ margin:'0 0 8px', fontSize:10, fontWeight:800, color:T.dim, letterSpacing:'.07em' }}>📭 SEM PRAZO DEFINIDO</p>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {agenda.semPrazo.slice(0,6).map(e => <AgendaCard key={e.id} e={e} />)}
          </div>
        </div>
      )}

      {agenda.total === 0 && agenda.semPrazo.length === 0 && (
        <div style={{ textAlign:'center' as const, padding:'32px', opacity:.5 }}>
          <span style={{ fontSize:36 }}>📅</span>
          <p style={{ margin:'8px 0 0', fontSize:12, color:T.dim }}>Nenhum projeto com prazo. Configure prazos nos projetos para ver a agenda.</p>
        </div>
      )}
    </div>
  )
}

function AgendaCard({ e }: { e:AgendaEvent }) {
  const s = e.pipelineStage ?? 'briefing'
  const c = STAGE_COLORS[s] ?? T.dim
  const borderColor = e.atrasado ? T.red : e.urgente ? T.amber : T.border
  return (
    <div className="os-card" style={{ padding:'10px 14px', borderRadius:10, border:`1px solid ${borderColor}`, background:T.surface, display:'flex', alignItems:'center', gap:12 }}>
      <div style={{ flex:1 }}>
        <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'#fff' }}>{e.titulo}</p>
        <p style={{ margin:0, fontSize:9, color:T.dim }}>{e.clienteNome ?? '—'} · {e.tipoObra ?? 'sem tipo'}</p>
      </div>
      <span style={{ fontSize:8, padding:'2px 6px', borderRadius:6, background:`${c}12`, color:c, fontWeight:700, flexShrink:0 }}>
        {STAGE_ICONS[s]} {STAGE_LABELS[s]}
      </span>
      {e.dueDate && (
        <div style={{ textAlign:'right' as const, flexShrink:0 }}>
          <p style={{ margin:0, fontSize:11, fontWeight:900, color: e.atrasado ? T.red : e.urgente ? T.amber : T.text }}>
            {e.atrasado ? `${Math.abs(e.daysRemaining!)}d atraso` : e.daysRemaining === 0 ? 'Hoje' : `${e.daysRemaining}d`}
          </p>
          <p style={{ margin:0, fontSize:8, color:T.dim }}>{e.dueDate}</p>
        </div>
      )}
    </div>
  )
}

// ─── Indicadores Tab ───────────────────────────────────────────────────────────
function IndicadoresTab({ data }: { data:Indicators|null }) {
  if (!data) return <Loader />
  const maxFunnel = Math.max(...Object.values(data.funnel), 1)
  return (
    <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:12 }}>
      {/* KPI cards */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap' as const }}>
        <MetricCard icon="📁" label="PROJETOS TOTAL"    value={data.totalProjetos}         color={T.purpleL} />
        <MetricCard icon="📅" label="ÚLTIMOS 30 DIAS"   value={data.projetosUltimos30Dias}  color={T.blue}   sub="novos projetos" />
        <MetricCard icon="⏱️" label="TEMPO MÉDIO"       value={`${data.tempMedioProjeto}d`} color={T.amber}  sub="por projeto" />
        <MetricCard icon="🎨" label="RENDERS GERADOS"   value={data.totalRenders}           color='#c084fc'  />
        <MetricCard icon="✅" label="TAXA APROVAÇÃO"    value={`${data.taxaAprovacao}%`}    color={data.taxaAprovacao>70?T.green:data.taxaAprovacao>40?T.amber:T.red} />
        <MetricCard icon="🔄" label="RENDERS/PROJETO"   value={data.avgRendersPerProjeto}   color={T.blue}   />
        <MetricCard icon="✏️" label="REVISÕES/PROJETO"  value={data.avgRevisoes}            color={T.amber}  sub="média" />
        <MetricCard icon="🤖" label="USO IA (RENDERS)"  value={data.usoIA}                  color={T.green}  sub="renders via IA" />
      </div>

      {/* Pipeline funnel */}
      <div className="os-card" style={{ padding:'14px 16px', borderRadius:12, border:`1px solid ${T.border}`, background:T.surface }}>
        <p style={{ margin:'0 0 12px', fontSize:10, fontWeight:800, color:T.dim, letterSpacing:'.07em' }}>🚀 FUNIL POR ETAPA</p>
        {Object.entries(data.funnel).map(([stage, count]) => (
          <HBar key={stage} label={`${STAGE_ICONS[stage]} ${STAGE_LABELS[stage]}`} value={count} max={maxFunnel} color={STAGE_COLORS[stage] ?? T.purple} suffix={` projeto${count!==1?'s':''}`} />
        ))}
      </div>
    </div>
  )
}

// ─── Micro components ──────────────────────────────────────────────────────────
function Loader() {
  return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <span style={{ fontSize:28, animation:'os-pulse 1.5s infinite' }}>⚙️</span>
    </div>
  )
}
function Empty() { return <p style={{ fontSize:11, color:T.dim, margin:0 }}>Nenhum dado ainda — extraia conhecimento no módulo 🧠</p> }
function Tag({ label, color }: { label:string; color:string }) {
  return <span style={{ padding:'2px 7px', borderRadius:7, fontSize:8, fontWeight:700, background:`${color}12`, color, border:`1px solid ${color}20` }}>{label}</span>
}

// ─── Main Module ───────────────────────────────────────────────────────────────
export function OfficeModule() {
  const [movingProjectId, setMovingProjectId] = useState<string|null>(null)
  const [tab, setTab] = useState<'pipeline'|'dashboard'|'dna'|'templates'|'agenda'|'indicators'>('pipeline')
  const [pipeline,   setPipeline]   = useState<PipelineData|null>(null)
  const [dashboard,  setDashboard]  = useState<DashboardData|null>(null)
  const [dna,        setDNA]        = useState<DNA|null>(null)
  const [templates,  setTemplates]  = useState<Template[]>([])
  const [agenda,     setAgenda]     = useState<AgendaData|null>(null)
  const [indicators, setIndicators] = useState<Indicators|null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string|null>(null)

  const fetchPipeline   = useCallback(async () => { const r = await fetch(`${BASE}/arch/office/pipeline`, {headers:hdr()}); if(r.ok) setPipeline(await r.json()) }, [])
  const fetchDashboard  = useCallback(async () => { const r = await fetch(`${BASE}/arch/office/dashboard`, {headers:hdr()}); if(r.ok) setDashboard(await r.json()) }, [])
  const fetchDNA        = useCallback(async () => { const r = await fetch(`${BASE}/arch/office/dna`, {headers:hdr()}); if(r.ok) setDNA(await r.json()) }, [])
  const fetchTemplates  = useCallback(async () => { const r = await fetch(`${BASE}/arch/office/templates`, {headers:hdr()}); if(r.ok) setTemplates(await r.json()) }, [])
  const fetchAgenda     = useCallback(async () => { const r = await fetch(`${BASE}/arch/office/agenda`, {headers:hdr()}); if(r.ok) setAgenda(await r.json()) }, [])
  const fetchIndicators = useCallback(async () => { const r = await fetch(`${BASE}/arch/office/indicators`, {headers:hdr()}); if(r.ok) setIndicators(await r.json()) }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchPipeline(), fetchDashboard(), fetchDNA(), fetchTemplates(), fetchAgenda(), fetchIndicators()])
    setLoading(false)
  }, [fetchPipeline, fetchDashboard, fetchDNA, fetchTemplates, fetchAgenda, fetchIndicators])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function handleMove(projectId: string, stage: string) {
    if (movingProjectId) return
    setMovingProjectId(projectId)
    setError(null)
    try {
      const response = await fetch(`${BASE}/arch/office/pipeline/${projectId}/stage`, { method:'PATCH', headers:hdr(), body: JSON.stringify({ stage }) })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setError(body.error ?? 'Não foi possível mover o projeto no pipeline.')
        return
      }
      await fetchPipeline()
      await fetchDashboard()
    } finally {
      setMovingProjectId(null)
    }
  }

  async function handleSaveTemplate(tmpl: Partial<Template>) {
    setError(null)
    const response = await fetch(`${BASE}/arch/office/templates`, { method:'POST', headers:hdr(), body: JSON.stringify(tmpl) })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      setError(body.error ?? 'Não foi possível salvar o template.')
      return
    }
    await fetchTemplates()
    await fetchDashboard()
  }

  async function handleDeleteTemplate(id: string) {
    setError(null)
    const response = await fetch(`${BASE}/arch/office/templates/${id}`, { method:'DELETE', headers:hdr() })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      setError(body.error ?? 'Não foi possível remover o template.')
      return
    }
    await fetchTemplates()
  }

  const TABS = [
    { id:'pipeline',   icon:'🚀', label:'Pipeline'    },
    { id:'dashboard',  icon:'📊', label:'Dashboard'   },
    { id:'dna',        icon:'🧬', label:'Office DNA'  },
    { id:'templates',  icon:'📋', label:'Templates'   },
    { id:'agenda',     icon:'📅', label:'Agenda'      },
    { id:'indicators', icon:'📈', label:'Indicadores' },
  ] as const

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden', background:T.bg }}>
      <style>{CSS}</style>
      {error && <div role="alert" style={{ padding:'8px 14px', background:'rgba(248,113,113,.12)', color:T.red, fontSize:10, fontWeight:700 }}>{error}</div>}

      {/* ── TOP BAR ── */}
      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0, background:T.sidebar }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div>
            <p style={{ margin:0, fontSize:15, fontWeight:900, color:'#fff' }}>🏢 Office OS</p>
            <p style={{ margin:0, fontSize:10, color:T.dim }}>Sistema operacional para escritórios de arquitetura</p>
          </div>
          <div style={{ flex:1 }} />
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="os-tab" style={{
              padding:'5px 11px', borderRadius:7, border:`1px solid ${tab===t.id?T.purple:T.border}`,
              background:tab===t.id?'rgba(124,58,237,.18)':'transparent',
              color:tab===t.id?T.purpleL:T.dim, fontSize:9, fontWeight:700, cursor:'pointer',
            }}>
              {t.icon} {t.label}
            </button>
          ))}
          <button onClick={fetchAll} style={{
            padding:'5px 12px', borderRadius:7, border:`1px solid ${T.border}`,
            background:'rgba(255,255,255,.04)', color:T.dim, fontSize:9, cursor:'pointer',
          }} title="Recarregar">↻</button>
        </div>
      </div>

      {/* ── CONTENT ── */}
      {loading ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10 }}>
          <span style={{ fontSize:40, animation:'os-pulse 1.5s infinite' }}>🏢</span>
          <p style={{ margin:0, fontSize:12, color:T.dim }}>Carregando Office OS…</p>
        </div>
      ) : (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {tab === 'pipeline'   && <PipelineTab   data={pipeline}  onMove={handleMove} movingProjectId={movingProjectId} />}
          {tab === 'dashboard'  && <DashboardTab  data={dashboard} />}
          {tab === 'dna'        && <DNATab        dna={dna} />}
          {tab === 'templates'  && <TemplatesTab  templates={templates} onSave={handleSaveTemplate} onDelete={handleDeleteTemplate} />}
          {tab === 'agenda'     && <AgendaTab     agenda={agenda} />}
          {tab === 'indicators' && <IndicadoresTab data={indicators} />}
        </div>
      )}
    </div>
  )
}
