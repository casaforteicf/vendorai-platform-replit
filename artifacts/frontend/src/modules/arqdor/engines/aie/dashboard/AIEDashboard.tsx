import { useState, useMemo, useCallback, useEffect } from 'react'
import { runAIE } from '../aie-engine'
import { generateDNA } from '../engines/dna-engine'
import type { AIEResult, ProjectScores, Recommendation, ValidationResult, RecommendationSeverity, ProjectContext, LearningProfile } from '../aie-types'
import {
  buildPrompt,
  TRANSLATORS,
  DETAIL_LEVELS,
} from '../../prompt-playwright/prompt-playwright'
import type { TranslatorId, DetailLevel } from '../../prompt-playwright/prompt-playwright'
import { buildLearningProfile, getMockLearningProfile } from '../engines/learning-engine'
import { useWorkspaceProject } from '../../../workspace/WorkspaceContext'
import { T } from '../../../shared/arqdor-theme'


// ─── Score gauge ──────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 85) return '#4ade80'
  if (s >= 70) return '#fbbf24'
  if (s >= 50) return '#fb923c'
  return '#f87171'
}

function ScoreGauge({ label, icon, score }: { label: string; icon: string; score: number }) {
  const color = scoreColor(score)
  return (
    <div style={{ padding:'12px', borderRadius:10, background:T.surface, border:`1px solid ${T.border}`, textAlign:'center' as const }}>
      <span style={{ fontSize:20, display:'block', marginBottom:6 }}>{icon}</span>
      <p style={{ margin:'0 0 6px', fontSize:9, color:T.dim, fontWeight:700, letterSpacing:'0.07em' }}>{label.toUpperCase()}</p>
      <p style={{ margin:'0 0 6px', fontSize:22, fontWeight:900, color }}>{score}</p>
      <div style={{ height:4, borderRadius:2, background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${score}%`, background:color, borderRadius:2, transition:'width 0.6s ease' }}/>
      </div>
    </div>
  )
}

const SCORE_META: Array<{ key: keyof ProjectScores; label: string; icon: string }> = [
  { key:'overall',        label:'Overall',        icon:'🏆' },
  { key:'renderReadiness',label:'Structural Readiness', icon:'🏗️' },
  { key:'material',       label:'Material',       icon:'🪵' },
  { key:'consistency',    label:'Consistência',   icon:'🔗' },
  { key:'composition',    label:'Composição',     icon:'⚖️'  },
  { key:'lighting',       label:'Iluminação',     icon:'💡' },
  { key:'photography',    label:'Fotografia',     icon:'📷' },
  { key:'geometry',       label:'Geometria',      icon:'📐' },
  { key:'promptQuality',  label:'Prompt',         icon:'⚡' },
]

// ─── Render Readiness Banner ──────────────────────────────────────────────────

function ReadinessBanner({ result }: { result: AIEResult }) {
  const { renderReadiness: rr } = result
  const color = rr.ready ? '#4ade80' : scoreColor(rr.score)
  return (
    <div style={{
      padding:'18px 22px', borderRadius:12, marginBottom:16,
      background: rr.ready ? 'rgba(74,222,128,0.07)' : rr.score >= 60 ? 'rgba(251,146,60,0.07)' : 'rgba(248,113,113,0.07)',
      border:`1px solid ${rr.ready ? 'rgba(74,222,128,0.25)' : rr.score >= 60 ? 'rgba(251,146,60,0.25)' : 'rgba(248,113,113,0.25)'}`,
      display:'flex', alignItems:'center', gap:20,
    }}>
      <div style={{ textAlign:'center' as const, flexShrink:0 }}>
        <p style={{ margin:0, fontSize:42, fontWeight:900, color, lineHeight:1 }}>{rr.score}<span style={{ fontSize:20 }}>%</span></p>
        <p style={{ margin:'4px 0 0', fontSize:10, fontWeight:700, color, letterSpacing:'0.05em' }}>
          {rr.ready ? '✓ PRONTIDÃO ESTRUTURAL OK' : 'PRONTIDÃO INCOMPLETA'}
        </p>
      </div>
      <div style={{ flex:1 }}>
        <p style={{ margin:'0 0 8px', fontSize:9, color:T.dim, lineHeight:1.5 }}>
          Structural Readiness é um checklist determinístico de completude/consistência do projeto. Não mede fidelidade visual do render; essa validação pertence ao Fidelity / AI Review.
        </p>
        {!rr.ready && rr.missing.length > 0 && (
          <div style={{ marginBottom:8 }}>
            <p style={{ margin:'0 0 4px', fontSize:9, fontWeight:700, color:'#f87171', letterSpacing:'0.07em' }}>BLOQUEANTES</p>
            {rr.missing.map((m, i) => <p key={i} style={{ margin:'0 0 3px', fontSize:10, color:'#f87171' }}>✗ {m.label}</p>)}
          </div>
        )}
        {rr.warnings.length > 0 && (
          <div style={{ marginBottom:8 }}>
            <p style={{ margin:'0 0 4px', fontSize:9, fontWeight:700, color:'#fbbf24', letterSpacing:'0.07em' }}>AVISOS</p>
            {rr.warnings.map((w, i) => <p key={i} style={{ margin:'0 0 3px', fontSize:10, color:'#fbbf24' }}>⚠ {w.label}</p>)}
          </div>
        )}
        {rr.passed.length > 0 && (
          <div>
            <p style={{ margin:'0 0 4px', fontSize:9, fontWeight:700, color:'#4ade80', letterSpacing:'0.07em' }}>APROVADO</p>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
              {rr.passed.map((p, i) => <span key={i} style={{ fontSize:9, padding:'2px 6px', borderRadius:5, background:'rgba(74,222,128,0.08)', color:'#4ade80' }}>✓ {p.label}</span>)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Recommendation item ──────────────────────────────────────────────────────

const SEV_COLOR: Record<RecommendationSeverity, string> = { INFO:'#60a5fa', WARNING:'#fbbf24', CRITICAL:'#f87171' }
const SEV_ICON:  Record<RecommendationSeverity, string> = { INFO:'ℹ', WARNING:'⚠', CRITICAL:'✗' }

function RecItem({ r }: { r: Recommendation }) {
  const [open, setOpen] = useState(false)
  const color = SEV_COLOR[r.severity]
  return (
    <div style={{ borderRadius:7, border:`1px solid ${color}22`, background:`${color}06`, marginBottom:6, overflow:'hidden' }}>
      <button onClick={()=>setOpen(p=>!p)} style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left' as const }}>
        <span style={{ color, fontSize:12, flexShrink:0 }}>{SEV_ICON[r.severity]}</span>
        <span style={{ flex:1, fontSize:11, color:T.text, lineHeight:1.4 }}>{r.message}</span>
        <span style={{ fontSize:9, padding:'2px 6px', borderRadius:5, background:`${color}15`, color, flexShrink:0 }}>{r.category}</span>
        <span style={{ fontSize:10, color:T.dim }}>{open?'▲':'▼'}</span>
      </button>
      {open && (
        <div style={{ padding:'0 12px 10px', borderTop:`1px solid ${color}15` }}>
          {r.detail && <p style={{ margin:'8px 0 4px', fontSize:10, color:T.dim, whiteSpace:'pre-wrap' as const, lineHeight:1.6 }}>{r.detail}</p>}
          {r.action && <p style={{ margin:'4px 0 0', fontSize:10, color, fontWeight:700 }}>→ {r.action}</p>}
          <p style={{ margin:'6px 0 0', fontSize:9, color:T.dim, fontStyle:'italic' as const }}>Nunca aplicado automaticamente.</p>
        </div>
      )}
    </div>
  )
}

// ─── Validation section ───────────────────────────────────────────────────────

const VAL_COLOR: Record<string, string> = { PASS:'#4ade80', WARN:'#fbbf24', FAIL:'#f87171' }
const VAL_ICON:  Record<string, string> = { PASS:'✓', WARN:'⚠', FAIL:'✗' }

function ValItem({ r }: { r: ValidationResult }) {
  const color = VAL_COLOR[r.status]
  return (
    <div style={{ display:'flex', gap:10, alignItems:'flex-start', padding:'7px 10px', borderRadius:6, background:'rgba(255,255,255,0.02)', border:`1px solid ${T.border}`, marginBottom:4 }}>
      <span style={{ color, fontSize:11, fontWeight:700, flexShrink:0, marginTop:1 }}>{VAL_ICON[r.status]}</span>
      <div style={{ flex:1 }}>
        <p style={{ margin:'0 0 2px', fontSize:10, color:T.text }}>{r.message}</p>
        {r.resolution && <p style={{ margin:0, fontSize:9, color:T.dim }}>→ {r.resolution}</p>}
      </div>
      <span style={{ fontSize:8, padding:'2px 5px', borderRadius:4, background:`${color}15`, color, flexShrink:0 }}>{r.rule}</span>
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'recommendations' | 'validation' | 'composition' | 'materials' | 'learning'

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id:'overview',        label:'Overview',        icon:'🏆' },
  { id:'recommendations', label:'Recomendações',   icon:'💬' },
  { id:'validation',      label:'Validações',      icon:'🔍' },
  { id:'composition',     label:'Composição',      icon:'⚖️'  },
  { id:'materials',       label:'Materiais',       icon:'🪵' },
  { id:'learning',        label:'Aprendizado',     icon:'🧠' },
]

// ─── Tab contents ─────────────────────────────────────────────────────────────

interface OverviewTabProps {
  result:       AIEResult
  projectCtx:   import('../aie-types').ProjectContext
  savedDNA:     string
  generatedDNA: string | null
  onGenerate:   () => void
  onCopyDNA:    (text: string) => void
  onSaveDNA:    (text: string) => void
  copied:       boolean
}

function OverviewTab({ result, projectCtx, savedDNA, generatedDNA, onGenerate, onCopyDNA, onSaveDNA, copied }: OverviewTabProps) {
  const displayDNA   = generatedDNA ?? savedDNA
  const hasGenerated = generatedDNA !== null
  const isUnsaved    = hasGenerated && generatedDNA !== savedDNA

  return (
    <div>
      <ReadinessBanner result={result}/>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:8 }}>
        {SCORE_META.map(({ key, label, icon }) => (
          <ScoreGauge key={key} label={label} icon={icon} score={result.scores[key]}/>
        ))}
      </div>

      {/* DNA */}
      <div style={{ marginTop:14, borderRadius:10, background:T.surface, border:`1px solid ${isUnsaved ? 'rgba(167,139,250,0.4)' : T.border}`, overflow:'hidden' }}>
        {/* DNA header */}
        <div style={{ padding:'10px 12px 8px', display:'flex', alignItems:'center', gap:8, borderBottom:`1px solid ${T.border}` }}>
          <span style={{ fontSize:13 }}>🧬</span>
          <p style={{ margin:0, fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.07em', flex:1 }}>DNA DO PROJETO</p>
          {isUnsaved && (
            <span style={{ fontSize:8, padding:'2px 6px', borderRadius:5, background:'rgba(167,139,250,0.15)', color:T.purpleL, fontWeight:700 }}>
              NÃO SALVO
            </span>
          )}
        </div>

        {/* DNA text */}
        <div style={{ padding:'10px 12px' }}>
          <p style={{
            margin:'0 0 10px', fontSize:11, color: hasGenerated ? T.text : T.dim,
            lineHeight:1.7, fontStyle: hasGenerated ? 'normal' as const : 'italic' as const,
            minHeight:36,
          }}>
            {displayDNA || '(não definido — clique em Gerar DNA)'}
          </p>

          {/* Action buttons */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const }}>
            <button
              onClick={onGenerate}
              style={{
                padding:'5px 12px', borderRadius:6, border:'none',
                background:T.purple, color:'#fff', cursor:'pointer',
                fontSize:10, fontWeight:700, display:'flex', alignItems:'center', gap:5,
              }}
            >
              🧬 Gerar DNA
            </button>

            {displayDNA && (
              <button
                onClick={() => onCopyDNA(displayDNA)}
                style={{
                  padding:'5px 10px', borderRadius:6, border:`1px solid ${T.border}`,
                  background:'transparent', color: copied ? '#4ade80' : T.dim,
                  cursor:'pointer', fontSize:10, fontWeight:600,
                }}
              >
                {copied ? '✓ Copiado' : '⎘ Copiar'}
              </button>
            )}

            {isUnsaved && (
              <button
                onClick={() => onSaveDNA(generatedDNA!)}
                style={{
                  padding:'5px 10px', borderRadius:6, border:`1px solid rgba(167,139,250,0.4)`,
                  background:'rgba(124,58,237,0.12)', color:T.purpleL,
                  cursor:'pointer', fontSize:10, fontWeight:700,
                }}
              >
                ↓ Salvar no projeto
              </button>
            )}
          </div>
        </div>
      </div>
      {/* Quick stats */}
      <div style={{ marginTop:12, display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
        {[
          ['Objetos', projectCtx.objects.length, '🏗️'],
          ['Materiais', projectCtx.materials.length, '🪵'],
          ['Recomendações', result.recommendations.length, '💬'],
          ['Alertas', result.validation.fail + result.validation.warn, '⚠️'],
        ].map(([label, value, icon]) => (
          <div key={String(label)} style={{ padding:'10px', borderRadius:8, background:T.surface, border:`1px solid ${T.border}`, textAlign:'center' as const }}>
            <span style={{ fontSize:18, display:'block', marginBottom:4 }}>{icon}</span>
            <p style={{ margin:'0 0 2px', fontSize:18, fontWeight:800, color:'#fff' }}>{value}</p>
            <p style={{ margin:0, fontSize:9, color:T.dim }}>{label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function RecommendationsTab({ result }: { result: AIEResult }) {
  const [filter, setFilter] = useState<RecommendationSeverity|'ALL'>('ALL')
  const recs = filter === 'ALL' ? result.recommendations : result.recommendations.filter(r=>r.severity===filter)
  const critical = result.recommendations.filter(r=>r.severity==='CRITICAL').length
  const warnings = result.recommendations.filter(r=>r.severity==='WARNING').length
  return (
    <div>
      <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' as const }}>
        {(['ALL','CRITICAL','WARNING','INFO'] as const).map(s=>(
          <button key={s} onClick={()=>setFilter(s)} style={{ padding:'4px 10px', borderRadius:7, border:`1px solid ${filter===s?T.purple:T.border}`, background:filter===s?'rgba(124,58,237,0.15)':'transparent', color:filter===s?T.purpleL:T.dim, cursor:'pointer', fontSize:10 }}>
            {s==='ALL'?`Todos (${result.recommendations.length})`:s==='CRITICAL'?`✗ Críticos (${critical})`:s==='WARNING'?`⚠ Avisos (${warnings})`:`ℹ Info`}
          </button>
        ))}
      </div>
      {recs.length===0 && <p style={{ textAlign:'center' as const, color:T.dim, padding:24, fontSize:12 }}>Nenhuma recomendação nesta categoria.</p>}
      {recs.map(r=><RecItem key={r.id} r={r}/>)}
      <p style={{ margin:'12px 0 0', fontSize:9, color:T.dim, fontStyle:'italic' as const }}>
        ℹ Nenhuma recomendação é aplicada automaticamente. Todas são apenas sugestões.
      </p>
    </div>
  )
}

function ValidationTab({ result }: { result: AIEResult }) {
  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        {[['PASS',result.validation.pass,'#4ade80'],['WARN',result.validation.warn,'#fbbf24'],['FAIL',result.validation.fail,'#f87171']].map(([k,v,c])=>(
          <div key={k} style={{ flex:1, padding:'10px', borderRadius:8, background:`${c}08`, border:`1px solid ${c}20`, textAlign:'center' as const }}>
            <p style={{ margin:'0 0 2px', fontSize:20, fontWeight:900, color:c as string }}>{v}</p>
            <p style={{ margin:0, fontSize:9, color:T.dim, fontWeight:700 }}>{k}</p>
          </div>
        ))}
        <div style={{ flex:1, padding:'10px', borderRadius:8, background:'rgba(124,58,237,0.06)', border:'1px solid rgba(124,58,237,0.2)', textAlign:'center' as const }}>
          <p style={{ margin:'0 0 2px', fontSize:20, fontWeight:900, color:T.purpleL }}>{result.validation.score}</p>
          <p style={{ margin:0, fontSize:9, color:T.dim, fontWeight:700 }}>SCORE</p>
        </div>
      </div>
      {result.validation.results.map(r=><ValItem key={r.id} r={r}/>)}
    </div>
  )
}

function CompositionTab({ result }: { result: AIEResult }) {
  const { composition: c, visualWeight: vw } = result
  return (
    <div style={{ display:'flex', flexDirection:'column' as const, gap:12 }}>
      {/* Metrics */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        {[
          ['Simetria', c.symmetry==='SYMMETRIC'?'Simétrico':c.symmetry==='ASYMMETRIC_BALANCED'?'Balanceado':'Desbalanceado'],
          ['Ritmo', c.rhythm],
          ['Contraste', c.contrastLevel],
          ['Eixo dominante', c.dominantAxis],
          ['Centro de atenção', c.attentionCenter.object],
          ['Peso total', c.totalVisualWeight.toString()],
        ].map(([k,v])=>(
          <div key={k} style={{ padding:'8px 10px', borderRadius:7, background:T.surface, border:`1px solid ${T.border}` }}>
            <p style={{ margin:'0 0 2px', fontSize:8, color:T.dim, fontWeight:700, letterSpacing:'0.06em' }}>{k}</p>
            <p style={{ margin:0, fontSize:11, color:T.text }}>{v}</p>
          </div>
        ))}
      </div>

      {/* Weight distribution */}
      <div style={{ padding:'12px', borderRadius:8, background:T.surface, border:`1px solid ${T.border}` }}>
        <p style={{ margin:'0 0 8px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>DISTRIBUIÇÃO DE PESO VISUAL</p>
        {[['Esquerda',c.weightDistribution.left],['Direita',c.weightDistribution.right],['Topo',c.weightDistribution.top],['Base',c.weightDistribution.bottom]].map(([k,v])=>(
          <div key={k} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
            <span style={{ fontSize:10, color:T.dim, width:60 }}>{k}</span>
            <div style={{ flex:1, height:6, borderRadius:3, background:'rgba(255,255,255,0.08)' }}>
              <div style={{ height:'100%', width:`${v}%`, borderRadius:3, background:T.purpleL }}/>
            </div>
            <span style={{ fontSize:10, color:T.purpleL, width:32, textAlign:'right' as const }}>{v}%</span>
          </div>
        ))}
      </div>

      {/* Hierarchy */}
      <div style={{ padding:'12px', borderRadius:8, background:T.surface, border:`1px solid ${T.border}` }}>
        <p style={{ margin:'0 0 8px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>HIERARQUIA VISUAL</p>
        {c.hierarchy.map(h=>(
          <div key={h.level} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <span style={{ fontSize:9, padding:'2px 7px', borderRadius:5, background:h.level===1?'rgba(124,58,237,0.2)':h.level===2?'rgba(251,146,60,0.1)':'rgba(255,255,255,0.06)', color:h.level===1?T.purpleL:h.level===2?'#fb923c':T.dim, fontWeight:700, flexShrink:0 }}>
              {h.level===1?'HERO':h.level===2?'PRIMARY':'SECONDARY'}
            </span>
            <span style={{ fontSize:10, color:T.text }}>{h.objects.join(', ')}</span>
          </div>
        ))}
      </div>

      {/* Visual weights */}
      <div style={{ padding:'12px', borderRadius:8, background:T.surface, border:`1px solid ${T.border}` }}>
        <p style={{ margin:'0 0 8px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>PESOS POR OBJETO</p>
        {vw.weights.slice(0,8).map(w=>(
          <div key={w.objectId} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
            <span style={{ fontSize:9, color:T.dim, flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{w.objectName}</span>
            <div style={{ width:100, height:5, borderRadius:2, background:'rgba(255,255,255,0.08)', flexShrink:0 }}>
              <div style={{ height:'100%', width:`${w.weight}%`, borderRadius:2, background:scoreColor(w.weight) }}/>
            </div>
            <span style={{ fontSize:9, color:T.purpleL, width:28, textAlign:'right' as const, flexShrink:0 }}>{w.weight}</span>
            <span style={{ fontSize:8, padding:'2px 5px', borderRadius:4, background:'rgba(255,255,255,0.05)', color:T.dim, flexShrink:0 }}>{w.zone}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MaterialsTab({ result }: { result: AIEResult }) {
  const { material: mat, consistency: con } = result
  return (
    <div style={{ display:'flex', flexDirection:'column' as const, gap:12 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
        {[['Cobertura', `${mat.coverage}%`,'🎯'],['Materiais únicos',mat.uniqueMaterials,'📋'],['Consistência',`${con.score}/100`,'🔗']].map(([k,v,icon])=>(
          <div key={k} style={{ padding:'10px', borderRadius:8, background:T.surface, border:`1px solid ${T.border}`, textAlign:'center' as const }}>
            <span style={{ fontSize:20, display:'block', marginBottom:4 }}>{icon}</span>
            <p style={{ margin:'0 0 2px', fontSize:16, fontWeight:800, color:T.purpleL }}>{v}</p>
            <p style={{ margin:0, fontSize:9, color:T.dim }}>{k}</p>
          </div>
        ))}
      </div>

      {mat.missingMaterials.length > 0 && (
        <div style={{ padding:'10px 12px', borderRadius:7, background:'rgba(248,113,113,0.06)', border:'1px solid rgba(248,113,113,0.2)' }}>
          <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:'#f87171', letterSpacing:'0.07em' }}>SEM MATERIAL ({mat.missingMaterials.length})</p>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
            {mat.missingMaterials.map(m=><span key={m} style={{ fontSize:9, padding:'2px 7px', borderRadius:5, background:'rgba(248,113,113,0.1)', color:'#f87171' }}>{m}</span>)}
          </div>
        </div>
      )}

      {con.issues.length > 0 && (
        <div>
          <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>INCONSISTÊNCIAS</p>
          {con.issues.map((issue,i)=>(
            <div key={i} style={{ padding:'8px 10px', borderRadius:6, background:'rgba(251,146,60,0.05)', border:'1px solid rgba(251,146,60,0.2)', marginBottom:6 }}>
              <p style={{ margin:'0 0 2px', fontSize:10, color:T.text }}>{issue.description}</p>
              <span style={{ fontSize:8, color:'#fb923c' }}>{issue.type} · {issue.severity}</span>
            </div>
          ))}
        </div>
      )}

      {mat.paletteConflicts.length > 0 && (
        <div>
          <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>CONFLITOS DE PALETA</p>
          {mat.paletteConflicts.map((c,i)=>(
            <div key={i} style={{ padding:'8px 10px', borderRadius:6, background:'rgba(248,113,113,0.05)', border:'1px solid rgba(248,113,113,0.2)', marginBottom:6 }}>
              <p style={{ margin:'0 0 2px', fontSize:10, color:T.text }}>{c.material1} × {c.material2}</p>
              <p style={{ margin:0, fontSize:9, color:T.dim }}>{c.reason}</p>
            </div>
          ))}
        </div>
      )}

      {mat.paletteConflicts.length === 0 && con.issues.length === 0 && (
        <div style={{ padding:'12px', borderRadius:8, background:'rgba(74,222,128,0.06)', border:'1px solid rgba(74,222,128,0.2)', textAlign:'center' as const }}>
          <p style={{ margin:0, fontSize:12, color:'#4ade80' }}>✓ Materiais consistentes. Nenhum conflito de paleta detectado.</p>
        </div>
      )}
    </div>
  )
}

// ─── Learning tab with real DB data ──────────────────────────────────────────

function LearningTabReal() {
  const [learningProfile, setLearningProfile] = useState<LearningProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const { projectCtx } = useWorkspaceProject()
  const projectId = projectCtx?.id

  useEffect(() => {
    async function fetchLearning() {
      setLoading(true)
      try {
        const token = localStorage.getItem('vendorai_token')
        const res = await fetch('/api/arq/learning', {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
        if (res.ok) {
          const data = await res.json()
          const contexts: ProjectContext[] = (data.snapshots ?? [])
            .filter((s: any) => s.projectSnapshot)
            .map((s: any) => s.projectSnapshot as ProjectContext)
          setLearningProfile(buildLearningProfile(contexts))
          return
        }
      } catch { /* ignore */ }
      setLearningProfile(getMockLearningProfile())
      setLoading(false)
    }
    fetchLearning().finally(() => setLoading(false))
  }, [projectId])

  const lp = learningProfile ?? getMockLearningProfile()
  const isReal = !!learningProfile

  return (
    <div style={{ display:'flex', flexDirection:'column' as const, gap:10 }}>
      <div style={{ padding:'12px', borderRadius:8, background:T.surface, border:`1px solid ${T.border}` }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <p style={{ margin:0, fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>PERFIL DO ARQUITETO</p>
          <span style={{ fontSize:9, padding:'2px 7px', borderRadius:5, background:'rgba(124,58,237,0.15)', color:T.purpleL }}>Confiança {lp.confidenceScore}%</span>
        </div>
        <p style={{ margin:'0 0 3px', fontSize:12, color:'#fff', fontWeight:700 }}>{lp.projectCount} projetos analisados</p>
        <p style={{ margin:0, fontSize:9, color:T.dim }}>Última atualização: {lp.lastUpdated}</p>
      </div>

      {[
        { label:'MADEIRAS PREFERIDAS', items:lp.preferredWoods, icon:'🪵' },
        { label:'PEDRAS PREFERIDAS', items:lp.preferredStones, icon:'🪨' },
        { label:'METAIS PREFERIDOS', items:lp.preferredMetals, icon:'⚙️' },
        { label:'MARCAS PREFERIDAS', items:lp.preferredBrands, icon:'🏭' },
        { label:'ESTILOS PREFERIDOS', items:lp.preferredStyles, icon:'🎨' },
      ].map(({ label, items, icon }) => items.length > 0 && (
        <div key={label} style={{ padding:'10px 12px', borderRadius:7, background:T.surface, border:`1px solid ${T.border}` }}>
          <p style={{ margin:'0 0 7px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>{icon} {label}</p>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' as const }}>
            {items.map(i=><span key={i} style={{ fontSize:10, padding:'3px 8px', borderRadius:6, background:'rgba(124,58,237,0.1)', color:T.purpleL }}>{i}</span>)}
          </div>
        </div>
      ))}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
        {[
          ['Lente', lp.preferredLens],
          ['Iluminação', lp.preferredLighting],
          ['Temp. Cor', lp.preferredColorTemp],
        ].map(([k,v])=>(
          <div key={k} style={{ padding:'10px', borderRadius:7, background:T.surface, border:`1px solid ${T.border}`, textAlign:'center' as const }}>
            <p style={{ margin:'0 0 3px', fontSize:8, color:T.dim, fontWeight:700 }}>{k}</p>
            <p style={{ margin:0, fontSize:12, fontWeight:800, color:'#fff' }}>{v}</p>
          </div>
        ))}
      </div>

      <p style={{ fontSize:9, color:T.dim, fontStyle:'italic' as const, margin:'4px 0 0' }}>
        {loading ? '🧠 Carregando histórico…' : isReal
          ? `🧠 Dados de aprendizado acumulados de ${lp.projectCount} projeto${lp.projectCount!==1?'s':''} salvos no banco.`
          : '🧠 Nenhum snapshot AIE salvo ainda — re-analise o projeto para gerar histórico real.'}
      </p>
    </div>
  )
}

// ─── Inline Prompt Panel ──────────────────────────────────────────────────────

function PromptQuickPanel({ aieResult, onClose }: { aieResult: AIEResult; onClose: () => void }) {
  const [translator, setTranslator] = useState<TranslatorId>('flux-1.1')
  const [detail,     setDetail]     = useState<DetailLevel>('detalhado')
  const [copiedKey,  setCopiedKey]  = useState<string | null>(null)

  const { projectCtx } = useWorkspaceProject()

  const pw = useMemo(
    () => buildPrompt(projectCtx, aieResult, translator, detail),
    [projectCtx, aieResult, translator, detail],
  )

  const info = TRANSLATORS.find(t => t.id === translator)!

  const copy = (key: string, text: string) => {
    void navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 1800)
  }

  return (
    <div style={{
      position:'absolute', inset:0, zIndex:50,
      background:'rgba(13,11,30,0.85)', backdropFilter:'blur(4px)',
      display:'flex', alignItems:'flex-start', justifyContent:'flex-end',
      padding:16,
    }}>
      <div style={{
        width:480, maxHeight:'calc(100% - 32px)', overflowY:'auto',
        background:'#100e26', border:'1px solid rgba(124,58,237,0.3)', borderRadius:12,
        boxShadow:'0 8px 32px rgba(0,0,0,0.6)',
      }}>
        {/* Panel header */}
        <div style={{ padding:'12px 16px', borderBottom:'1px solid rgba(255,255,255,0.08)', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:16 }}>⚡</span>
          <p style={{ margin:0, fontSize:12, fontWeight:800, color:'#fff', flex:1 }}>Gerar Prompt de Render</p>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'rgba(255,255,255,0.44)', cursor:'pointer', fontSize:16, padding:'0 4px' }}>✕</button>
        </div>

        <div style={{ padding:16, display:'flex', flexDirection:'column' as const, gap:12 }}>
          {/* Translator select */}
          <div>
            <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:'rgba(255,255,255,0.44)', letterSpacing:'0.07em' }}>MOTOR DE RENDER</p>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const }}>
              {TRANSLATORS.map(t => (
                <button key={t.id} onClick={()=>setTranslator(t.id)} style={{
                  padding:'5px 10px', borderRadius:6, border:`1px solid ${translator===t.id?'#7c3aed':'rgba(255,255,255,0.1)'}`,
                  background: translator===t.id?'rgba(124,58,237,0.2)':'transparent',
                  color: translator===t.id?'#a78bfa':'rgba(255,255,255,0.44)',
                  cursor:'pointer', fontSize:10, fontWeight:600,
                }}>{t.label}</button>
              ))}
            </div>
          </div>

          {/* Detail level */}
          <div>
            <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:'rgba(255,255,255,0.44)', letterSpacing:'0.07em' }}>NÍVEL DE DETALHE</p>
            <div style={{ display:'flex', gap:6 }}>
              {DETAIL_LEVELS.map(d => (
                <button key={d.id} onClick={()=>setDetail(d.id)} style={{
                  padding:'5px 10px', borderRadius:6, border:`1px solid ${detail===d.id?'#7c3aed':'rgba(255,255,255,0.1)'}`,
                  background: detail===d.id?'rgba(124,58,237,0.2)':'transparent',
                  color: detail===d.id?'#a78bfa':'rgba(255,255,255,0.44)',
                  cursor:'pointer', fontSize:10,
                }}>{d.label}</button>
              ))}
            </div>
          </div>

          {/* Info */}
          {info && (
            <div style={{ padding:'8px 10px', borderRadius:6, background:'rgba(124,58,237,0.08)', border:'1px solid rgba(124,58,237,0.15)' }}>
              <p style={{ margin:'0 0 3px', fontSize:10, color:'#a78bfa', fontWeight:700 }}>{info.label}</p>
              <p style={{ margin:0, fontSize:9, color:'rgba(255,255,255,0.44)' }}>{info.desc}</p>
            </div>
          )}

          {/* Prompts */}
          {[
            { key: 'positive', label: 'PROMPT POSITIVO',  text: pw.prompt,         color: '#4ade80' },
            { key: 'negative', label: 'PROMPT NEGATIVO',  text: pw.negativePrompt,  color: '#f87171' },
            ...(pw.parameters ? [{ key: 'params', label: 'PARÂMETROS', text: pw.parameters, color: '#fbbf24' }] : []),
          ].map(({ key, label, text, color }) => (
            <div key={key} style={{ borderRadius:8, border:`1px solid ${color}20`, background:`${color}05`, overflow:'hidden' }}>
              <div style={{ padding:'8px 10px', display:'flex', alignItems:'center', gap:8, borderBottom:`1px solid ${color}15` }}>
                <p style={{ margin:0, fontSize:8, fontWeight:700, color, letterSpacing:'0.07em', flex:1 }}>{label}</p>
                <button
                  onClick={()=>copy(key, text)}
                  style={{ padding:'3px 8px', borderRadius:4, border:`1px solid ${color}30`, background:`${color}10`, color, cursor:'pointer', fontSize:9, fontWeight:700 }}
                >
                  {copiedKey===key ? '✓ Copiado' : '⎘ Copiar'}
                </button>
              </div>
              <p style={{ margin:0, padding:'10px', fontSize:10, color:'rgba(255,255,255,0.8)', lineHeight:1.6, whiteSpace:'pre-wrap' as const }}>{text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── AIE Dashboard ────────────────────────────────────────────────────────────

export function AIEDashboard() {
  const [activeTab,       setActiveTab]       = useState<TabId>('overview')
  const [lastRun,         setLastRun]         = useState<string>(new Date().toLocaleTimeString('pt-BR'))
  const [runKey,          setRunKey]          = useState(0)
  const [savedDNA,        setSavedDNA]        = useState<string>('')
  const [generatedDNA,    setGeneratedDNA]    = useState<string | null>(null)
  const [copied,          setCopied]          = useState(false)
  const [showPromptPanel, setShowPromptPanel] = useState(false)
  const { projectCtx, setProjectCtx } = useWorkspaceProject()
  const isRealProject = projectCtx.objects.length > 0 || projectCtx.materials.length > 0

  // Keep savedDNA in sync with the real project DNA whenever context changes
  useEffect(() => {
    setSavedDNA(projectCtx.dna ?? '')
    setGeneratedDNA(null)
  }, [projectCtx.id])

  const result: AIEResult = useMemo(
    () => runAIE(projectCtx),
    // runKey forces a re-run on demand even if projectCtx reference didn't change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectCtx, runKey],
  )

  function handleRerun() {
    setRunKey(k => k + 1)
    setLastRun(new Date().toLocaleTimeString('pt-BR'))
  }

  const handleGenerate = useCallback(() => {
    const dna = generateDNA(projectCtx)
    setGeneratedDNA(dna)
    setCopied(false)
  }, [projectCtx])

  const handleCopyDNA = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  const handleSaveDNA = useCallback((text: string) => {
    setSavedDNA(text)
    setGeneratedDNA(null)
    // Push updated DNA back into the live project context
    setProjectCtx({ ...projectCtx, dna: text })
  }, [projectCtx, setProjectCtx])

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const, background:T.bg, position:'relative' as const }}>

      {/* Header */}
      <div style={{
        padding:'10px 18px', borderBottom:`1px solid ${T.border}`, flexShrink:0,
        display:'flex', alignItems:'center', gap:12,
      }}>
        <span style={{ fontSize:22 }}>🧠</span>
        <div style={{ flex:1 }}>
          <p style={{ margin:'0 0 1px', fontSize:13, fontWeight:800, color:'#fff' }}>ARQ Intelligence Engine</p>
          <p style={{ margin:0, fontSize:9, color:T.dim }}>
            Projeto: {projectCtx.name} · Analisado às {lastRun}
            {isRealProject && <span style={{ color:'#4ade80', marginLeft:6 }}>● dados reais</span>}
          </p>
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <span style={{ fontSize:9, padding:'3px 8px', borderRadius:8, background:'rgba(251,146,60,0.1)', color:'#fb923c', fontWeight:700 }}>SEM IA EXTERNA</span>
          <span style={{ fontSize:9, padding:'3px 8px', borderRadius:8, background:'rgba(74,222,128,0.08)', color:'#4ade80' }}>● Engines Ativos</span>
          <button
            onClick={() => setShowPromptPanel(p => !p)}
            style={{
              padding:'5px 12px', borderRadius:6, border:'none', cursor:'pointer', fontSize:11, fontWeight:700,
              background: showPromptPanel ? T.purpleL : 'rgba(124,58,237,0.2)',
              color: showPromptPanel ? '#0d0b1e' : T.purpleL,
              outline: showPromptPanel ? `2px solid ${T.purpleL}` : 'none',
              transition:'all 0.15s',
            }}>
            ⚡ Gerar Prompt
          </button>
          <button onClick={handleRerun} style={{ padding:'5px 12px', borderRadius:6, border:'none', background:T.purple, color:'#fff', cursor:'pointer', fontSize:11, fontWeight:700 }}>
            ⟳ Re-analisar{isRealProject ? ' + Salvar' : ''}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding:'0 18px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', gap:0, overflowX:'auto' as const }}>
        {TABS.map(tab => {
          const badgeCounts: Partial<Record<TabId, number>> = {
            recommendations: result.recommendations.filter(r=>r.severity==='CRITICAL'||r.severity==='WARNING').length,
            validation: result.validation.fail + result.validation.warn,
          }
          const badge = badgeCounts[tab.id]
          return (
            <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{
              padding:'10px 14px', border:'none', background:'transparent', cursor:'pointer',
              color: activeTab===tab.id ? '#fff' : T.dim, fontSize:11, fontWeight:activeTab===tab.id?700:400,
              borderBottom:`2px solid ${activeTab===tab.id?T.purple:'transparent'}`, whiteSpace:'nowrap' as const,
              display:'flex', alignItems:'center', gap:6,
            }}>
              {tab.icon} {tab.label}
              {badge ? <span style={{ fontSize:9, padding:'1px 5px', borderRadius:6, background:'rgba(248,113,113,0.2)', color:'#f87171', fontWeight:700 }}>{badge}</span> : null}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto' as const, padding:18 }}>
        {activeTab === 'overview'        && <OverviewTab result={result} projectCtx={projectCtx} savedDNA={savedDNA} generatedDNA={generatedDNA} onGenerate={handleGenerate} onCopyDNA={handleCopyDNA} onSaveDNA={handleSaveDNA} copied={copied}/>}
        {activeTab === 'recommendations' && <RecommendationsTab result={result}/>}
        {activeTab === 'validation'      && <ValidationTab result={result}/>}
        {activeTab === 'composition'     && <CompositionTab result={result}/>}
        {activeTab === 'materials'       && <MaterialsTab result={result}/>}
        {activeTab === 'learning'        && <LearningTabReal/>}
      </div>

      {/* Inline prompt panel overlay */}
      {showPromptPanel && (
        <PromptQuickPanel aieResult={result} onClose={() => setShowPromptPanel(false)} />
      )}
    </div>
  )
}
