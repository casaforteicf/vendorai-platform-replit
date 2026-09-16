import { useState, useEffect, useCallback } from 'react'
import { T } from '../../shared/arqdor-theme'
import { useWorkspace } from '../../workspace/context/WorkspaceContext'

const BASE = '/api'
function authHeaders(): Record<string, string> {
  const tok = localStorage.getItem('vendorai_token')
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

interface CatItem {
  id:            string
  nome:          string
  descricao:     string | null
  categoria:     string | null
  subcategoria:  string | null
  fornecedor:    string | null
  precoBase:     string | null
  imagens:       string[] | null
  especificacoes: Record<string, unknown> | null
  createdAt:     string
}

function AssetCard({ item, selected, onSelect }: { item: CatItem; selected: boolean; onSelect: ()=>void }) {
  const img = item.imagens?.[0]
  return (
    <div onClick={onSelect} style={{ cursor:'pointer', borderRadius:10, border:`1px solid ${selected?'rgba(124,58,237,0.5)':T.border}`, background:selected?'rgba(124,58,237,0.07)':T.surface, padding:14, transition:'border 0.15s' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        {img
          ? <img src={img} alt={item.nome} style={{ width:48, height:48, borderRadius:8, objectFit:'cover' as const }}/>
          : <span style={{ fontSize:28 }}>📦</span>
        }
        <div style={{ display:'flex', flexDirection:'column' as const, gap:3, alignItems:'flex-end' }}>
          {item.categoria && (
            <span style={{ fontSize:8, padding:'2px 6px', borderRadius:5, background:'rgba(124,58,237,0.12)', color:T.purpleL, fontWeight:700 }}>{item.categoria}</span>
          )}
          {item.subcategoria && (
            <span style={{ fontSize:8, padding:'2px 6px', borderRadius:5, background:'rgba(255,255,255,0.05)', color:T.dim }}>{item.subcategoria}</span>
          )}
        </div>
      </div>
      <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'#fff', lineHeight:1.3 }}>{item.nome}</p>
      <p style={{ margin:0, fontSize:9, color:T.dim }}>{item.fornecedor ?? '—'}</p>
    </div>
  )
}

function AssetDetail({ item, projectId, canApply }: { item: CatItem; projectId: string | null; canApply: boolean }) {
  const [handoff, setHandoff] = useState(false)

  const useInProject = () => {
    if (!projectId || !canApply) return
    sessionStorage.setItem('arqdor:pendingCatalogItem', JSON.stringify({
      id: item.id,
      name: item.nome,
      category: item.categoria,
      source: 'asset-library',
      projectId,
    }))
    setHandoff(true)
    window.dispatchEvent(new CustomEvent('arqdor:navigate', { detail: { module: 'real-specification' } }))
  }

  return (
    <div style={{ height:'100%', overflowY:'auto' as const, padding:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
        {item.imagens?.[0]
          ? <img src={item.imagens[0]} alt={item.nome} style={{ width:56, height:56, borderRadius:10, objectFit:'cover' as const }}/>
          : <span style={{ fontSize:42 }}>📦</span>
        }
        <div>
          <p style={{ margin:'0 0 2px', fontSize:14, fontWeight:800, color:'#fff' }}>{item.nome}</p>
          <p style={{ margin:'0 0 4px', fontSize:10, color:T.dim }}>{item.fornecedor ?? '—'}</p>
          <div style={{ display:'flex', gap:4 }}>
            {item.categoria && <span style={{ fontSize:9, padding:'2px 7px', borderRadius:5, background:'rgba(124,58,237,0.12)', color:T.purpleL, fontWeight:700 }}>{item.categoria}</span>}
            {item.subcategoria && <span style={{ fontSize:9, padding:'2px 7px', borderRadius:5, background:'rgba(255,255,255,0.05)', color:T.dim }}>{item.subcategoria}</span>}
          </div>
        </div>
      </div>

      {item.descricao && (
        <p style={{ margin:'0 0 14px', fontSize:11, color:T.text, lineHeight:1.65 }}>{item.descricao}</p>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:14 }}>
        {[
          ['Categoria',    item.categoria ?? '—'],
          ['Fornecedor',   item.fornecedor ?? '—'],
          ['Preço base',   item.precoBase ? `R$ ${Number(item.precoBase).toFixed(2)}` : '—'],
          ['Adicionado',   new Date(item.createdAt).toLocaleDateString('pt-BR')],
        ].map(([k,v])=>(
          <div key={k} style={{ padding:'6px 8px', borderRadius:6, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}` }}>
            <p style={{ margin:'0 0 2px', fontSize:8, color:T.dim, fontWeight:700, letterSpacing:'0.06em' }}>{k}</p>
            <p style={{ margin:0, fontSize:10, color:T.text }}>{v}</p>
          </div>
        ))}
      </div>

      {item.especificacoes && Object.keys(item.especificacoes).length > 0 && (
        <div style={{ marginBottom:14 }}>
          <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>ESPECIFICAÇÕES</p>
          {Object.entries(item.especificacoes).slice(0, 8).map(([k,v])=>(
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:`1px solid rgba(255,255,255,0.04)`, fontSize:10 }}>
              <span style={{ color:T.dim }}>{k}</span>
              <span style={{ color:T.text }}>{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      {item.imagens && item.imagens.length > 1 && (
        <div style={{ marginBottom:14 }}>
          <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>IMAGENS ({item.imagens.length})</p>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const }}>
            {item.imagens.slice(0, 6).map((url, i) => (
              <img key={i} src={url} alt="" style={{ width:60, height:60, borderRadius:6, objectFit:'cover' as const, border:`1px solid ${T.border}` }}/>
            ))}
          </div>
        </div>
      )}

      {!projectId && (
        <div style={{ marginBottom:10, padding:'8px 10px', borderRadius:7, background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.22)', color:'#fbbf24', fontSize:10, lineHeight:1.45 }}>
          Abra ou selecione um projeto antes de aplicar este item.
        </div>
      )}
      {projectId && !canApply && (
        <div style={{ marginBottom:10, padding:'8px 10px', borderRadius:7, background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.22)', color:'#f87171', fontSize:10, lineHeight:1.45 }}>
          Seu perfil não possui permissão para editar especificações deste projeto.
        </div>
      )}

      <button
        onClick={useInProject}
        disabled={!projectId || !canApply}
        style={{ width:'100%', padding:'9px', borderRadius:7, border:'none', background:(!projectId || !canApply)?'rgba(255,255,255,0.08)':T.purple, color:(!projectId || !canApply)?T.dim:'#fff', cursor:(!projectId || !canApply)?'not-allowed':'pointer', fontSize:11, fontWeight:700 }}>
        {handoff ? '✓ Abrindo especificações…' : '📥 Usar neste Projeto'}
      </button>
      {projectId && canApply && (
        <p style={{ margin:'7px 0 0', fontSize:9, color:T.dim, lineHeight:1.45, textAlign:'center' as const }}>
          Você escolherá o objeto do projeto antes da aplicação. Nenhum material é alterado automaticamente.
        </p>
      )}
    </div>
  )
}

export function AssetLibraryView() {
  const { activeProject, hasPermission } = useWorkspace()
  const [items,   setItems]   = useState<CatItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string|null>(null)
  const [query, setQuery]     = useState('')
  const [catFilt, setCatFilt] = useState('')
  const [sel, setSel]         = useState<CatItem|null>(null)

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
      setError(e instanceof Error ? e.message : 'Erro ao carregar assets')
    } finally {
      setLoading(false)
    }
  }, [catFilt, query])

  useEffect(() => { void load() }, [load])

  const categories = [...new Set(items.map(i => i.categoria).filter(Boolean))] as string[]
  const canApply = hasPermission('PROJECT_EDIT') && hasPermission('MATERIAL_SELECT')

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const }}>
      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' as const }}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar asset…"
          style={{ flex:1, minWidth:120, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, padding:'5px 10px', outline:'none' }}/>
        <select value={catFilt} onChange={e=>setCatFilt(e.target.value)}
          style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:catFilt?T.text:T.dim, fontSize:10, padding:'5px 8px', cursor:'pointer' }}>
          <option value=''>Todos os tipos</option>
          {categories.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={() => void load()} style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, cursor:'pointer', fontSize:10 }}>↻</button>
        <span style={{ fontSize:10, color:T.dim }}>{items.length} assets</span>
      </div>

      {error && (
        <div style={{ padding:'8px 16px', background:'rgba(248,113,113,0.08)', borderBottom:`1px solid rgba(248,113,113,0.2)`, fontSize:11, color:'#f87171', flexShrink:0 }}>
          ⚠ {error}
        </div>
      )}

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <div style={{ flex:1, overflowY:'auto' as const, padding:16 }}>
          {loading && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
              {[1,2,3,4,5,6].map(i=><div key={i} style={{ height:120, borderRadius:10, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, animation:'pulse 1.5s infinite' }}/>)}
            </div>
          )}
          {!loading && items.length === 0 && (
            <div style={{ textAlign:'center' as const, padding:60, color:T.dim, fontSize:12 }}>
              <p style={{ margin:'0 0 8px', fontSize:28 }}>📦</p>
              <p>Biblioteca vazia. Adicione itens ao catálogo via Biblioteca.</p>
            </div>
          )}
          {!loading && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
              {items.map(item=><AssetCard key={item.id} item={item} selected={sel?.id===item.id} onSelect={()=>setSel(item)}/>)}
            </div>
          )}
        </div>
        {sel && <div style={{ width:300, flexShrink:0, borderLeft:`1px solid ${T.border}` }}><AssetDetail item={sel} projectId={activeProject?.id ?? null} canApply={canApply}/></div>}
      </div>
    </div>
  )
}
