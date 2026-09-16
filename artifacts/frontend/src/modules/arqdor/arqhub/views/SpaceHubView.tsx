import { useState, useEffect, useCallback } from 'react'
import { T } from '../../shared/arqdor-theme'
import { useWorkspace } from '../../workspace/context/WorkspaceContext'

const BASE = '/api'
function authHeaders(): Record<string, string> {
  const tok = localStorage.getItem('vendorai_token')
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

interface CatItem {
  id:             string
  nome:           string
  descricao:      string | null
  categoria:      string | null
  subcategoria:   string | null
  fornecedor:     string | null
  imagens:        string[] | null
  especificacoes: Record<string, unknown> | null
  createdAt:      string
}

function SpaceCard({ item, selected, onSelect }: { item: CatItem; selected: boolean; onSelect: ()=>void }) {
  const img = item.imagens?.[0]
  return (
    <div onClick={onSelect} style={{ cursor:'pointer', borderRadius:10, border:`1px solid ${selected?'rgba(124,58,237,0.5)':T.border}`, background:selected?'rgba(124,58,237,0.07)':T.surface, overflow:'hidden', transition:'border 0.15s' }}>
      <div style={{ height:72, background:'rgba(255,255,255,0.03)', display:'flex', alignItems:'center', justifyContent:'center', borderBottom:`1px solid ${T.border}`, overflow:'hidden' }}>
        {img
          ? <img src={img} alt={item.nome} style={{ width:'100%', height:'100%', objectFit:'cover' as const }}/>
          : <span style={{ fontSize:30 }}>🏠</span>
        }
      </div>
      <div style={{ padding:'10px 12px 12px' }}>
        <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'#fff', lineHeight:1.3 }}>{item.nome}</p>
        <p style={{ margin:'0 0 6px', fontSize:9, color:T.dim }}>{item.categoria ?? '—'} · {item.subcategoria ?? '—'}</p>
        {item.fornecedor && (
          <span style={{ fontSize:8, padding:'2px 6px', borderRadius:5, background:'rgba(124,58,237,0.1)', color:T.purpleL }}>
            {item.fornecedor}
          </span>
        )}
      </div>
    </div>
  )
}

function SpaceDetail({ item, projectId, canApply }: { item: CatItem; projectId: string | null; canApply: boolean }) {
  const [copied, setCopied] = useState(false)
  const [handoff, setHandoff] = useState(false)
  const prompt = item.descricao ?? item.nome
  const copy = () => { void navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(()=>setCopied(false), 2000) }

  const useInProject = () => {
    if (!projectId || !canApply) return
    sessionStorage.setItem('arqdor:pendingCatalogItem', JSON.stringify({
      id: item.id,
      name: item.nome,
      category: item.categoria,
      source: 'space-hub',
      projectId,
    }))
    setHandoff(true)
    window.dispatchEvent(new CustomEvent('arqdor:navigate', { detail: { module: 'real-specification' } }))
  }

  return (
    <div style={{ height:'100%', overflowY:'auto' as const, padding:16 }}>
      {item.imagens?.[0] ? (
        <img src={item.imagens[0]} alt={item.nome} style={{ width:'100%', height:80, objectFit:'cover' as const, borderRadius:8, marginBottom:14, border:`1px solid ${T.border}` }}/>
      ) : (
        <div style={{ height:80, borderRadius:8, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:42, marginBottom:14 }}>
          🏠
        </div>
      )}

      <p style={{ margin:'0 0 2px', fontSize:14, fontWeight:800, color:'#fff' }}>{item.nome}</p>
      <p style={{ margin:'0 0 12px', fontSize:10, color:T.dim }}>
        {item.categoria ?? '—'} · {item.subcategoria ?? '—'}
        {item.fornecedor ? ` · ${item.fornecedor}` : ''}
      </p>

      {item.descricao && (
        <p style={{ margin:'0 0 14px', fontSize:11, color:T.text, lineHeight:1.65 }}>{item.descricao}</p>
      )}

      {item.especificacoes && Object.keys(item.especificacoes).length > 0 && (
        <div style={{ marginBottom:12 }}>
          {[['OBJETOS','objetos'],['MATERIAIS','materiais'],['DESIGN INTENT','designIntent'],['ESTILO','estilo']].map(([label, key]) => {
            const val = item.especificacoes?.[key]
            if (!val) return null
            const arr = Array.isArray(val) ? val : [val]
            return (
              <div key={key} style={{ marginBottom:10 }}>
                <p style={{ margin:'0 0 5px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>{label}</p>
                <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
                  {arr.map((v, i) => (
                    <span key={i} style={{ fontSize:10, padding:'3px 8px', borderRadius:6, background:'rgba(255,255,255,0.05)', color:T.text }}>{String(v)}</span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ padding:'10px 12px', borderRadius:7, background:'rgba(124,58,237,0.06)', border:'1px solid rgba(124,58,237,0.2)', marginBottom:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
          <p style={{ margin:0, fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>DESCRIÇÃO / PROMPT</p>
          <button onClick={copy} style={{ padding:'2px 8px', borderRadius:5, border:`1px solid ${T.border}`, background:'transparent', color:copied?'#4ade80':T.dim, cursor:'pointer', fontSize:9 }}>
            {copied?'✓ Copiado':'📋'}
          </button>
        </div>
        <p style={{ margin:0, fontSize:10, color:T.text, lineHeight:1.6, fontFamily:'monospace' }}>{prompt}</p>
      </div>

      {!projectId && (
        <div style={{ marginBottom:10, padding:'8px 10px', borderRadius:7, background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.22)', color:'#fbbf24', fontSize:10, lineHeight:1.45 }}>
          Abra ou selecione um projeto antes de usar esta referência.
        </div>
      )}
      {projectId && !canApply && (
        <div style={{ marginBottom:10, padding:'8px 10px', borderRadius:7, background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.22)', color:'#f87171', fontSize:10, lineHeight:1.45 }}>
          Seu perfil não possui permissão para editar este projeto.
        </div>
      )}

      <button
        onClick={useInProject}
        disabled={!projectId || !canApply}
        style={{ width:'100%', padding:'10px', borderRadius:8, border:'none', background:(!projectId || !canApply)?'rgba(255,255,255,0.08)':T.purple, color:(!projectId || !canApply)?T.dim:'#fff', cursor:(!projectId || !canApply)?'not-allowed':'pointer', fontSize:12, fontWeight:700 }}>
        {handoff ? '✓ Abrindo projeto…' : '🏠 Usar neste Projeto'}
      </button>
      {projectId && canApply && (
        <p style={{ margin:'7px 0 0', fontSize:9, color:T.dim, lineHeight:1.45, textAlign:'center' as const }}>
          A referência será aberta nas especificações do projeto para você confirmar onde aplicar. O sistema não substitui o ambiente inteiro automaticamente.
        </p>
      )}
    </div>
  )
}

export function SpaceHubView() {
  const { activeProject, hasPermission } = useWorkspace()
  const [items,   setItems]   = useState<CatItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string|null>(null)
  const [catFilt, setCatFilt] = useState('')
  const [query,   setQuery]   = useState('')
  const [sel,     setSel]     = useState<CatItem|null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ limit: '60' })
      if (catFilt) params.set('categoria', catFilt)
      if (query)   params.set('busca', query)
      const res = await fetch(`${BASE}/arch/catalogo?${params}`, { headers: authHeaders() })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: CatItem[] = await res.json()
      setItems(data)
      setSel(current => current && data.some(item => item.id === current.id) ? current : data[0] ?? null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar ambientes')
    } finally {
      setLoading(false)
    }
  }, [catFilt, query])

  useEffect(() => { void load() }, [load])

  const categories = [...new Set(items.map(i => i.categoria).filter(Boolean))] as string[]
  const canApply = hasPermission('PROJECT_EDIT')

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const }}>
      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' as const }}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar ambiente…"
          style={{ flex:1, minWidth:120, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, padding:'5px 10px', outline:'none' }}/>
        <select value={catFilt} onChange={e=>setCatFilt(e.target.value)}
          style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:catFilt?T.text:T.dim, fontSize:10, padding:'5px 8px', cursor:'pointer' }}>
          <option value=''>Todos os tipos</option>
          {categories.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={() => void load()} style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, cursor:'pointer', fontSize:10 }}>↻</button>
        <span style={{ fontSize:10, color:T.dim }}>{items.length} templates</span>
      </div>

      {error && <div style={{ padding:'8px 16px', background:'rgba(248,113,113,0.08)', borderBottom:`1px solid rgba(248,113,113,0.2)`, fontSize:11, color:'#f87171', flexShrink:0 }}>⚠ {error}</div>}

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <div style={{ flex:1, overflowY:'auto' as const, padding:16 }}>
          {loading && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
              {[1,2,3,4].map(i=><div key={i} style={{ height:120, borderRadius:10, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, animation:'pulse 1.5s infinite' }}/>)}
            </div>
          )}
          {!loading && items.length === 0 && (
            <div style={{ textAlign:'center' as const, padding:60, color:T.dim, fontSize:12 }}>
              <p style={{ margin:'0 0 8px', fontSize:28 }}>🏠</p>
              <p>Nenhum template de ambiente. Adicione itens ao catálogo via Biblioteca.</p>
            </div>
          )}
          {!loading && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
              {items.map(item=><SpaceCard key={item.id} item={item} selected={sel?.id===item.id} onSelect={()=>setSel(item)}/>)}
            </div>
          )}
        </div>
        {sel && <div style={{ width:300, flexShrink:0, borderLeft:`1px solid ${T.border}` }}><SpaceDetail item={sel} projectId={activeProject?.id ?? null} canApply={canApply}/></div>}
      </div>
    </div>
  )
}
