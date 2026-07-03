import { useState, useMemo, useCallback } from 'react'
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
import { useWorkspaceContext } from '../WorkspaceContext'

const T = {
  bg:'#0d0b1e', surface:'#13102b', card:'rgba(255,255,255,0.04)',
  border:'rgba(255,255,255,0.08)', purple:'#7c3aed', purpleL:'#a78bfa',
  text:'rgba(255,255,255,0.88)', dim:'rgba(255,255,255,0.44)',
} as const

// ─── Saved variations ────────────────────────────────────────────────────────

const STORAGE_KEY = 'arqdor_saved_prompt_variations'

interface SavedVariation {
  id: string
  name: string
  translator: TranslatorId
  detail: DetailLevel
  prompt: string
  negativePrompt: string
  estimatedTokens: number
  savedAt: number
  notes?: string
}

function persistVariations(list: SavedVariation[]): { pruned: number } | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    return null
  } catch {
    return { pruned: 0 }
  }
}

function useSavedVariations() {
  const [variations, setVariations] = useState<SavedVariation[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as SavedVariation[]) : []
    } catch {
      return []
    }
  })

  const [storageError, setStorageError] = useState<string | null>(null)
  const clearStorageError = useCallback(() => setStorageError(null), [])

  const importVariations = useCallback((incoming: SavedVariation[]) => {
    setVariations(prev => {
      const existingIds = new Set(prev.map(v => v.id))
      const novel = incoming.filter(v => !existingIds.has(v.id))
      if (novel.length === 0) return prev
      const next = [...novel, ...prev]
      persistVariations(next)
      return next
    })
  }, [])

  const save = useCallback((v: Omit<SavedVariation, 'id' | 'savedAt' | 'name'>, suggestedName: string) => {
    const item: SavedVariation = {
      ...v,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: suggestedName,
      savedAt: Date.now(),
    }
    setVariations(prev => {
      const next = [item, ...prev]
      const err = persistVariations(next)
      if (err !== null) {
        // Prune oldest variations one at a time until it fits or list is empty
        const pruned = [...next]
        let prunedCount = 0
        while (pruned.length > 1) {
          pruned.pop()
          prunedCount++
          const retryErr = persistVariations(pruned)
          if (retryErr === null) {
            setStorageError(
              `Armazenamento local cheio. ${prunedCount} variação${prunedCount > 1 ? 'ões antigas foram removidas' : ' antiga foi removida'} para liberar espaço. Exporte suas variações regularmente para não perder trabalho.`
            )
            return pruned
          }
        }
        // Even a single item doesn't fit — warn and don't persist
        setStorageError(
          'Armazenamento local cheio e não foi possível liberar espaço. A variação não foi salva. Exporte as variações existentes e remova algumas antes de salvar novamente.'
        )
        return prev
      }
      return next
    })
  }, [])

  const rename = useCallback((id: string, name: string) => {
    setVariations(prev => {
      const next = prev.map((v): SavedVariation => v.id === id ? { ...v, name } : v)
      const err = persistVariations(next)
      if (err !== null) {
        setStorageError('Não foi possível salvar o novo nome no armazenamento local (espaço esgotado).')
      }
      return next
    })
  }, [])

  const remove = useCallback((id: string) => {
    setVariations(prev => {
      const next = prev.filter(v => v.id !== id)
      persistVariations(next)
      return next
    })
  }, [])

  const updateNotes = useCallback((id: string, notes: string) => {
    setVariations(prev => {
      const next = prev.map((v): SavedVariation => v.id === id ? { ...v, notes } : v)
      const err = persistVariations(next)
      if (err !== null) {
        setStorageError('Não foi possível salvar as notas no armazenamento local (espaço esgotado).')
      }
      return next
    })
  }, [])

  return { variations, save, rename, remove, updateNotes, storageError, clearStorageError, importVariations }
}

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

// ─── Saved variations panel ───────────────────────────────────────────────────

function VariationCard({
  v,
  editingId,
  editingName,
  copiedId,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onEditingNameChange,
  onCopy,
  onDelete,
  onUpdateNotes,
}: {
  v: SavedVariation
  editingId: string | null
  editingName: string
  copiedId: string | null
  onStartEdit: (v: SavedVariation) => void
  onCommitEdit: (id: string) => void
  onCancelEdit: () => void
  onEditingNameChange: (name: string) => void
  onCopy: (id: string, text: string) => void
  onDelete: (id: string) => void
  onUpdateNotes: (id: string, notes: string) => void
}) {
  const [notesOpen, setNotesOpen] = useState(false)
  const [draftNotes, setDraftNotes] = useState(v.notes ?? '')

  const tInfo = TRANSLATORS.find(t => t.id === v.translator)

  const fmt = (ts: number) => {
    const d = new Date(ts)
    return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}`
  }

  const handleNotesBlur = () => {
    onUpdateNotes(v.id, draftNotes)
  }

  const hasNotes = (v.notes ?? '').trim().length > 0

  return (
    <div style={{ borderRadius:8, border:`1px solid ${T.border}`, overflow:'hidden' }}>
      {/* Row header */}
      <div style={{ padding:'8px 12px', background:'rgba(255,255,255,0.03)', display:'flex', alignItems:'center', gap:8 }}>
        {/* Name (editable) */}
        {editingId === v.id ? (
          <input
            value={editingName}
            onChange={e => onEditingNameChange(e.target.value)}
            onBlur={() => onCommitEdit(v.id)}
            onKeyDown={e => { if (e.key === 'Enter') onCommitEdit(v.id); if (e.key === 'Escape') onCancelEdit() }}
            autoFocus
            style={{
              flex:1, background:'rgba(255,255,255,0.06)', border:`1px solid rgba(124,58,237,0.4)`,
              borderRadius:5, color:T.text, fontSize:11, fontWeight:700, padding:'3px 8px', outline:'none',
            }}
          />
        ) : (
          <span
            onDoubleClick={() => onStartEdit(v)}
            title="Duplo clique para renomear"
            style={{ flex:1, fontSize:11, fontWeight:700, color:T.text, cursor:'text' }}>
            {v.name}
          </span>
        )}
        {/* Badges */}
        {tInfo && (
          <span style={{ fontSize:8, padding:'1px 6px', borderRadius:4, background:`${tInfo.color}22`, color:tInfo.color, fontWeight:800 }}>
            {tInfo.badge}
          </span>
        )}
        <span style={{ fontSize:8, padding:'1px 6px', borderRadius:4, background:'rgba(124,58,237,0.15)', color:T.purpleL, fontWeight:700 }}>
          {v.detail}
        </span>
        <span style={{ fontSize:9, color:T.dim }}>{v.estimatedTokens} tk</span>
        {/* Actions */}
        <button
          onClick={() => onCopy(v.id, v.prompt)}
          title="Copiar prompt"
          style={{ padding:'2px 8px', borderRadius:5, border:'none', background:'rgba(124,58,237,0.2)', color:T.purpleL, cursor:'pointer', fontSize:9, fontWeight:700 }}>
          {copiedId === v.id ? '✓' : '📋'}
        </button>
        <button
          onClick={() => onStartEdit(v)}
          title="Renomear"
          style={{ padding:'2px 6px', borderRadius:5, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, cursor:'pointer', fontSize:10 }}>
          ✏️
        </button>
        <button
          onClick={() => onDelete(v.id)}
          title="Remover"
          style={{ padding:'2px 6px', borderRadius:5, border:`1px solid rgba(248,113,113,0.2)`, background:'transparent', color:'#f87171', cursor:'pointer', fontSize:10 }}>
          🗑
        </button>
      </div>
      {/* Prompt preview snippet */}
      <div style={{ padding:'8px 12px', background:'rgba(255,255,255,0.01)' }}>
        <p style={{
          margin:0, fontSize:10, color:T.dim, lineHeight:1.55,
          fontFamily:'ui-monospace,monospace', whiteSpace:'pre-wrap' as const,
          display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' as const, overflow:'hidden',
        }}>
          {v.prompt}
        </p>
        {/* Notes preview line (when notes exist and collapsed) */}
        {hasNotes && !notesOpen && (
          <p style={{
            margin:'5px 0 0', fontSize:9, color:'rgba(167,139,250,0.6)',
            lineHeight:1.4, fontStyle:'italic',
            whiteSpace:'nowrap' as const, overflow:'hidden', textOverflow:'ellipsis',
          }}>
            📝 {v.notes}
          </p>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:5 }}>
          <p style={{ margin:0, fontSize:9, color:'rgba(255,255,255,0.24)', flex:1 }}>{fmt(v.savedAt)}</p>
          <button
            onClick={() => { setNotesOpen(p => !p); if (!notesOpen) setDraftNotes(v.notes ?? '') }}
            style={{
              padding:'1px 7px', borderRadius:4, border:`1px solid ${notesOpen ? 'rgba(167,139,250,0.35)' : T.border}`,
              background: notesOpen ? 'rgba(167,139,250,0.08)' : 'transparent',
              color: notesOpen ? T.purpleL : T.dim,
              cursor:'pointer', fontSize:9, display:'flex', alignItems:'center', gap:4,
            }}>
            📝 {notesOpen ? 'Fechar notas' : hasNotes ? 'Ver notas' : 'Adicionar nota'}
          </button>
        </div>
        {/* Notes expandable area */}
        {notesOpen && (
          <div style={{ marginTop:8 }}>
            <textarea
              value={draftNotes}
              onChange={e => setDraftNotes(e.target.value)}
              onBlur={handleNotesBlur}
              placeholder="Ex: bom para iluminação interior, evitar uso em exteriores..."
              style={{
                width:'100%', minHeight:72, background:'rgba(167,139,250,0.06)',
                border:`1px solid rgba(167,139,250,0.25)`, borderRadius:6,
                color:T.text, fontSize:10, padding:'8px 10px',
                lineHeight:1.6, resize:'vertical' as const, outline:'none',
                boxSizing:'border-box' as const, fontFamily:'inherit',
              }}
            />
            <p style={{ margin:'3px 0 0', fontSize:9, color:T.dim }}>As notas são salvas automaticamente ao sair do campo</p>
          </div>
        )}
      </div>
    </div>
  )
}

function SavedVariationsPanel({
  variations,
  onRename,
  onDelete,
  onUpdateNotes,
  onImport,
}: {
  variations: SavedVariation[]
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onUpdateNotes: (id: string, notes: string) => void
  onImport: (items: SavedVariation[]) => void
}) {
  const [open, setOpen] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [exported, setExported] = useState(false)
  const [importStatus, setImportStatus] = useState<'idle' | 'ok' | 'error'>('idle')

  const handleExport = (e: React.MouseEvent) => {
    e.stopPropagation()
    const blob = new Blob([JSON.stringify(variations, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `prompt-variations-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setExported(true)
    setTimeout(() => setExported(false), 2000)
  }

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as unknown
        if (!Array.isArray(parsed)) throw new Error('not an array')
        const items = parsed as SavedVariation[]
        const valid = items.filter(
          (v) => typeof v.id === 'string' && typeof v.name === 'string' &&
                 typeof v.prompt === 'string' && typeof v.savedAt === 'number'
        )
        if (valid.length === 0) throw new Error('no valid items')
        onImport(valid)
        setImportStatus('ok')
      } catch {
        setImportStatus('error')
      } finally {
        setTimeout(() => setImportStatus('idle'), 2500)
        e.target.value = ''
      }
    }
    reader.readAsText(file)
  }

  const copy = (id: string, text: string) => {
    void navigator.clipboard.writeText(text)
    setCopiedId(id); setTimeout(() => setCopiedId(null), 1800)
  }

  const startEdit = (v: SavedVariation) => { setEditingId(v.id); setEditingName(v.name) }
  const commitEdit = (id: string) => {
    if (editingName.trim()) onRename(id, editingName.trim())
    setEditingId(null)
  }

  return (
    <div style={{ borderRadius:10, border:`1px solid ${T.border}`, overflow:'hidden', marginTop:12 }}>
      <div
        onClick={() => setOpen(p => !p)}
        style={{ padding:'10px 14px', background:'rgba(255,255,255,0.03)', display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
        <span style={{ fontSize:11, fontWeight:700, color:T.purpleL, flex:1 }}>
          💾 Variações salvas
          {variations.length > 0 && (
            <span style={{ marginLeft:6, fontSize:9, padding:'1px 6px', borderRadius:10, background:'rgba(167,139,250,0.15)', color:T.purpleL, fontWeight:800 }}>
              {variations.length}
            </span>
          )}
        </span>
        {/* Import button — always visible so users can import even with empty list */}
        <label
          onClick={e => e.stopPropagation()}
          title="Importar variações de um arquivo JSON"
          style={{
            padding:'3px 10px', borderRadius:5, border:`1px solid ${T.border}`,
            background: importStatus === 'ok' ? 'rgba(74,222,128,0.15)' : importStatus === 'error' ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.05)',
            color: importStatus === 'ok' ? '#4ade80' : importStatus === 'error' ? '#f87171' : T.dim,
            cursor:'pointer', fontSize:9, fontWeight:700,
            outline: importStatus === 'ok' ? '1px solid #4ade8044' : importStatus === 'error' ? '1px solid #f8717144' : 'none',
            transition:'all 0.2s', display:'inline-block',
          }}>
          {importStatus === 'ok' ? '✓ Importado' : importStatus === 'error' ? '✗ Inválido' : '⬆ Importar'}
          <input
            type="file"
            accept=".json,application/json"
            onChange={handleImportFile}
            style={{ display:'none' }}
          />
        </label>
        {variations.length > 0 && (
          <button
            onClick={handleExport}
            title="Exportar variações como JSON"
            style={{
              padding:'3px 10px', borderRadius:5, border:`1px solid ${T.border}`,
              background: exported ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.05)',
              color: exported ? '#4ade80' : T.dim,
              cursor:'pointer', fontSize:9, fontWeight:700,
              outline: exported ? '1px solid #4ade8044' : 'none',
              transition:'all 0.2s',
            }}>
            {exported ? '✓ Exportado' : '⬇ Exportar'}
          </button>
        )}
        <span style={{ fontSize:10, color:T.dim }}>{open ? '▾' : '▸'}</span>
      </div>

      {open && (
        <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column' as const, gap:8 }}>
          {variations.length === 0 && (
            <p style={{ margin:0, fontSize:11, color:T.dim, fontStyle:'italic', textAlign:'center' as const, padding:'12px 0' }}>
              Nenhuma variação salva ainda. Clique em "💾 Salvar variação" acima para começar.
            </p>
          )}
          {variations.map(v => (
            <VariationCard
              key={v.id}
              v={v}
              editingId={editingId}
              editingName={editingName}
              copiedId={copiedId}
              onStartEdit={startEdit}
              onCommitEdit={commitEdit}
              onCancelEdit={() => setEditingId(null)}
              onEditingNameChange={setEditingName}
              onCopy={copy}
              onDelete={onDelete}
              onUpdateNotes={onUpdateNotes}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── AIE Playwright tab ───────────────────────────────────────────────────────

function AIEPlaywrightTab() {
  const [translator, setTranslator] = useState<TranslatorId>('flux-1.1')
  const [detail, setDetail]         = useState<DetailLevel>('detalhado')
  const [savedFlash, setSavedFlash] = useState(false)

  const { variations, save, rename, remove, updateNotes, storageError, clearStorageError, importVariations } = useSavedVariations()

  const { projectContext } = useWorkspaceContext()
  const activeCtx = projectContext ?? MOCK_PROJECT_CONTEXT

  const aie = useMemo(() => runAIE(activeCtx), [activeCtx])

  const pw = useMemo(
    () => buildPrompt(activeCtx, aie, translator, detail),
    [activeCtx, aie, translator, detail],
  )

  const info = TRANSLATORS.find(t => t.id === translator)!

  const handleSave = () => {
    const tLabel = info.badge
    const dLabel = DETAIL_LEVELS.find(d => d.id === detail)?.label ?? detail
    const count = variations.filter(v => v.translator === translator && v.detail === detail).length
    const suggested = `${tLabel} · ${dLabel}${count > 0 ? ` #${count + 1}` : ''}`
    save({
      translator,
      detail,
      prompt: pw.prompt,
      negativePrompt: pw.negativePrompt ?? '',
      estimatedTokens: pw.estimatedTokens,
    }, suggested)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1800)
  }

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

        {/* Active translator info + save button */}
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', borderRadius:8, background:`${info.color}11`, border:`1px solid ${info.color}33` }}>
          <span style={{ fontSize:15 }}>{info.icon}</span>
          <div>
            <p style={{ margin:0, fontSize:11, fontWeight:700, color:info.color }}>{info.label}</p>
            <p style={{ margin:0, fontSize:10, color:T.dim }}>{info.desc}</p>
          </div>
          <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:`${info.color}22`, color:info.color, fontWeight:800 }}>{info.badge}</span>
            <span style={{ fontSize:9, color:T.dim }}>{pw.estimatedTokens} tokens</span>
            <button
              onClick={handleSave}
              style={{
                padding:'5px 12px', borderRadius:6, border:'none', cursor:'pointer', fontSize:10, fontWeight:700,
                background: savedFlash ? 'rgba(74,222,128,0.2)' : 'rgba(124,58,237,0.25)',
                color: savedFlash ? '#4ade80' : T.purpleL,
                outline: savedFlash ? '1px solid #4ade80' : `1px solid rgba(124,58,237,0.4)`,
                transition:'all 0.2s',
              }}>
              {savedFlash ? '✓ Salvo!' : '💾 Salvar variação'}
            </button>
          </div>
        </div>
      </div>

      {/* Storage quota warning banner */}
      {storageError && (
        <div style={{
          margin:'8px 20px 0', padding:'10px 14px', borderRadius:8,
          background:'rgba(251,191,36,0.1)', border:'1px solid rgba(251,191,36,0.35)',
          display:'flex', alignItems:'flex-start', gap:10, flexShrink:0,
        }}>
          <span style={{ fontSize:15, flexShrink:0, marginTop:1 }}>⚠️</span>
          <p style={{ margin:0, fontSize:11, color:'#fbbf24', lineHeight:1.6, flex:1 }}>
            {storageError}
          </p>
          <button
            onClick={clearStorageError}
            title="Fechar aviso"
            style={{
              flexShrink:0, padding:'2px 8px', borderRadius:5, border:'1px solid rgba(251,191,36,0.35)',
              background:'transparent', color:'#fbbf24', cursor:'pointer', fontSize:11, fontWeight:700,
            }}>
            ✕
          </button>
        </div>
      )}

      {/* Prompt preview + saved variations */}
      <div style={{ flex:1, overflowY:'auto' as const, padding:'14px 20px' }}>
        <PromptPreview pw={pw} />
        <SavedVariationsPanel variations={variations} onRename={rename} onDelete={remove} onUpdateNotes={updateNotes} onImport={importVariations} />
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
