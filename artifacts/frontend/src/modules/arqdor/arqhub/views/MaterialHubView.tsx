import { useState, useEffect, useCallback } from 'react'
import { T } from '../../shared/arqdor-theme'

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

function CatCard({ item, selected, onSelect }: { item: CatItem; selected: boolean; onSelect: ()=>void }) {
  const img = item.imagens?.[0]
  return (
    <div onClick={onSelect} style={{ cursor:'pointer', borderRadius:10, overflow:'hidden',
      border:`1px solid ${selected?'rgba(124,58,237,0.5)':T.border}`,
      background: selected?'rgba(124,58,237,0.07)':T.surface, transition:'border 0.15s' }}>
      {img ? (
        <img src={img} alt={item.nome} style={{ width:'100%', height:64, objectFit:'cover' as const, display:'block' }}/>
      ) : (
        <div style={{ height:64, background:'rgba(124,58,237,0.06)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span style={{ fontSize:22 }}>📦</span>
        </div>
      )}
      <div style={{ padding:'10px 10px 12px' }}>
        <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'#fff', lineHeight:1.3 }}>{item.nome}</p>
        <p style={{ margin:'0 0 4px', fontSize:9, color:T.dim }}>{item.fornecedor ?? '—'}</p>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
          {item.categoria && (
            <span style={{ fontSize:8, padding:'2px 6px', borderRadius:6, background:'rgba(124,58,237,0.12)', color:T.purpleL }}>
              {item.categoria}
            </span>
          )}
          {item.subcategoria && (
            <span style={{ fontSize:8, padding:'2px 6px', borderRadius:6, background:'rgba(255,255,255,0.05)', color:T.dim }}>
              {item.subcategoria}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function CatDetail({ item }: { item: CatItem }) {
  return (
    <div style={{ height:'100%', overflowY:'auto' as const, padding:16 }}>
      {item.imagens && item.imagens.length > 0 && (
        <div style={{ display:'flex', gap:4, marginBottom:14, borderRadius:8, overflow:'hidden' }}>
          {item.imagens.slice(0,3).map((url, i) => (
            <img key={i} src={url} alt="" style={{ flex:1, height:70, objectFit:'cover' as const, display:'block' }}/>
          ))}
        </div>
      )}

      <p style={{ margin:'0 0 3px', fontSize:14, fontWeight:800, color:'#fff' }}>{item.nome}</p>
      <p style={{ margin:'0 0 10px', fontSize:10, color:T.dim }}>{item.fornecedor ?? '—'} · {item.categoria ?? '—'}</p>

      {item.descricao && (
        <p style={{ margin:'0 0 14px', fontSize:11, color:T.text, lineHeight:1.65 }}>{item.descricao}</p>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:14 }}>
        {[
          ['Categoria',    item.categoria ?? '—'],
          ['Subcategoria', item.subcategoria ?? '—'],
          ['Fornecedor',   item.fornecedor ?? '—'],
          ['Preço base',   item.precoBase ? `R$ ${Number(item.precoBase).toFixed(2)}` : '—'],
          ['Adicionado',   new Date(item.createdAt).toLocaleDateString('pt-BR')],
        ].filter(([, v])=> v !== '—').map(([k,v]) => (
          <div key={k} style={{ padding:'6px 8px', borderRadius:6, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}` }}>
            <p style={{ margin:'0 0 2px', fontSize:8, color:T.dim, fontWeight:700, letterSpacing:'0.06em' }}>{k}</p>
            <p style={{ margin:0, fontSize:10, color:T.text }}>{v}</p>
          </div>
        ))}
      </div>

      {item.especificacoes && Object.keys(item.especificacoes).length > 0 && (
        <div style={{ marginBottom:12 }}>
          <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>ESPECIFICAÇÕES</p>
          {Object.entries(item.especificacoes).slice(0, 8).map(([k, v]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:`1px solid rgba(255,255,255,0.04)`, fontSize:10 }}>
              <span style={{ color:T.dim }}>{k}</span>
              <span style={{ color:T.text }}>{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function MaterialHubView() {
  const [items,   setItems]   = useState<CatItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string|null>(null)
  const [cat, setCat]         = useState('')
  const [query, setQuery]     = useState('')
  const [sel, setSel]         = useState<CatItem|null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ limit: '60' })
      if (cat)   params.set('categoria', cat)
      if (query) params.set('busca', query)
      const res = await fetch(`${BASE}/arch/catalogo?${params}`, { headers: authHeaders() })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: CatItem[] = await res.json()
      setItems(data)
      if (data.length > 0 && !sel) setSel(data[0])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar catálogo')
    } finally {
      setLoading(false)
    }
  }, [cat, query, sel])

  useEffect(() => { load() }, [load])

  const categories = [...new Set(items.map(i => i.categoria).filter(Boolean))] as string[]

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const }}>
      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', gap:8, alignItems:'center' }}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar material…"
          style={{ flex:1, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, padding:'5px 10px', outline:'none' }}/>
        <select value={cat} onChange={e=>setCat(e.target.value)}
          style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:cat?T.text:T.dim, fontSize:10, padding:'5px 8px', cursor:'pointer' }}>
          <option value=''>Todas as categorias</option>
          {categories.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={load} style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, cursor:'pointer', fontSize:10 }}>↻</button>
        <span style={{ fontSize:10, color:T.dim, whiteSpace:'nowrap' as const }}>{items.length} itens</span>
      </div>

      {/* Category pills */}
      {categories.length > 0 && (
        <div style={{ padding:'8px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', gap:4, overflowX:'auto' as const }}>
          <button onClick={()=>setCat('')} style={{ padding:'3px 10px', borderRadius:10, border:`1px solid ${!cat?T.purple:T.border}`, background:!cat?'rgba(124,58,237,0.15)':'transparent', color:!cat?T.purpleL:T.dim, fontSize:10, cursor:'pointer', whiteSpace:'nowrap' as const }}>Todos</button>
          {categories.map(c=>(
            <button key={c} onClick={()=>setCat(c===cat?'':c)} style={{ padding:'3px 10px', borderRadius:10, border:`1px solid ${cat===c?T.purple:T.border}`, background:cat===c?'rgba(124,58,237,0.15)':'transparent', color:cat===c?T.purpleL:T.dim, fontSize:10, cursor:'pointer', whiteSpace:'nowrap' as const }}>
              {c}
            </button>
          ))}
        </div>
      )}

      {error && <div style={{ padding:'8px 16px', background:'rgba(248,113,113,0.08)', borderBottom:`1px solid rgba(248,113,113,0.2)`, fontSize:11, color:'#f87171', flexShrink:0 }}>⚠ {error}</div>}

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <div style={{ flex:1, overflowY:'auto' as const, padding:16 }}>
          {loading && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12 }}>
              {[1,2,3,4,5,6].map(i=><div key={i} style={{ height:130, borderRadius:10, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, animation:'pulse 1.5s infinite' }}/>)}
            </div>
          )}
          {!loading && items.length === 0 && (
            <div style={{ textAlign:'center' as const, padding:60, color:T.dim, fontSize:12 }}>
              <p style={{ margin:'0 0 8px', fontSize:28 }}>📦</p>
              <p>Nenhum material no catálogo. Adicione via Biblioteca.</p>
            </div>
          )}
          {!loading && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12 }}>
              {items.map(item=><CatCard key={item.id} item={item} selected={sel?.id===item.id} onSelect={()=>setSel(item)}/>)}
            </div>
          )}
        </div>
        {sel && <div style={{ width:280, flexShrink:0, borderLeft:`1px solid ${T.border}` }}><CatDetail item={sel}/></div>}
      </div>
    </div>
  )
}
