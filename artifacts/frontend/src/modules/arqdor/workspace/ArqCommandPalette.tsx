// ─── ArqCommandPalette — Sprint 5 ────────────────────────────────────────────
// Ctrl+K command palette. Fuzzy search over modules, projects, quick actions.

import { useState, useEffect, useRef } from 'react'
import { T } from '../shared/arqdor-theme'
import type { ModuleId } from './ArqWorkspace'

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  @keyframes cp-fadeIn {
    from { opacity:0; transform:scale(0.97) translateY(-8px); }
    to   { opacity:1; transform:scale(1) translateY(0); }
  }
  .cp-result {
    transition: background 0.1s ease !important;
    cursor: pointer;
  }
  .cp-result:hover { background: rgba(124,58,237,0.12) !important; }
  .cp-result.cp-selected { background: rgba(124,58,237,0.2) !important; }
`

// ─── Command definitions ──────────────────────────────────────────────────────
interface Command {
  id:       string
  icon:     string
  label:    string
  desc?:    string
  module?:  ModuleId
  shortcut?: string
  category: 'action' | 'module' | 'project'
}

const STATIC_COMMANDS: Command[] = [
  // Quick actions
  { id:'go-home',    icon:'🏠', label:'Ir para Home',          desc:'Dashboard do projeto',          module:'home',         shortcut:'G H', category:'action' },
  { id:'go-renders', icon:'🎬', label:'Ir para Renders',       desc:'Histórico e galeria de renders', module:'renders',      shortcut:'G R', category:'action' },
  { id:'go-spec',    icon:'✨', label:'Smart Especificação',    desc:'Especificar render com IA',      module:'especificacao', shortcut:'G S', category:'action' },
  { id:'go-lib',     icon:'📚', label:'Biblioteca',             desc:'Materiais e objetos',            module:'biblioteca',   shortcut:'G B', category:'action' },
  { id:'go-prompt',  icon:'⚡', label:'Prompt Playground',     desc:'Testar e criar prompts de IA',   module:'prompt',       shortcut:'G P', category:'action' },
  { id:'go-portal',  icon:'👤', label:'Portal do Cliente',      desc:'Enviar e compartilhar projeto',  module:'cliente',      shortcut:'G D', category:'action' },
  { id:'go-projeto', icon:'🏗️', label:'Modelagem do Projeto',  desc:'Ambientes, objetos, materiais',  module:'projeto',      shortcut:'G C', category:'action' },
  // Modules
  { id:'mod-aireview',icon:'🔍', label:'AI Review',            desc:'Análise comparativa de renders', module:'ai-review',    category:'module' },
  { id:'mod-corr',   icon:'🔄', label:'Correções IA',          desc:'Prompts de ajuste',              module:'correcoes',    category:'module' },
  { id:'mod-mem',    icon:'🧠', label:'Memória IA',             desc:'Preferências aprendidas',        module:'memoria',      category:'module' },
  { id:'mod-hub',    icon:'🏛️', label:'ARQ HUB',               desc:'Ecosystem inteligente',          module:'arqhub',       category:'module' },
  { id:'mod-intel',  icon:'🧠', label:'AI Intelligence',        desc:'Motor de análise AIE',           module:'ai-intel',     category:'module' },
  { id:'mod-cfg',    icon:'⚙️', label:'Configurações',          desc:'Providers e plugins',            module:'config',       category:'module' },
]

interface Project { id: string; titulo: string; status?: string | null; tipoObra?: string | null }

interface Props {
  open:            boolean
  onClose:         () => void
  onNavigate:      (m: ModuleId) => void
  onSelectProject?: (id: string) => void
  projects:        Project[]
}

function fuzzy(text: string, query: string): boolean {
  if (!query) return true
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++
  }
  return qi === q.length
}

export function ArqCommandPalette({ open, onClose, onNavigate, onSelectProject, projects }: Props) {
  const [query,       setQuery]       = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Build command list (static + dynamic projects)
  const projectCmds: Command[] = projects.map(p => ({
    id:       `proj-${p.id}`,
    icon:     '📁',
    label:    p.titulo,
    desc:     p.tipoObra ?? p.status ?? 'Projeto',
    category: 'project' as const,
  }))

  const allCmds = [...STATIC_COMMANDS, ...projectCmds]

  // Filter
  const results = allCmds.filter(c =>
    fuzzy(`${c.label} ${c.desc ?? ''}`, query)
  )

  // Keyboard nav inside palette
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     { onClose(); return }
      if (e.key === 'ArrowDown')  { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)) }
      if (e.key === 'ArrowUp')    { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter') {
        const cmd = results[selectedIdx]
        if (!cmd) return
        if (cmd.module) { onNavigate(cmd.module); onClose() }
        else if (cmd.category === 'project') {
          const pid = cmd.id.replace('proj-', '')
          onSelectProject?.(pid)
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, results, selectedIdx, onClose, onNavigate, onSelectProject])

  // Reset index on query change
  useEffect(() => setSelectedIdx(0), [query])

  if (!open) return null

  const execute = (cmd: Command) => {
    if (cmd.module) { onNavigate(cmd.module); onClose() }
    else if (cmd.category === 'project') {
      onSelectProject?.(cmd.id.replace('proj-', ''))
      onClose()
    }
  }

  // Group results
  const actions  = results.filter(c => c.category === 'action')
  const modules  = results.filter(c => c.category === 'module')
  const projs    = results.filter(c => c.category === 'project')

  function Group({ title, cmds, startOffset }: { title: string; cmds: Command[]; startOffset: number }) {
    if (!cmds.length) return null
    return (
      <>
        <div style={{ padding:'6px 16px 3px', fontSize:9, fontWeight:800, color:T.dim, letterSpacing:'0.1em' }}>
          {title}
        </div>
        {cmds.map((cmd, i) => {
          const absIdx = startOffset + i
          const sel    = absIdx === selectedIdx
          return (
            <div
              key={cmd.id}
              className={`cp-result${sel ? ' cp-selected' : ''}`}
              onClick={() => execute(cmd)}
              onMouseEnter={() => setSelectedIdx(absIdx)}
              style={{
                display:'flex', alignItems:'center', gap:10, padding:'9px 16px',
                background: sel ? 'rgba(124,58,237,0.2)' : 'transparent',
              }}
            >
              <span style={{ fontSize:16, flexShrink:0 }}>{cmd.icon}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, fontSize:12, fontWeight:700, color:sel?'#fff':T.text, lineHeight:1 }}>{cmd.label}</p>
                {cmd.desc && (
                  <p style={{ margin:'2px 0 0', fontSize:10, color:T.dim, lineHeight:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {cmd.desc}
                  </p>
                )}
              </div>
              {cmd.shortcut && (
                <div style={{ display:'flex', gap:3, flexShrink:0 }}>
                  {cmd.shortcut.split(' ').map((k, ki) => (
                    <kbd key={ki} style={{
                      padding:'2px 6px', borderRadius:4, fontSize:9, fontWeight:700,
                      background:'rgba(255,255,255,0.08)', color:T.dim, border:`1px solid ${T.border}`,
                    }}>{k}</kbd>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </>
    )
  }

  return (
    <>
      <style>{CSS}</style>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:'fixed', inset:0, zIndex:9000,
          background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)',
        }}
      />

      {/* Palette */}
      <div style={{
        position:'fixed', top:'15vh', left:'50%', transform:'translateX(-50%)',
        width:560, maxWidth:'94vw', zIndex:9001,
        background:'#13112a', borderRadius:14,
        border:`1px solid rgba(124,58,237,0.35)`,
        boxShadow:'0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,58,237,0.12)',
        overflow:'hidden', animation:'cp-fadeIn 0.18s ease',
      }}>
        {/* Search input */}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 16px', borderBottom:`1px solid ${T.border}` }}>
          <span style={{ fontSize:16, color:T.dim }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Pesquisar módulos, projetos, ações…"
            style={{
              flex:1, background:'transparent', border:'none', outline:'none',
              fontSize:14, color:'#fff', fontWeight:500,
            }}
          />
          <kbd style={{ padding:'3px 7px', borderRadius:5, fontSize:10, background:'rgba(255,255,255,0.07)', color:T.dim, border:`1px solid ${T.border}` }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight:360, overflowY:'auto', paddingBottom:8 }}>
          {results.length === 0 && (
            <p style={{ margin:0, padding:'20px', textAlign:'center', fontSize:12, color:T.dim }}>
              Nenhum resultado para "{query}"
            </p>
          )}
          <Group title="⚡ AÇÕES RÁPIDAS"  cmds={actions} startOffset={0} />
          <Group title="🔧 MÓDULOS"         cmds={modules}  startOffset={actions.length} />
          <Group title="📁 PROJETOS"        cmds={projs}    startOffset={actions.length + modules.length} />
        </div>

        {/* Footer */}
        <div style={{ padding:'8px 16px', borderTop:`1px solid ${T.border}`, display:'flex', gap:16, alignItems:'center' }}>
          {[['↑↓','Navegar'],['↵','Executar'],['Esc','Fechar']].map(([k,l]) => (
            <div key={k} style={{ display:'flex', gap:5, alignItems:'center' }}>
              <kbd style={{ padding:'2px 6px', borderRadius:4, fontSize:9, background:'rgba(255,255,255,0.08)', color:T.dim, border:`1px solid ${T.border}` }}>{k}</kbd>
              <span style={{ fontSize:9, color:T.dim }}>{l}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
