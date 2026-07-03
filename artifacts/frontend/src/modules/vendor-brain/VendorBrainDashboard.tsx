// ─── Vendor Brain Dashboard — FASE 19 ────────────────────────────────────────
// Painel central do Cognitive Operating System.
// Mostra objetivos ativos, planos, agentes, status e observabilidade.
// UI mockada — motores reais integrados na próxima fase.

import { useState, useMemo } from 'react'
import { T } from '../arqdor/shared/arqdor-theme'
import {
  createVendorBrain, DOMAIN_RULES,
  type ExecutionPlan, type Intent, type AgentType,
  type PolicyViolation,
} from '@workspace/vendor-brain'

// ─── Color map ────────────────────────────────────────────────────────────────

const AGENT_COLORS: Record<AgentType, string> = {
  ARCHITECT_AI:    '#7c3aed',
  RENDER_AI:       '#e879f9',
  BUYER_AI:        '#f59e0b',
  MARKETING_AI:    '#4ade80',
  CRM_AI:          '#38bdf8',
  FINANCIAL_AI:    '#34d399',
  CONSTRUCTION_AI: '#f97316',
  KNOWLEDGE_AI:    '#a78bfa',
  ORCHESTRATOR:    '#94a3b8',
}

const AGENT_ICONS: Record<AgentType, string> = {
  ARCHITECT_AI:    '🏛️',
  RENDER_AI:       '🎬',
  BUYER_AI:        '🛒',
  MARKETING_AI:    '📣',
  CRM_AI:          '🤝',
  FINANCIAL_AI:    '💰',
  CONSTRUCTION_AI: '⚒️',
  KNOWLEDGE_AI:    '📚',
  ORCHESTRATOR:    '🧠',
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:   '#94a3b8',
  RUNNING:   '#38bdf8',
  COMPLETED: '#4ade80',
  FAILED:    '#f87171',
  CANCELLED: '#6b7280',
  WAITING:   '#94a3b8',
  READY:     '#fbbf24',
  SKIPPED:   '#4b5563',
}

// ─── Singleton brain instance (module-level, stable) ─────────────────────────

const brain = createVendorBrain()

// ─── Demo goals ───────────────────────────────────────────────────────────────

const DEMO_GOALS = [
  'Criar projeto de residência para família Rodrigues',
  'Gerar render da cozinha com estilo Japandi',
  'Revisar render aprovado pelo cliente',
  'Criar proposta comercial com orçamento',
  'Criar campanha de marketing no Instagram',
]

// ─── VendorBrainDashboard ─────────────────────────────────────────────────────

export function VendorBrainDashboard() {
  const [goalInput,      setGoalInput]      = useState('')
  const [selectedGoal,   setSelectedGoal]   = useState<string | null>(null)
  const [activePlans,    setActivePlans]     = useState<ExecutionPlan[]>([])
  const [activeIntents,  setActiveIntents]   = useState<Intent[]>([])
  const [violations,     setViolations]      = useState<PolicyViolation[]>([])
  const [selectedPlanId, setSelectedPlanId]  = useState<string | null>(null)
  const [isThinking,     setIsThinking]      = useState(false)
  const [tab,            setTab]             = useState<'objectives'|'plans'|'agents'|'reasoning'|'observability'>('objectives')

  const selectedPlan = useMemo(
    () => activePlans.find(p => p.id === selectedPlanId) ?? null,
    [activePlans, selectedPlanId],
  )

  // ── Think ──────────────────────────────────────────────────────────────────

  async function handleThink(goal: string) {
    if (!goal.trim() || isThinking) return
    setIsThinking(true)
    setViolations([])
    try {
      const result    = await brain.think(goal, 'demo-tenant', 'demo-user')
      const simulated = brain.orchestration.simulateRun(result.plan)
      brain.memory.record({
        tenantId:  'demo-tenant',
        userId:    'demo-user',
        goal,
        planId:    simulated.id,
        result:    simulated.status,
        learnings: ['Plano executado com sucesso em modo simulado'],
      })
      setActivePlans(prev  => [simulated, ...prev].slice(0, 8))
      setActiveIntents(prev => [result.intent, ...prev].slice(0, 8))
      setSelectedPlanId(simulated.id)
      setViolations(result.violations)
      setGoalInput('')
      setTab('plans')
    } finally {
      setIsThinking(false)
    }
  }

  function handleDemoGoal(g: string) {
    setSelectedGoal(g)
    void handleThink(g)
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const obsStats  = brain.observability.stats('demo-tenant')
  const decisions = brain.decision.all()
  const learnings = brain.memory.learnings('demo-tenant')

  const agentUsage = useMemo(() => {
    const counts: Partial<Record<AgentType, number>> = {}
    for (const plan of activePlans)
      for (const step of plan.steps)
        counts[step.agentType] = (counts[step.agentType] ?? 0) + 1
    return (Object.entries(counts) as [AgentType, number][])
      .sort((a, b) => b[1] - a[1])
  }, [activePlans])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' as const, background: T.bg, color: T.text, fontFamily: 'system-ui,sans-serif', overflow: 'hidden' }}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${T.border}`, background: T.sidebar, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' as const }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#fff' }}>🧠 Vendor Brain</h2>
            <p style={{ margin: 0, fontSize: 10, color: T.dim }}>FASE 19 — Cognitive Operating System · sem LLM · arquitetura pura</p>
          </div>
          {([
            ['Objetivos', activePlans.length],
            ['Etapas',    activePlans.reduce((a, p) => a + p.steps.length, 0)],
            ['Decisões',  decisions.length],
            ['Learnings', learnings.length],
          ] as [string, number][]).map(([label, value]) => (
            <div key={label} style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`, textAlign: 'center' as const }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: T.purpleL }}>{value}</p>
              <p style={{ margin: 0, fontSize: 9, color: T.dim }}>{label}</p>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', fontSize: 9, color: T.dim }}>Motor: in-memory · LLM: FASE 20</div>
        </div>

        {/* Goal input */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input
            value={goalInput}
            onChange={e => setGoalInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void handleThink(goalInput)}
            placeholder="Digite um objetivo… ex: Criar projeto para família Rodrigues"
            style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: `1px solid ${T.border}`, background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 12, outline: 'none' }}
          />
          <button
            onClick={() => void handleThink(goalInput)}
            disabled={isThinking || !goalInput.trim()}
            style={{ padding: '8px 16px', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer', background: isThinking ? T.border : T.purple, color: '#fff', border: 'none', opacity: isThinking || !goalInput.trim() ? 0.6 : 1 }}
          >
            {isThinking ? '⏳ Pensando…' : '🧠 Pensar'}
          </button>
        </div>

        {/* Quick goal chips */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' as const }}>
          {DEMO_GOALS.map(g => (
            <button
              key={g}
              onClick={() => handleDemoGoal(g)}
              style={{
                padding: '3px 8px', borderRadius: 10, fontSize: 9, cursor: 'pointer',
                background: selectedGoal === g ? 'rgba(124,58,237,0.2)' : 'transparent',
                border: `1px solid ${selectedGoal === g ? T.purple : T.border}`,
                color: selectedGoal === g ? T.purpleL : T.dim,
              }}
            >
              {g.length > 40 ? g.slice(0, 39) + '…' : g}
            </button>
          ))}
        </div>

        {/* Policy violations */}
        {violations.length > 0 && (
          <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(251,191,36,0.08)', border: `1px solid ${T.amber}` }}>
            {violations.map((v, i) => (
              <p key={i} style={{ margin: 0, fontSize: 10, color: T.amber }}>⚠️ {v.policy}: {v.message}</p>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, marginTop: 10 }}>
          {([
            ['objectives',    '🎯 Objetivos'],
            ['plans',         '📋 Planos'],
            ['agents',        '🤖 Agentes'],
            ['reasoning',     '🔍 Raciocínio'],
            ['observability', '📊 Observabilidade'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                padding: '5px 10px', borderRadius: '6px 6px 0 0', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                background: tab === id ? T.bg : 'transparent',
                border: `1px solid ${tab === id ? T.border : 'transparent'}`,
                borderBottom: tab === id ? `1px solid ${T.bg}` : `1px solid ${T.border}`,
                color: tab === id ? '#fff' : T.dim,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── BODY ───────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* ── TAB: OBJECTIVES ── */}
        {tab === 'objectives' && (
          <div style={{ flex: 1, overflowY: 'auto' as const, padding: 16 }}>
            <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: T.dim }}>OBJETIVOS ATIVOS</p>
            {activePlans.length === 0 && (
              <div style={{ padding: 48, textAlign: 'center' as const, color: T.dim, fontSize: 12 }}>
                <p style={{ fontSize: 32 }}>🧠</p>
                <p>Nenhum objetivo ainda.</p>
                <p style={{ fontSize: 10 }}>Digite uma instrução no campo acima ou clique em um objetivo de exemplo.</p>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {activePlans.map((plan, idx) => {
                const intent      = activeIntents[idx]
                const completed   = plan.steps.filter(s => s.status === 'COMPLETED').length
                const progress    = plan.steps.length > 0 ? completed / plan.steps.length : 0
                const primaryAgent = brain.routing.intentToAgent(intent?.type ?? 'UNKNOWN')
                return (
                  <div
                    key={plan.id}
                    onClick={() => { setSelectedPlanId(plan.id); setTab('plans') }}
                    style={{ padding: 14, borderRadius: 8, background: T.sidebar, border: `1px solid ${selectedPlanId === plan.id ? T.purple : T.border}`, cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 20 }}>{AGENT_ICONS[primaryAgent]}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                          {plan.goal.replace(/^[A-Z_]+: /, '')}
                        </p>
                        <p style={{ margin: 0, fontSize: 9, color: T.purpleL }}>{intent?.type ?? '—'}</p>
                      </div>
                      <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 8, fontWeight: 700, background: `${STATUS_COLORS[plan.status] ?? T.dim}20`, color: STATUS_COLORS[plan.status] ?? T.dim }}>
                        {plan.status}
                      </span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', marginBottom: 6 }}>
                      <div style={{ height: '100%', borderRadius: 2, background: T.purple, width: `${progress * 100}%` }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: T.dim }}>
                      <span>{completed}/{plan.steps.length} etapas</span>
                      <span>~{(plan.estimatedMs / 1000).toFixed(1)}s</span>
                      <span>conf. {(plan.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── TAB: PLANS ── */}
        {tab === 'plans' && (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Plan list sidebar */}
            <div style={{ width: 240, flexShrink: 0, borderRight: `1px solid ${T.border}`, overflowY: 'auto' as const, padding: 12 }}>
              <p style={{ margin: '0 0 8px', fontSize: 9, fontWeight: 700, color: T.dim }}>PLANOS ({activePlans.length})</p>
              {activePlans.length === 0 && <p style={{ fontSize: 10, color: T.dim }}>Nenhum plano ainda.</p>}
              {activePlans.map(plan => (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  style={{
                    padding: '8px 10px', borderRadius: 6, marginBottom: 6, cursor: 'pointer',
                    background: selectedPlanId === plan.id ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${selectedPlanId === plan.id ? T.purple : T.border}`,
                  }}
                >
                  <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    {plan.goal.replace(/^[A-Z_]+: /, '').slice(0, 30)}
                  </p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ fontSize: 8, color: STATUS_COLORS[plan.status] ?? T.dim }}>{plan.status}</span>
                    <span style={{ fontSize: 8, color: T.dim }}>{plan.steps.length} etapas</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Plan detail */}
            <div style={{ flex: 1, overflowY: 'auto' as const, padding: 16 }}>
              {!selectedPlan ? (
                <p style={{ color: T.dim, fontSize: 12 }}>Selecione um plano à esquerda.</p>
              ) : (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <h3 style={{ margin: '0 0 4px', fontSize: 14, color: '#fff' }}>{selectedPlan.goal.replace(/^[A-Z_]+: /, '')}</h3>
                    <div style={{ display: 'flex', gap: 10, fontSize: 10, color: T.dim }}>
                      <span>Conf.: <b style={{ color: T.purpleL }}>{(selectedPlan.confidence * 100).toFixed(0)}%</b></span>
                      <span>Estimado: <b style={{ color: T.purpleL }}>~{(selectedPlan.estimatedMs / 1000).toFixed(1)}s</b></span>
                      <span>Status: <b style={{ color: STATUS_COLORS[selectedPlan.status] }}>{selectedPlan.status}</b></span>
                    </div>
                  </div>

                  {/* Task graph — vertical timeline */}
                  <p style={{ margin: '0 0 8px', fontSize: 9, fontWeight: 700, color: T.dim }}>GRAFO DE TAREFAS</p>
                  {selectedPlan.steps.map((step, idx) => (
                    <div key={step.id} style={{ display: 'flex', gap: 12, marginBottom: 4, alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', flexShrink: 0 }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: '50%',
                          background: `${STATUS_COLORS[step.status] ?? T.dim}20`,
                          border: `2px solid ${STATUS_COLORS[step.status] ?? T.dim}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, flexShrink: 0, color: STATUS_COLORS[step.status] ?? T.dim,
                        }}>
                          {step.status === 'COMPLETED' ? '✓' : step.status === 'FAILED' ? '✗' : idx + 1}
                        </div>
                        {idx < selectedPlan.steps.length - 1 && (
                          <div style={{ width: 1, height: 22, background: T.border }} />
                        )}
                      </div>
                      <div style={{ flex: 1, paddingBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
                          <span style={{ fontSize: 12 }}>{AGENT_ICONS[step.agentType]}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{step.label}</span>
                          <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: `${AGENT_COLORS[step.agentType]}20`, color: AGENT_COLORS[step.agentType] }}>
                            {step.agentType}
                          </span>
                          <span style={{ fontSize: 8, color: STATUS_COLORS[step.status], marginLeft: 'auto' }}>{step.status}</span>
                        </div>
                        <p style={{ margin: '2px 0 0 18px', fontSize: 9, color: T.dim }}>{step.description}</p>
                        {step.dependsOn.length > 0 && (
                          <p style={{ margin: '1px 0 0 18px', fontSize: 8, color: T.dim }}>
                            Depende: {step.dependsOn.map(d => `#${selectedPlan.steps.findIndex(s => s.id === d) + 1}`).join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: AGENTS ── */}
        {tab === 'agents' && (
          <div style={{ flex: 1, overflowY: 'auto' as const, padding: 16 }}>
            <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: T.dim }}>AGENTES DISPONÍVEIS</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {(Object.entries(AGENT_ICONS) as [AgentType, string][]).map(([agent, icon]) => {
                const usage = agentUsage.find(([a]) => a === agent)?.[1] ?? 0
                return (
                  <div key={agent} style={{ padding: 14, borderRadius: 8, background: T.sidebar, border: `1px solid ${T.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 8,
                        background: `${AGENT_COLORS[agent]}20`, border: `1px solid ${AGENT_COLORS[agent]}50`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
                      }}>
                        {icon}
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#fff' }}>
                          {agent.replace(/_AI$/, ' AI').replace(/_/g, ' ')}
                        </p>
                        <p style={{ margin: 0, fontSize: 9, color: AGENT_COLORS[agent] }}>
                          {usage > 0 ? `${usage} etapas atribuídas` : 'Disponível'}
                        </p>
                      </div>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                      <div style={{ height: '100%', borderRadius: 2, background: AGENT_COLORS[agent], width: `${Math.min(100, usage * 15)}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── TAB: REASONING ── */}
        {tab === 'reasoning' && (
          <div style={{ flex: 1, overflowY: 'auto' as const, padding: 16 }}>
            <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: T.dim }}>REGRAS DE DOMÍNIO ({DOMAIN_RULES.length})</p>
            <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
              {DOMAIN_RULES.map(rule => (
                <div key={rule.id} style={{ padding: 10, borderRadius: 6, background: T.sidebar, border: `1px solid ${T.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(124,58,237,0.15)', color: T.purpleL }}>{rule.domain}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{rule.name}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 9, color: T.dim }}>{rule.text}</p>
                </div>
              ))}
            </div>

            <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: T.dim }}>DECISÕES REGISTRADAS ({decisions.length})</p>
            {decisions.length === 0 && <p style={{ fontSize: 10, color: T.dim }}>Execute um objetivo para ver as decisões.</p>}
            {decisions.slice(0, 10).map(d => (
              <div key={d.id} style={{ padding: 10, borderRadius: 6, background: T.sidebar, border: `1px solid ${T.border}`, marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' as const }}>
                  <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: 'rgba(56,189,248,0.15)', color: '#38bdf8' }}>{d.type}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{d.chosen.slice(0, 60)}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 9, color: T.purpleL }}>{(d.confidence * 100).toFixed(0)}%</span>
                </div>
                <p style={{ margin: 0, fontSize: 9, color: T.dim }}>{d.reason}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── TAB: OBSERVABILITY ── */}
        {tab === 'observability' && (
          <div style={{ flex: 1, overflowY: 'auto' as const, padding: 16 }}>
            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
              {([
                ['Total de runs',   String(obsStats.totalRuns)],
                ['Taxa de sucesso', `${(obsStats.successRate * 100).toFixed(0)}%`],
                ['Duração média',   `${obsStats.avgDurationMs.toFixed(0)}ms`],
                ['Últimas 24h',     String(obsStats.last24hRuns)],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} style={{ padding: 14, borderRadius: 8, background: T.sidebar, border: `1px solid ${T.border}`, textAlign: 'center' as const }}>
                  <p style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 900, color: T.purpleL }}>{value}</p>
                  <p style={{ margin: 0, fontSize: 9, color: T.dim }}>{label}</p>
                </div>
              ))}
            </div>

            {/* Learnings */}
            <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: T.dim }}>LEARNINGS CAPTURADOS ({learnings.length})</p>
            {learnings.length === 0 && <p style={{ fontSize: 10, color: T.dim }}>Execute objetivos para gerar learnings.</p>}
            {learnings.map((l, i) => (
              <div key={i} style={{ padding: '6px 10px', borderRadius: 6, background: T.sidebar, border: `1px solid ${T.border}`, marginBottom: 4, fontSize: 10, color: T.text }}>
                💡 {l}
              </div>
            ))}

            {/* Security policies */}
            <p style={{ margin: '16px 0 8px', fontSize: 11, fontWeight: 700, color: T.dim }}>POLÍTICAS DE SEGURANÇA</p>
            {([
              ['Tenant Isolation', 'Dados nunca cruzam fronteiras de tenant'],
              ['Permission Check', 'Permissão "execute" requerida para planos'],
              ['Min Confidence',   'Planos com confiança < 45% são alertados'],
            ] as [string, string][]).map(([name, desc]) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, background: T.sidebar, border: `1px solid ${T.border}`, marginBottom: 6 }}>
                <span style={{ fontSize: 14 }}>✅</span>
                <div>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#fff' }}>{name}</p>
                  <p style={{ margin: 0, fontSize: 9, color: T.dim }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
