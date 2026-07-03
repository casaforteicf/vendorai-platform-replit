import { useState, useMemo } from 'react'
import { MOCK_PROJECT } from '../../../../pages/arch/arqdor/domain/arqdor-mock-project'
import { generateFullPromptStructure } from '../../../../pages/arch/arqdor/domain/arqdor-prompt-engine'
import type { PromptStructure } from '../../../../pages/arch/arqdor/domain/arqdor-domain-types'
import { runAIE } from '../../engines/aie/aie-engine'
import { MOCK_PROJECT_CONTEXT } from '../../engines/aie/aie-mock-context'
import {
  buildPrompt,
  TRANSLATORS,
  DETAIL_LEVELS,
} from '../../engines/prompt-playwright/prompt-playwright'
import type { TranslatorId, DetailLevel, PlaywrightPrompt } from '../../engines/prompt-playwright/prompt-playwright'

const T = {
  bg:'#0d0b1e', surface:'#13102b', card:'rgba(255,255,255,0.04)',
  border:'rgba(255,255,255,0.08)', purple:'#7c3aed', purpleL:'#a78bfa',
  text:'rgba(255,255,255,0.88)', dim:'rgba(255,255,255,0.44)',
} as const

// ─── Playground tab (existing) ────────────────────────────────────────────────

const SECTIONS: { key: keyof PromptStructure; label: string; accent: string; desc: string }[] = [
  { key:'corePrompt',    label:'Core',     accent:'124,58,237',   desc:'Preservação absoluta e qualidade base' },
  { key:'projectPrompt', label:'Project',  accent:'59,130,246',   desc:'Modificações específicas do projeto' },
  { key:'objectPrompt',  label:'Objects',  accent:'16,185,129',   desc:'Fragmentos por objeto arquitetônico' },
  { key:'rulePrompt',    label:'Rules',    accent:'239,68,68',    desc:'Restrições críticas traduzidas' },
  { key:'dnaPrompt',     label:'DNA',      accent:'168,85,247',   desc:'Identidade arquitetônica do projeto' },
  { key:'renderPrompt',  label:'Render',   accent:'245,158,11',   desc:'Configuração técnica de renderização' },
  { key:'negativePrompt',label:'Negative', accent:'248,113,113',  desc:'O que a IA NÃO deve fazer' },
  { key:'finalPrompt',   label:'Final',    accent:'52,211,153',   desc:'Prompt unificado pronto para uso' },
]

function PlaygroundTab() {
  const [structure, setStructure] = useState<PromptStructure>(() => generateFullPromptStructure(MOCK_PROJECT))
  const [open, setOpen] = useState<Set<string>>(new Set(['corePrompt','finalPrompt']))
  const [copied, setCopied] = useState<string|null>(null)
  const [editKey, setEditKey] = useState<string|null>(null)

  const tokenCount = Math.floor(structure.finalPrompt.length / 4)

  const copy = (key: string, text: string) => {
    void navigator.clipboard.writeText(text)
    setCopied(key); setTimeout(()=>setCopied(null), 1800)
  }

  const toggle = (key: string) => setOpen(prev => {
    const n = new Set(prev); n.has(key)?n.delete(key):n.add(key); return n
  })

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const }}>
      {/* Sub-header */}
      <div style={{ padding:'12px 20px 10px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ flex:1 }}>
          <p style={{ margin:0, fontSize:11, color:T.dim }}>{tokenCount} tokens estimados — gerado a partir do modelo do projeto</p>
        </div>
        <button onClick={()=>setStructure(generateFullPromptStructure(MOCK_PROJECT))}
          style={{ padding:'5px 12px', borderRadius:6, border:`1px solid ${T.border}`, background:'rgba(255,255,255,0.05)', color:T.dim, cursor:'pointer', fontSize:11 }}>
          🔄 Regenerar
        </button>
        <button onClick={()=>copy('all',structure.finalPrompt)}
          style={{ padding:'5px 12px', borderRadius:6, border:'none', background:T.purple, color:'#fff', cursor:'pointer', fontSize:11, fontWeight:700 }}>
          {copied==='all'?'✓ Copiado':'📋 Copiar Final'}
        </button>
      </div>

      <div style={{ flex:1, overflowY:'auto' as const, padding:'12px 20px', display:'flex', flexDirection:'column' as const, gap:8 }}>
        {SECTIONS.map(s => {
          const val = structure[s.key]
          const isOpen = open.has(s.key)
          return (
            <div key={s.key} style={{ borderRadius:8, overflow:'hidden', border:`1px solid rgba(${s.accent},0.2)` }}>
              <div onClick={()=>toggle(s.key)} style={{
                display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                background:`rgba(${s.accent},0.07)`, cursor:'pointer',
              }}>
                <span style={{ padding:'2px 8px', borderRadius:4, fontSize:9, fontWeight:800, background:`rgba(${s.accent},0.2)`, color:`rgb(${s.accent})` }}>
                  {s.label.toUpperCase()}
                </span>
                <div style={{ flex:1 }}>
                  <p style={{ margin:0, fontSize:11, color:T.dim }}>{s.desc}</p>
                </div>
                <span style={{ fontSize:9, color:T.dim }}>{Math.floor((val?.length??0)/4)} tokens</span>
                <button onClick={e=>{e.stopPropagation();copy(s.key,val??'')}}
                  style={{ padding:'2px 8px', borderRadius:4, border:`1px solid rgba(${s.accent},0.3)`, background:'transparent', color:`rgb(${s.accent})`, fontSize:10, cursor:'pointer' }}>
                  {copied===s.key?'✓':'Copiar'}
                </button>
                <span style={{ fontSize:10, color:T.dim }}>{isOpen?'▾':'▸'}</span>
              </div>
              {isOpen && (
                <div style={{ padding:'12px 14px', background:'rgba(255,255,255,0.02)' }}>
                  {editKey===s.key ? (
                    <textarea
                      defaultValue={val??''}
                      onBlur={e => {
                        setStructure(prev => ({ ...prev, [s.key]: e.target.value }))
                        setEditKey(null)
                      }}
                      autoFocus
                      style={{ width:'100%', minHeight:120, background:'rgba(255,255,255,0.04)', border:`1px solid rgba(${s.accent},0.3)`,
                        borderRadius:6, color:T.text, fontSize:11, padding:'8px', fontFamily:'ui-monospace,monospace',
                        lineHeight:1.65, resize:'vertical' as const, outline:'none', boxSizing:'border-box' as const }}
                    />
                  ) : (
                    <p onDoubleClick={()=>setEditKey(s.key)}
                      style={{ margin:0, fontSize:11, color:T.text, lineHeight:1.65, fontFamily:'ui-monospace,monospace',
                        whiteSpace:'pre-wrap' as const, cursor:'text' }}>
                      {val || <span style={{ color:T.dim, fontStyle:'italic' }}>(vazio)</span>}
                    </p>
                  )}
                  {editKey!==s.key && (
                    <p style={{ margin:'6px 0 0', fontSize:9, color:T.dim }}>Duplo clique para editar</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── AIE Playwright tab ───────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 85) return '#4ade80'
  if (s >= 70) return '#fbbf24'
  return '#f87171'
}

function PromptPreview({ pw }: { pw: PlaywrightPrompt }) {
  const [copiedKey, setCopiedKey] = useState<string|null>(null)
  const [openSections, setOpenSections] = useState(true)

  const copy = (key: string, text: string) => {
    void navigator.clipboard.writeText(text)
    setCopiedKey(key); setTimeout(()=>setCopiedKey(null), 1800)
  }

  return (
    <div style={{ display:'flex', flexDirection:'column' as const, gap:12 }}>
      {/* Main prompt */}
      <div style={{ borderRadius:10, border:`1px solid rgba(124,58,237,0.3)`, overflow:'hidden' }}>
        <div style={{ padding:'10px 14px', background:'rgba(124,58,237,0.1)', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:4, background:'rgba(124,58,237,0.25)', color:'#a78bfa' }}>PROMPT</span>
          <span style={{ flex:1, fontSize:11, color:T.dim }}>Pronto para colar no tradutor</span>
          <span style={{ fontSize:9, color:T.dim }}>{pw.estimatedTokens} tokens</span>
          <button
            onClick={() => copy('prompt', pw.prompt)}
            style={{ padding:'4px 12px', borderRadius:6, border:'none', background:'#7c3aed', color:'#fff', cursor:'pointer', fontSize:10, fontWeight:700 }}>
            {copiedKey==='prompt' ? '✓ Copiado' : '📋 Copiar'}
          </button>
        </div>
        <div style={{ padding:'14px', background:'rgba(255,255,255,0.02)' }}>
          <p style={{ margin:0, fontSize:12, color:T.text, lineHeight:1.75, fontFamily:'ui-monospace,monospace', whiteSpace:'pre-wrap' as const }}>
            {pw.prompt}
          </p>
        </div>
      </div>

      {/* Sections breakdown */}
      <div style={{ borderRadius:10, border:`1px solid ${T.border}`, overflow:'hidden' }}>
        <div
          onClick={() => setOpenSections(p => !p)}
          style={{ padding:'10px 14px', background:'rgba(255,255,255,0.03)', display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
          <span style={{ fontSize:11, color:T.dim, flex:1 }}>🔬 Seções do prompt</span>
          <span style={{ fontSize:10, color:T.dim }}>{openSections ? '▾' : '▸'}</span>
        </div>
        {openSections && (
          <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column' as const, gap:6 }}>
            {pw.sections.map(sec => (
              <div key={sec.id} style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                <span style={{
                  flexShrink:0, padding:'1px 6px', borderRadius:4, fontSize:8, fontWeight:800,
                  background:`rgba(${sec.accent},0.15)`, color:`rgb(${sec.accent})`,
                  marginTop:1,
                }}>{sec.label.toUpperCase()}</span>
                <p style={{ margin:0, fontSize:11, color:T.text, lineHeight:1.6, fontFamily:'ui-monospace,monospace', flex:1 }}>{sec.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Negative prompt */}
      {pw.negativePrompt && (
        <div style={{ borderRadius:10, border:`1px solid rgba(248,113,113,0.2)`, overflow:'hidden' }}>
          <div style={{ padding:'10px 14px', background:'rgba(248,113,113,0.07)', display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:4, background:'rgba(248,113,113,0.2)', color:'#f87171' }}>NEGATIVE</span>
            <span style={{ flex:1, fontSize:11, color:T.dim }}>O que a IA não deve gerar</span>
            <button
              onClick={() => copy('neg', pw.negativePrompt)}
              style={{ padding:'3px 10px', borderRadius:5, border:`1px solid rgba(248,113,113,0.3)`, background:'transparent', color:'#f87171', cursor:'pointer', fontSize:10 }}>
              {copiedKey==='neg' ? '✓' : 'Copiar'}
            </button>
          </div>
          <p style={{ margin:0, padding:'10px 14px', fontSize:11, color:T.dim, lineHeight:1.6, fontFamily:'ui-monospace,monospace', background:'rgba(255,255,255,0.01)' }}>
            {pw.negativePrompt}
          </p>
        </div>
      )}

      {/* Parameters */}
      {pw.parameters && (
        <div style={{ borderRadius:10, border:`1px solid rgba(52,211,153,0.2)`, overflow:'hidden' }}>
          <div style={{ padding:'10px 14px', background:'rgba(52,211,153,0.07)', display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:4, background:'rgba(52,211,153,0.2)', color:'#34d399' }}>PARAMS</span>
            <span style={{ flex:1, fontSize:11, color:T.dim }}>Parâmetros do tradutor</span>
            <button
              onClick={() => copy('params', pw.parameters)}
              style={{ padding:'3px 10px', borderRadius:5, border:`1px solid rgba(52,211,153,0.3)`, background:'transparent', color:'#34d399', cursor:'pointer', fontSize:10 }}>
              {copiedKey==='params' ? '✓' : 'Copiar'}
            </button>
          </div>
          <p style={{ margin:0, padding:'10px 14px', fontSize:11, color:T.dim, lineHeight:1.6, fontFamily:'ui-monospace,monospace', background:'rgba(255,255,255,0.01)' }}>
            {pw.parameters}
          </p>
        </div>
      )}
    </div>
  )
}

function AIEPlaywrightTab() {
  const [translator, setTranslator] = useState<TranslatorId>('flux-1.1')
  const [detail, setDetail]         = useState<DetailLevel>('detalhado')

  const aie = useMemo(() => runAIE(MOCK_PROJECT_CONTEXT), [])

  const pw = useMemo(
    () => buildPrompt(MOCK_PROJECT_CONTEXT, aie, translator, detail),
    [aie, translator, detail],
  )

  const info = TRANSLATORS.find(t => t.id === translator)!

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const }}>
      {/* Controls */}
      <div style={{ padding:'12px 20px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', flexDirection:'column' as const, gap:12 }}>

        {/* AIE score strip */}
        <div style={{ display:'flex', gap:8 }}>
          {([
            ['Overall', aie.scores.overall],
            ['Render Ready', aie.scores.renderReadiness],
            ['Materiais', aie.scores.material],
            ['Iluminação', aie.scores.lighting],
            ['Fotografia', aie.scores.photography],
          ] as [string, number][]).map(([label, score]) => (
            <div key={label} style={{ flex:1, padding:'6px 8px', borderRadius:8, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, textAlign:'center' as const }}>
              <p style={{ margin:'0 0 3px', fontSize:8, color:T.dim, fontWeight:700 }}>{label.toUpperCase()}</p>
              <p style={{ margin:0, fontSize:15, fontWeight:900, color:scoreColor(score) }}>{score}</p>
            </div>
          ))}
        </div>

        <div style={{ display:'flex', gap:12 }}>
          {/* Translator selector */}
          <div style={{ flex:1 }}>
            <p style={{ margin:'0 0 6px', fontSize:9, color:T.dim, fontWeight:700, letterSpacing:'0.06em' }}>TRADUTOR</p>
            <div style={{ display:'flex', gap:6 }}>
              {TRANSLATORS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTranslator(t.id)}
                  title={t.desc}
                  style={{
                    flex:1, padding:'7px 6px', borderRadius:8, cursor:'pointer', border:'none',
                    background: translator===t.id ? `${t.color}22` : 'rgba(255,255,255,0.04)',
                    outline: translator===t.id ? `1.5px solid ${t.color}` : `1px solid ${T.border}`,
                    color: translator===t.id ? t.color : T.dim,
                    display:'flex', flexDirection:'column' as const, alignItems:'center', gap:3,
                    transition:'all 0.15s',
                  }}>
                  <span style={{ fontSize:16 }}>{t.icon}</span>
                  <span style={{ fontSize:8, fontWeight:800 }}>{t.badge}</span>
                  <span style={{ fontSize:8, color: translator===t.id ? t.color : T.dim }}>{t.label.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Detail level selector */}
          <div style={{ minWidth:160 }}>
            <p style={{ margin:'0 0 6px', fontSize:9, color:T.dim, fontWeight:700, letterSpacing:'0.06em' }}>NÍVEL DE DETALHE</p>
            <div style={{ display:'flex', flexDirection:'column' as const, gap:4 }}>
              {DETAIL_LEVELS.map(d => (
                <button
                  key={d.id}
                  onClick={() => setDetail(d.id)}
                  style={{
                    padding:'6px 10px', borderRadius:6, cursor:'pointer', textAlign:'left' as const,
                    border: detail===d.id ? `1px solid rgba(124,58,237,0.5)` : `1px solid ${T.border}`,
                    background: detail===d.id ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.03)',
                    color: detail===d.id ? '#a78bfa' : T.dim,
                    display:'flex', alignItems:'center', gap:8,
                  }}>
                  <span style={{ fontSize:10, fontWeight:700, minWidth:60 }}>{d.label}</span>
                  <span style={{ fontSize:9 }}>{d.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Active translator info */}
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', borderRadius:8, background:`${info.color}11`, border:`1px solid ${info.color}33` }}>
          <span style={{ fontSize:15 }}>{info.icon}</span>
          <div>
            <p style={{ margin:0, fontSize:11, fontWeight:700, color:info.color }}>{info.label}</p>
            <p style={{ margin:0, fontSize:10, color:T.dim }}>{info.desc}</p>
          </div>
          <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:`${info.color}22`, color:info.color, fontWeight:800 }}>{info.badge}</span>
            <span style={{ fontSize:9, color:T.dim }}>{pw.estimatedTokens} tokens</span>
          </div>
        </div>
      </div>

      {/* Prompt preview */}
      <div style={{ flex:1, overflowY:'auto' as const, padding:'14px 20px' }}>
        <PromptPreview pw={pw} />
      </div>
    </div>
  )
}

// ─── Main module ─────────────────────────────────────────────────────────────

type TabId = 'playwright' | 'playground'

export function PromptPlaygroundModule() {
  const [tab, setTab] = useState<TabId>('playwright')

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const, background:T.bg }}>
      {/* Header */}
      <div style={{ padding:'12px 20px 0', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
          <h2 style={{ margin:0, fontSize:16, fontWeight:800, color:'#fff' }}>⚡ Prompt</h2>
          <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, background:'rgba(167,139,250,0.15)', color:'#a78bfa', fontWeight:700 }}>AIE v1</span>
        </div>
        <div style={{ display:'flex', gap:0 }}>
          {([
            { id:'playwright' as TabId, label:'🧬 AIE Playwright', desc:'Gerado pelo motor de inteligência' },
            { id:'playground'  as TabId, label:'📝 Playground',     desc:'Editor manual por seções' },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              title={t.desc}
              style={{
                padding:'7px 16px', borderRadius:'6px 6px 0 0', border:'none', cursor:'pointer',
                background: tab===t.id ? T.bg : 'transparent',
                color: tab===t.id ? '#fff' : T.dim,
                fontSize:11, fontWeight: tab===t.id ? 700 : 400,
                borderTop: tab===t.id ? `2px solid ${T.purple}` : '2px solid transparent',
                transition:'all 0.15s',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex:1, overflow:'hidden' }}>
        {tab === 'playwright' ? <AIEPlaywrightTab /> : <PlaygroundTab />}
      </div>
    </div>
  )
}
