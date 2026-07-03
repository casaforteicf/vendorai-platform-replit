import { useState, useEffect } from 'react'
import { MOCK_PROJECT } from '../../../../pages/arch/arqdor/domain/arqdor-mock-project'
import { generateFullPromptStructure } from '../../../../pages/arch/arqdor/domain/arqdor-prompt-engine'
import type { PromptStructure } from '../../../../pages/arch/arqdor/domain/arqdor-domain-types'

const T = {
  bg:'#0d0b1e', surface:'#13102b', card:'rgba(255,255,255,0.04)',
  border:'rgba(255,255,255,0.08)', purple:'#7c3aed', purpleL:'#a78bfa',
  text:'rgba(255,255,255,0.88)', dim:'rgba(255,255,255,0.44)',
} as const

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

export function PromptPlaygroundModule() {
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
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const, background:T.bg }}>
      {/* Header */}
      <div style={{ padding:'14px 20px 12px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ flex:1 }}>
          <h2 style={{ margin:'0 0 2px', fontSize:16, fontWeight:800, color:'#fff' }}>⚡ Prompt Playground</h2>
          <p style={{ margin:0, fontSize:11, color:T.dim }}>Gerado em tempo real a partir do modelo do projeto — {tokenCount} tokens estimados</p>
        </div>
        <button onClick={()=>setStructure(generateFullPromptStructure(MOCK_PROJECT))}
          style={{ padding:'5px 12px', borderRadius:6, border:`1px solid ${T.border}`, background:'rgba(255,255,255,0.05)', color:T.dim, cursor:'pointer', fontSize:11 }}>
          🔄 Regenerar
        </button>
        <button onClick={()=>copy('all',structure.finalPrompt)}
          style={{ padding:'5px 12px', borderRadius:6, border:'none', background:T.purple, color:'#fff', cursor:'pointer', fontSize:11, fontWeight:700 }}>
          {copied==='all'?'✓ Copiado':'📋 Copiar Tudo'}
        </button>
      </div>

      {/* Sections */}
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
