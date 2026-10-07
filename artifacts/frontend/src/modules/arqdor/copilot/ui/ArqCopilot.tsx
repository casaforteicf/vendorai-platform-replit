import { useState, useRef, useEffect, useMemo, useContext, useCallback } from 'react'
import type { CopilotMessage, CopilotQuestion, CopilotSuggestion, Decision, SmartTask, ChecklistItem, ProjectHealthResult, Workflow } from '../copilot-types'
import type { ProjectContext } from '../../engines/aie/aie-types'
import { generateQuestions }    from '../engines/question-engine'
import { generateSuggestions }  from '../engines/suggestion-engine'
import { addDecision }          from '../engines/decision-engine'
import { buildWorkflow }        from '../engines/workflow-engine'
import { generateTasks, generateChecklist, computeProjectHealth, computeProgress } from '../engines/task-engine'
import { WorkspaceContext } from '../../workspace/WorkspaceContext'
import { T } from '../../shared/arqdor-theme'

// ─── Auth ──────────────────────────────────────────────────────────────────
const BASE = '/api'
function authHeaders() {
  const tok = localStorage.getItem('vendorai_token')
  return {
    'Content-Type': 'application/json',
    ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
  }
}

// ─── Empty context fallback (no mock file) ────────────────────────────────
const EMPTY_PROJECT_CTX: ProjectContext = {
  id: 'no-project',
  name: 'Sem projeto ativo',
  objects: [],
  materials: [],
}

// ─── Inline welcome message (no mock file) ────────────────────────────────
function makeWelcomeMsg(projectName?: string): CopilotMessage {
  const text = projectName
    ? `Olá! Sou o ARQ Copilot, seu assistente de projeto.\n\nEstou pronto para ajudar com **${projectName}**. Pode me perguntar sobre materiais, renders, memoriais descritivos, orçamentos ou próximos passos.`
    : `Olá! Sou o ARQ Copilot.\n\nAbra um projeto para ter respostas mais precisas sobre materiais, ambientes e renders. Ou pergunte qualquer coisa sobre arquitetura e design!`
  return {
    id: 'msg-welcome',
    role: 'COPILOT',
    timestamp: new Date().toISOString(),
    text,
    chips: [
      { label: 'Próximo passo',    value: 'Qual é o próximo passo do projeto?' },
      { label: 'Ver pendências',   value: 'Quais são as pendências atuais?' },
      { label: 'Sugerir materiais',value: 'Sugira materiais para este projeto' },
      { label: 'Criar memorial',   value: 'Gere um memorial descritivo preliminar' },
    ],
  }
}

type PanelTab = 'chat' | 'tasks' | 'checklist' | 'workflow' | 'decisions'

// ─── Health badge ──────────────────────────────────────────────────────────
function HealthBadge({ health }: { health: ProjectHealthResult }) {
  const color = health.health === 'EXCELENTE' ? '#4ade80' : health.health === 'BOM' ? '#a78bfa' : health.health === 'REGULAR' ? '#fbbf24' : '#f87171'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <div style={{ width:7, height:7, borderRadius:'50%', background:color, flexShrink:0 }}/>
      <span style={{ fontSize:9, color, fontWeight:700, letterSpacing:'0.04em' }}>{health.health.replace('_',' ')}</span>
      <span style={{ fontSize:9, color:T.dim }}>· {health.score}/100</span>
    </div>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────
function ProgressBar({ value, renderReady }: { value: number; renderReady: number }) {
  const rColor = renderReady >= 80 ? '#4ade80' : renderReady >= 60 ? '#fbbf24' : '#f87171'
  return (
    <div style={{ padding:'8px 12px', borderBottom:`1px solid ${T.border}`, background:'rgba(255,255,255,0.02)', flexShrink:0 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
        <span style={{ fontSize:9, color:T.dim }}>Progresso do projeto</span>
        <span style={{ fontSize:9, color:'#fff', fontWeight:700 }}>{value}%</span>
      </div>
      <div style={{ height:4, borderRadius:2, background:'rgba(255,255,255,0.08)', marginBottom:6 }}>
        <div style={{ height:'100%', width:`${value}%`, borderRadius:2, background:T.purpleL, transition:'width 0.4s ease' }}/>
      </div>
      <div style={{ display:'flex', justifyContent:'space-between' }}>
        <span style={{ fontSize:9, color:T.dim }}>Pronto para render</span>
        <span style={{ fontSize:9, color:rColor, fontWeight:700 }}>{renderReady}%</span>
      </div>
      <div style={{ height:3, borderRadius:2, background:'rgba(255,255,255,0.08)', marginTop:4 }}>
        <div style={{ height:'100%', width:`${renderReady}%`, borderRadius:2, background:rColor, transition:'width 0.4s ease' }}/>
      </div>
    </div>
  )
}

// ─── Typing indicator ─────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', marginBottom:10, gap:6 }}>
      <div style={{
        padding:'10px 14px', borderRadius:'12px 12px 12px 3px',
        background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`,
        display:'flex', gap:4, alignItems:'center',
      }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            width:5, height:5, borderRadius:'50%', background:T.purpleL,
            animation:`bounce 1.2s ${i * 0.2}s infinite`,
          }}/>
        ))}
      </div>
      <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }`}</style>
    </div>
  )
}

// ─── Message bubble ──────────────────────────────────────────────────────
function MsgBubble({ msg, onAction, onChip, onRegenerate, onCopy, liked, onLike, onDislike }: {
  msg:          CopilotMessage
  onAction:     (v: string) => void
  onChip:       (v: string) => void
  onRegenerate: () => void
  onCopy:       (text: string) => void
  liked:        boolean | null
  onLike:       () => void
  onDislike:    () => void
}) {
  const isUser   = msg.role === 'USER'
  const isSystem = msg.role === 'SYSTEM'
  const time     = new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    onCopy(msg.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:isUser?'flex-end':'flex-start', marginBottom:10 }}>
      {isSystem ? (
        <div style={{ width:'100%', padding:'6px 10px', borderRadius:6, background:'rgba(124,58,237,0.08)', border:`1px solid rgba(124,58,237,0.2)` }}>
          <p style={{ margin:0, fontSize:9, color:T.purpleL, lineHeight:1.5 }}>⚙ {msg.text}</p>
        </div>
      ) : (
        <>
          <div style={{
            maxWidth:'92%', padding:'8px 11px',
            borderRadius:isUser?'12px 12px 3px 12px':'12px 12px 12px 3px',
            background:isUser?'rgba(124,58,237,0.25)':'rgba(255,255,255,0.06)',
            border:`1px solid ${isUser?'rgba(124,58,237,0.35)':T.border}`,
          }}>
            {msg.metadata?.confidence && (
              <p style={{ margin:'0 0 3px', fontSize:8, color:T.dim }}>Confiança {msg.metadata.confidence}%</p>
            )}
            <p style={{ margin:0, fontSize:11, color:T.text, lineHeight:1.55, whiteSpace:'pre-wrap' }}>{msg.text}</p>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:3, paddingLeft:4, paddingRight:4 }}>
            <span style={{ fontSize:8, color:T.dim }}>{isUser ? 'Você' : '🤖 ARQ Copilot'} · {time}</span>
            {!isUser && (
              <>
                <button onClick={handleCopy} title="Copiar" style={{ padding:'2px 4px', border:'none', background:'transparent', color:copied?'#4ade80':T.dim, cursor:'pointer', fontSize:9 }}>
                  {copied ? '✓' : '⎘'}
                </button>
                <button onClick={onLike} title="Curtir" style={{ padding:'2px 4px', border:'none', background:'transparent', color:liked===true?'#4ade80':T.dim, cursor:'pointer', fontSize:9 }}>
                  👍
                </button>
                <button onClick={onDislike} title="Não curtir" style={{ padding:'2px 4px', border:'none', background:'transparent', color:liked===false?'#f87171':T.dim, cursor:'pointer', fontSize:9 }}>
                  👎
                </button>
                <button onClick={onRegenerate} title="Regenerar" style={{ padding:'2px 4px', border:'none', background:'transparent', color:T.dim, cursor:'pointer', fontSize:9 }}>
                  ↺
                </button>
              </>
            )}
          </div>

          {msg.actions && msg.actions.length > 0 && (
            <div style={{ display:'flex', gap:5, marginTop:5, flexWrap:'wrap' }}>
              {msg.actions.map(a=>(
                <button key={a.value} onClick={()=>onAction(a.value)} style={{
                  padding:'5px 10px', borderRadius:7, fontSize:10, cursor:'pointer', fontWeight:600,
                  border:`1px solid ${a.variant==='PRIMARY'?T.purple:T.border}`,
                  background:a.variant==='PRIMARY'?'rgba(124,58,237,0.2)':'transparent',
                  color:a.variant==='PRIMARY'?T.purpleL:T.text,
                }}>
                  {a.icon && <span style={{ marginRight:3 }}>{a.icon}</span>}{a.label}
                </button>
              ))}
            </div>
          )}

          {msg.chips && msg.chips.length > 0 && (
            <div style={{ display:'flex', gap:4, marginTop:5, flexWrap:'wrap' }}>
              {msg.chips.map(c=>(
                <button key={c.value} onClick={()=>onChip(c.value)} style={{
                  padding:'3px 9px', borderRadius:12, fontSize:9, cursor:'pointer',
                  border:`1px solid ${T.border}`, background:'rgba(255,255,255,0.04)',
                  color:T.text, fontWeight:500,
                }}>
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Chat tab ─────────────────────────────────────────────────────────────

function ChatTab({ messages, loading, onAction, onChip, onSend, onCancel, onRegenerate, questions, suggestions }: {
  messages:    CopilotMessage[]
  loading:     boolean
  onAction:    (v: string) => void
  onChip:      (v: string) => void
  onSend:      (text: string) => void
  onCancel:    () => void
  onRegenerate:() => void
  questions:   CopilotQuestion[]
  suggestions: CopilotSuggestion[]
}) {
  const [input, setInput] = useState('')
  const messagesEnd = useRef<HTMLDivElement>(null)
  const [likes, setLikes] = useState<Record<string, boolean | null>>({})

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior:'smooth' })
  }, [messages, loading])

  const pendingQ   = questions.filter(q=>q.status==='PENDING').slice(0,1)[0]
  const pendingSug = suggestions.filter(s=>s.status==='PENDING').slice(0,1)[0]

  function handleSend() {
    const t = input.trim()
    if (!t || loading) return
    onSend(t)
    setInput('')
  }

  function handleLike(id: string) {
    setLikes(p => ({ ...p, [id]: p[id] === true ? null : true }))
  }
  function handleDislike(id: string) {
    setLikes(p => ({ ...p, [id]: p[id] === false ? null : false }))
  }
  function handleCopy(text: string) {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>

      {pendingQ && (
        <div style={{ padding:'8px 10px', background:'rgba(124,58,237,0.06)', borderBottom:`1px solid rgba(124,58,237,0.15)`, flexShrink:0 }}>
          <p style={{ margin:'0 0 3px', fontSize:8, fontWeight:700, color:T.purpleL, letterSpacing:'0.06em' }}>
            PERGUNTA {pendingQ.priority} · {pendingQ.type}
          </p>
          <p style={{ margin:'0 0 5px', fontSize:10, color:T.text }}>{pendingQ.text}</p>
          {pendingQ.chips && (
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {pendingQ.chips.slice(0,4).map(c=>(
                <button key={c.value} onClick={()=>onChip(c.value)} style={{
                  padding:'2px 8px', borderRadius:10, fontSize:9, cursor:'pointer',
                  border:`1px solid rgba(124,58,237,0.3)`, background:'rgba(124,58,237,0.08)',
                  color:T.purpleL,
                }}>
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!pendingQ && pendingSug && (
        <div style={{ padding:'8px 10px', background:'rgba(251,146,60,0.05)', borderBottom:`1px solid rgba(251,146,60,0.15)`, flexShrink:0 }}>
          <p style={{ margin:'0 0 3px', fontSize:8, fontWeight:700, color:'#fb923c', letterSpacing:'0.06em' }}>SUGESTÃO</p>
          <p style={{ margin:'0 0 4px', fontSize:10, color:T.text }}>{pendingSug.text}</p>
          {pendingSug.chips && (
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {pendingSug.chips.slice(0,3).map(c=>(
                <button key={c.value} onClick={()=>onChip(c.value)} style={{
                  padding:'2px 8px', borderRadius:10, fontSize:9, cursor:'pointer',
                  border:`1px solid rgba(251,146,60,0.3)`, background:'rgba(251,146,60,0.08)', color:'#fb923c',
                }}>
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ flex:1, overflowY:'auto', padding:'10px 10px 4px' }}>
        {messages.map(m=>(
          <MsgBubble
            key={m.id}
            msg={m}
            onAction={onAction}
            onChip={onChip}
            onRegenerate={onRegenerate}
            onCopy={handleCopy}
            liked={likes[m.id] ?? null}
            onLike={()=>handleLike(m.id)}
            onDislike={()=>handleDislike(m.id)}
          />
        ))}
        {loading && <TypingIndicator/>}
        <div ref={messagesEnd}/>
      </div>

      <div style={{ padding:'8px 10px', borderTop:`1px solid ${T.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', gap:6 }}>
          <input
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&handleSend()}
            placeholder='Ex: "Troque o MDF para Carvalho Americano" …'
            disabled={loading}
            style={{
              flex:1, padding:'7px 10px', borderRadius:7, border:`1px solid ${T.border}`,
              background:'rgba(255,255,255,0.05)', color:T.text, fontSize:10, outline:'none',
              opacity:loading?0.6:1,
            }}
          />
          {loading ? (
            <button onClick={onCancel} title="Cancelar geração" style={{
              padding:'7px 10px', borderRadius:7, border:`1px solid ${T.border}`,
              background:'rgba(248,113,113,0.15)', color:'#f87171', cursor:'pointer', fontSize:11, fontWeight:700, flexShrink:0,
            }}>✕</button>
          ) : (
            <button onClick={handleSend} disabled={!input.trim()} style={{
              padding:'7px 12px', borderRadius:7, border:'none', background:input.trim()?T.purple:'rgba(255,255,255,0.08)',
              color:'#fff', cursor:input.trim()?'pointer':'default', fontSize:11, fontWeight:700, flexShrink:0,
              opacity:input.trim()?1:0.5,
            }}>→</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Tasks tab ────────────────────────────────────────────────────────────
const TASK_PRIORITY_COLOR: Record<string, string> = { CRITICAL:'#f87171', HIGH:'#fb923c', MEDIUM:'#fbbf24', LOW:'#60a5fa' }

function TasksTab({ tasks }: { tasks: SmartTask[] }) {
  const [filter, setFilter] = useState<'ALL'|'PENDING'|'DONE'>('PENDING')
  const visible = filter === 'ALL' ? tasks : tasks.filter(t=>t.status===filter)
  const done    = tasks.filter(t=>t.status==='DONE').length
  return (
    <div style={{ padding:'10px' }}>
      <div style={{ display:'flex', gap:5, marginBottom:10, flexWrap:'wrap' }}>
        {(['ALL','PENDING','DONE'] as const).map(f=>(
          <button key={f} onClick={()=>setFilter(f)} style={{
            padding:'3px 8px', borderRadius:6, fontSize:9, border:`1px solid ${filter===f?T.purple:T.border}`,
            background:filter===f?'rgba(124,58,237,0.15)':'transparent',
            color:filter===f?T.purpleL:T.dim, cursor:'pointer',
          }}>{f==='ALL'?`Tudo (${tasks.length})`:f==='PENDING'?`Pendente (${tasks.length-done})`:`Concluído (${done})`}</button>
        ))}
      </div>
      {visible.map(t=>(
        <div key={t.id} style={{
          display:'flex', alignItems:'center', gap:8, padding:'7px 9px', borderRadius:7, marginBottom:4,
          background:t.status==='DONE'?'rgba(74,222,128,0.05)':T.surface, border:`1px solid ${T.border}`,
        }}>
          <span style={{ fontSize:14, color:t.status==='DONE'?'#4ade80':TASK_PRIORITY_COLOR[t.priority] }}>{t.status==='DONE'?'✓':'○'}</span>
          <p style={{ flex:1, margin:0, fontSize:10, color:t.status==='DONE'?T.dim:T.text, lineHeight:1.4, textDecoration:t.status==='DONE'?'line-through':'none' }}>{t.label}</p>
          <span style={{ fontSize:8, padding:'2px 5px', borderRadius:4, background:`${TASK_PRIORITY_COLOR[t.priority]}15`, color:TASK_PRIORITY_COLOR[t.priority], flexShrink:0 }}>{t.priority}</span>
        </div>
      ))}
      {visible.length === 0 && <p style={{ textAlign:'center', color:T.dim, fontSize:11, padding:20 }}>Nenhuma tarefa aqui.</p>}
    </div>
  )
}

// ─── Checklist tab ────────────────────────────────────────────────────────
const CSTATUS_COLOR = { DONE:'#4ade80', PARTIAL:'#fbbf24', MISSING:'#f87171' }

function ChecklistTab({ checklist }: { checklist: ChecklistItem[] }) {
  return (
    <div style={{ padding:'10px' }}>
      {checklist.map(item=>(
        <div key={item.area} style={{ display:'flex', gap:10, alignItems:'center', padding:'8px 10px', borderRadius:7, background:T.surface, border:`1px solid ${T.border}`, marginBottom:6 }}>
          <span style={{ fontSize:16, flexShrink:0 }}>{item.icon}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
              <p style={{ margin:0, fontSize:10, color:T.text, fontWeight:600 }}>{item.label}</p>
              <span style={{ fontSize:9, color:CSTATUS_COLOR[item.status], fontWeight:700 }}>{item.score}%</span>
            </div>
            <div style={{ height:3, borderRadius:2, background:'rgba(255,255,255,0.08)', marginBottom:3 }}>
              <div style={{ height:'100%', width:`${item.score}%`, borderRadius:2, background:CSTATUS_COLOR[item.status], transition:'width 0.4s' }}/>
            </div>
            {item.detail && <p style={{ margin:0, fontSize:8, color:T.dim }}>{item.detail}</p>}
          </div>
          <span style={{ fontSize:12, flexShrink:0 }}>{item.status==='DONE'?'✅':item.status==='PARTIAL'?'🟡':'🔴'}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Workflow tab ─────────────────────────────────────────────────────────
const WSTEP_COLOR = { DONE:'#4ade80', IN_PROGRESS:T.purpleL, PENDING:'rgba(255,255,255,0.25)', SKIPPED:'rgba(255,255,255,0.15)' }

function WorkflowTab({ workflow }: { workflow: Workflow }) {
  return (
    <div style={{ padding:'10px' }}>
      <p style={{ margin:'0 0 10px', fontSize:11, fontWeight:700, color:'#fff' }}>{workflow.name}</p>
      <div style={{ position:'relative' }}>
        <div style={{ position:'absolute', left:15, top:12, bottom:12, width:2, background:'rgba(255,255,255,0.08)', zIndex:0 }}/>
        {workflow.steps.map(step => (
          <div key={step.id} style={{ display:'flex', gap:12, alignItems:'flex-start', marginBottom:12, position:'relative', zIndex:1 }}>
            <div style={{
              width:30, height:30, borderRadius:'50%', flexShrink:0,
              background:step.status==='DONE'?'rgba(74,222,128,0.15)':step.status==='IN_PROGRESS'?'rgba(124,58,237,0.25)':'rgba(255,255,255,0.05)',
              border:`2px solid ${WSTEP_COLOR[step.status]}`,
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:13,
            }}>
              {step.status==='DONE'?'✓':step.icon}
            </div>
            <div style={{ flex:1, paddingTop:4 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                <p style={{ margin:0, fontSize:10, fontWeight:step.status==='IN_PROGRESS'?700:500, color:step.status==='DONE'?T.dim:T.text }}>{step.label}</p>
                {step.status==='IN_PROGRESS' && (
                  <span style={{ fontSize:8, padding:'2px 5px', borderRadius:5, background:'rgba(124,58,237,0.2)', color:T.purpleL, fontWeight:700 }}>ATUAL</span>
                )}
              </div>
              <p style={{ margin:0, fontSize:8, color:T.dim, lineHeight:1.4 }}>{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Decisions tab ────────────────────────────────────────────────────────
const ACTOR_COLOR: Record<string, string> = {
  USUARIO:'#60a5fa', COPILOT:T.purpleL, CATALOGO:'#fb923c', BIBLIOTECA:'#fbbf24',
  FABRICANTE:'#4ade80', SISTEMA:'#94a3b8', IA:'#f87171',
}

function DecisionsTab({ decisions }: { decisions: Decision[] }) {
  return (
    <div style={{ padding:'10px' }}>
      <p style={{ margin:'0 0 8px', fontSize:9, color:T.dim }}>Histórico de decisões do projeto</p>
      {decisions.length === 0 && (
        <p style={{ textAlign:'center', color:T.dim, fontSize:11, padding:20 }}>Nenhuma decisão registrada ainda. Interaja com o Copilot para registrar decisões.</p>
      )}
      {decisions.map(d=>(
        <div key={d.id} style={{ display:'flex', gap:10, padding:'7px 0', borderBottom:`1px solid ${T.border}` }}>
          <span style={{ fontSize:9, color:T.dim, width:36, flexShrink:0, paddingTop:1 }}>{new Date(d.timestamp).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:2 }}>
              <span style={{ fontSize:8, padding:'1px 5px', borderRadius:4, background:`${ACTOR_COLOR[d.actor]??'#666'}15`, color:ACTOR_COLOR[d.actor]??'#666', fontWeight:700 }}>{d.actor}</span>
              {d.accepted !== undefined && (
                <span style={{ fontSize:9, color:d.accepted?'#4ade80':'#f87171' }}>{d.accepted?'✓':'✗'}</span>
              )}
            </div>
            <p style={{ margin:0, fontSize:10, color:T.text, lineHeight:1.4 }}>{d.description}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Alerts strip ─────────────────────────────────────────────────────────
function AlertsStrip({ health }: { health: ProjectHealthResult }) {
  if (health.alerts.length === 0) return null
  const [open, setOpen] = useState(false)
  return (
    <div style={{ padding:'6px 10px', background:'rgba(248,113,113,0.06)', borderBottom:`1px solid rgba(248,113,113,0.15)`, flexShrink:0 }}>
      <button onClick={()=>setOpen(p=>!p)} style={{ display:'flex', alignItems:'center', gap:6, background:'transparent', border:'none', cursor:'pointer', width:'100%' }}>
        <span style={{ fontSize:10, color:'#f87171' }}>⚠</span>
        <span style={{ fontSize:9, color:'#f87171', fontWeight:700 }}>{health.alerts.length} alerta(s)</span>
        <span style={{ marginLeft:'auto', fontSize:10, color:T.dim }}>{open?'▲':'▼'}</span>
      </button>
      {open && (
        <div style={{ marginTop:5, paddingTop:5, borderTop:`1px solid rgba(248,113,113,0.15)` }}>
          {health.alerts.map((a,i)=>(
            <p key={i} style={{ margin:'0 0 3px', fontSize:9, color:'rgba(248,113,113,0.85)' }}>• {a}</p>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Copilot panel ───────────────────────────────────────────────────

export function ArqCopilot({ collapsed, onToggle, nextAction }: { collapsed: boolean; onToggle: () => void; nextAction?: string }) {
  const workspaceCtx   = useContext(WorkspaceContext)
  const isRealProject  = workspaceCtx?.isRealProject ?? false
  const ctx            = workspaceCtx?.projectCtx ?? EMPTY_PROJECT_CTX

  const [messages,  setMessages]  = useState<CopilotMessage[]>(() => [makeWelcomeMsg(isRealProject ? ctx.name : undefined)])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [activeTab, setActiveTab] = useState<PanelTab>('chat')
  const [loading,   setLoading]   = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // ── Re-seed welcome message when project loads ───────────────────────────
  const prevIsReal = useRef(isRealProject)
  useEffect(() => {
    if (isRealProject && !prevIsReal.current) {
      prevIsReal.current = true
      setMessages(prev => {
        if (prev.length === 1 && prev[0].id === 'msg-welcome') {
          return [makeWelcomeMsg(ctx.name)]
        }
        return prev
      })
    }
  }, [isRealProject, ctx.name])

  // ── Derived panels from local engines (pure TS, no mocks) ───────────────
  const questions   = useMemo(() => generateQuestions(ctx),        [ctx])
  const suggestions = useMemo(() => generateSuggestions(ctx),      [ctx])
  const tasks       = useMemo(() => generateTasks(ctx),            [ctx])
  const checklist   = useMemo(() => generateChecklist(ctx),        [ctx])
  const health      = useMemo(() => computeProjectHealth(ctx),     [ctx])
  const progress    = useMemo(() => computeProgress(ctx),          [ctx])
  const workflow    = useMemo(() => buildWorkflow('INITIAL', ctx), [ctx])
  const renderReady = useMemo(() => Math.max(0, Math.min(100, progress - 15)), [progress])

  // ── Build history array for API (last 8 exchanges) ───────────────────────
  const buildHistory = useCallback((msgs: CopilotMessage[]) => {
    return msgs
      .filter(m => m.role === 'USER' || m.role === 'COPILOT')
      .slice(-8)
      .map(m => ({
        role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
        content: m.text,
      }))
  }, [])

  // ── Send message to real AI ──────────────────────────────────────────────
  const sendToAI = useCallback(async (text: string, msgs: CopilotMessage[]) => {
    setLoading(true)
    abortRef.current = new AbortController()

    try {
      const res = await fetch(`${BASE}/arch/copilot/chat`, {
        method: 'POST',
        headers: authHeaders(),
        signal: abortRef.current.signal,
        body: JSON.stringify({
          message: text,
          projectId: isRealProject ? ctx.id : undefined,
          history: buildHistory(msgs),
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erro na resposta do servidor' }))
        const errMsg: CopilotMessage = {
          id: `msg-err-${Date.now()}`,
          role: 'COPILOT',
          timestamp: new Date().toISOString(),
          text: `⚠ ${err.error ?? 'Não foi possível obter resposta. Tente novamente.'}`,
        }
        setMessages(prev => [...prev, errMsg])
        return
      }

      const data = await res.json() as {
        reply: string
        actions: Array<{ label: string; value: string; variant: string }>
        provider: string
        tokens: { input: number; output: number }
        durationMs: number
      }

      const aiMsg: CopilotMessage = {
        id: `msg-ai-${Date.now()}`,
        role: 'COPILOT',
        timestamp: new Date().toISOString(),
        text: data.reply,
        actions: data.actions?.map(a => ({
          label: a.label,
          value: a.value,
          variant: (a.variant === 'PRIMARY' ? 'PRIMARY' : 'SECONDARY') as 'PRIMARY' | 'SECONDARY' | 'GHOST',
        })) ?? [],
      }

      setMessages(prev => [...prev, aiMsg])
      setDecisions(prev => addDecision(prev, 'IA', `Resposta gerada (${data.tokens?.input ?? 0}+${data.tokens?.output ?? 0} tokens)`))
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      const errMsg: CopilotMessage = {
        id: `msg-err-${Date.now()}`,
        role: 'COPILOT',
        timestamp: new Date().toISOString(),
        text: '⚠ Erro de conexão. Verifique sua rede e tente novamente.',
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }, [ctx.id, isRealProject, buildHistory])

  function handleSend(text: string) {
    const userMsg: CopilotMessage = {
      id: `msg-u-${Date.now()}`,
      role: 'USER',
      timestamp: new Date().toISOString(),
      text,
    }
    setMessages(prev => {
      const next = [...prev, userMsg]
      sendToAI(text, next)
      return next
    })
    setDecisions(prev => addDecision(prev, 'USUARIO', `Pergunta: "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`))
  }

  function handleAction(value: string) {
    const ACTION_LABELS: Record<string, string> = {
      gerar_render:      'Gerar novo render',
      atualizar_prompt:  'Atualizar prompt',
      abrir_biblioteca:  'Abrir biblioteca',
      criar_memorial:    'Criar memorial descritivo',
      criar_orcamento:   'Criar orçamento preliminar',
      comparar_versoes:  'Comparar versões',
      adicionar_ambiente:'Adicionar ambiente',
      ver_catalogo:      'Ver catálogo',
      abrir_projeto:     'Abrir projeto',
    }
    const label = ACTION_LABELS[value] ?? value
    handleSend(label)
    setDecisions(prev => addDecision(prev, 'USUARIO', `Ação solicitada: ${label}`))
  }

  function handleChip(value: string) {
    handleSend(value)
  }

  function handleCancel() {
    abortRef.current?.abort()
    setLoading(false)
  }

  function handleRegenerate() {
    const lastUser = [...messages].reverse().find(m => m.role === 'USER')
    if (!lastUser || loading) return
    sendToAI(lastUser.text, messages)
    setDecisions(prev => addDecision(prev, 'USUARIO', 'Regeneração solicitada'))
  }

  const TABS: Array<{ id: PanelTab; label: string; icon: string; badge?: number }> = [
    { id:'chat',      label:'Chat',     icon:'💬', badge: questions.filter(q=>q.status==='PENDING').length || undefined },
    { id:'tasks',     label:'Tarefas',  icon:'✅', badge: tasks.filter(t=>t.status==='PENDING').length || undefined },
    { id:'checklist', label:'Check',    icon:'📋' },
    { id:'workflow',  label:'Fluxo',    icon:'🔄' },
    { id:'decisions', label:'Decisões', icon:'📝', badge: decisions.length || undefined },
  ]

  if (collapsed) {
    return (
      <div style={{
        width:40, flexShrink:0, background:'rgba(255,255,255,0.03)', borderLeft:`1px solid ${T.border}`,
        display:'flex', flexDirection:'column', alignItems:'center', paddingTop:8, gap:2,
      }}>
        <button onClick={onToggle} style={{ padding:'6px', borderRadius:6, border:'none', background:'transparent', cursor:'pointer', color:T.dim, fontSize:16 }} title='Abrir Copilot'>◂</button>
        <div style={{ width:24, height:24, borderRadius:'50%', background:T.purple, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, marginTop:4 }}>🤖</div>
        {tasks.filter(t=>t.status==='PENDING').length > 0 && (
          <div style={{ width:16, height:16, borderRadius:'50%', background:'#f87171', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:700, color:'#fff' }}>
            {tasks.filter(t=>t.status==='PENDING').length}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{
      width:300, flexShrink:0, background:'rgba(255,255,255,0.02)', borderLeft:`1px solid ${T.border}`,
      display:'flex', flexDirection:'column', overflow:'hidden',
    }}>

      <div style={{ padding:'8px 12px', borderBottom:`1px solid ${T.border}`, flexShrink:0, background:'rgba(124,58,237,0.06)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:28, height:28, borderRadius:'50%', background:'rgba(124,58,237,0.2)', border:`2px solid ${T.purple}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>
            🤖
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ margin:'0 0 1px', fontSize:11, fontWeight:800, color:'#fff' }}>ARQ Copilot</p>
            <HealthBadge health={health}/>
          </div>
          {isRealProject ? (
            <span title={`Projeto: ${ctx.name}`} style={{ fontSize:9, padding:'2px 6px', borderRadius:5, background:'rgba(74,222,128,0.1)', color:'#4ade80', fontWeight:700, maxWidth:80, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flexShrink:0 }}>
              ✓ {ctx.name}
            </span>
          ) : (
            <span title="Abra um projeto para contexto completo" style={{ fontSize:9, padding:'2px 6px', borderRadius:5, background:'rgba(251,191,36,0.12)', color:'#fbbf24', fontWeight:700, flexShrink:0 }}>
              Sem projeto
            </span>
          )}
          <button onClick={onToggle} style={{ padding:'4px', borderRadius:5, border:'none', background:'transparent', cursor:'pointer', color:T.dim, fontSize:14 }} title='Recolher'>▸</button>
        </div>
      </div>

      <ProgressBar value={progress} renderReady={renderReady}/>
      <AlertsStrip health={health}/>

      <div style={{ display:'flex', borderBottom:`1px solid ${T.border}`, flexShrink:0, overflowX:'auto' }}>
        {TABS.map(tab=>(
          <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{
            flex:1, padding:'7px 4px', border:'none', background:'transparent', cursor:'pointer',
            color:activeTab===tab.id?'#fff':T.dim, fontSize:9, fontWeight:activeTab===tab.id?700:400,
            borderBottom:`2px solid ${activeTab===tab.id?T.purple:'transparent'}`,
            display:'flex', flexDirection:'column', alignItems:'center', gap:1, position:'relative',
          }}>
            <span style={{ fontSize:13 }}>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.badge ? (
              <span style={{ position:'absolute', top:3, right:5, width:14, height:14, borderRadius:'50%', background:'#f87171', fontSize:8, fontWeight:700, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
                {tab.badge > 9 ? '9+' : tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        {activeTab==='chat' && nextAction && messages.length <= 1 && (
          <div style={{
            padding:'8px 12px', background:'rgba(124,58,237,0.1)', borderBottom:`1px solid rgba(124,58,237,0.2)`,
            flexShrink:0, display:'flex', alignItems:'center', gap:8,
          }}>
            <span style={{ fontSize:14, flexShrink:0 }}>💡</span>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ margin:'0 0 1px', fontSize:8, color:T.purpleL, fontWeight:700, letterSpacing:'0.06em' }}>PRÓXIMA AÇÃO SUGERIDA</p>
              <p style={{ margin:0, fontSize:10, color:'#fff', lineHeight:1.3 }}>{nextAction}</p>
            </div>
            <button
              onClick={() => {
                const msg = `Como devo executar esta etapa: "${nextAction}"?`
                const userMsg = { id:`msg-na-${Date.now()}`, role:'USER' as const, timestamp:new Date().toISOString(), text:msg }
                setMessages(prev => { const next=[...prev,userMsg]; sendToAI(msg,next); return next })
              }}
              style={{
                padding:'4px 10px', borderRadius:6, border:'none', cursor:'pointer',
                background:T.purple, color:'#fff', fontSize:9, fontWeight:700, flexShrink:0,
              }}
            >
              Perguntar →
            </button>
          </div>
        )}
        {activeTab==='chat' && (
          <ChatTab
            messages={messages}
            loading={loading}
            onAction={handleAction}
            onChip={handleChip}
            onSend={handleSend}
            onCancel={handleCancel}
            onRegenerate={handleRegenerate}
            questions={questions}
            suggestions={suggestions}
          />
        )}
        {activeTab==='tasks'     && <div style={{ flex:1, overflowY:'auto' }}><TasksTab tasks={tasks}/></div>}
        {activeTab==='checklist' && <div style={{ flex:1, overflowY:'auto' }}><ChecklistTab checklist={checklist}/></div>}
        {activeTab==='workflow'  && <div style={{ flex:1, overflowY:'auto' }}><WorkflowTab workflow={workflow}/></div>}
        {activeTab==='decisions' && <div style={{ flex:1, overflowY:'auto' }}><DecisionsTab decisions={decisions}/></div>}
      </div>
    </div>
  )
}
