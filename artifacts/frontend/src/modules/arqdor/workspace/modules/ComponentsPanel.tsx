import { useState, useEffect, useCallback } from 'react'
import { T } from '../../shared/arqdor-theme'

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
  precoBase:      string | null
  imagens:        string[] | null
  especificacoes: Record<string, unknown> | null
}

function ComponentCard({ item, selected, onSelect }: { item: CatItem; selected: boolean; onSelect: ()=>void }) {
  const img = item.imagens?.[0]
  return (
    <div onClick={onSelect} style={{
      borderRadius:10, padding:'12px', cursor:'pointer',
      background: selected ? 'rgba(124,58,237,0.1)' : T.card,
      border:`1px solid ${selected ? 'rgba(124,58,237,0.4)' : T.border}`,
      transition:'border-color 0.15s',
    }}>
      <div style={{ height:72, borderRadius:7, background:'rgba(255,255,255,0.04)', marginBottom:10,
        display:'flex', alignItems:'center', justifyContent:'center', border:`1px solid ${T.border}`, overflow:'hidden' }}>
        {img
          ? <img src={img} alt={item.nome} style={{ width:'100%', height:'100%', objectFit:'cover' as const }}/>
          : <span style={{ fontSize:24 }}>📦</span>
        }
      </div>
      <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'#fff', lineHeight:1.3 }}>{item.nome}</p>
      <p style={{ margin:'0 0 6px', fontSize:10, color:T.dim }}>{item.fornecedor ?? '—'}</p>
      <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
        {item.categoria && (
          <span style={{ fontSize:9, padding:'2px 6px', borderRadius:8, background:'rgba(124,58,237,0.15)', color:T.purpleL }}>
            {item.categoria}
          </span>
        )}
        {item.subcategoria && (
          <span style={{ fontSize:9, padding:'2px 6px', borderRadius:8, background:'rgba(255,255,255,0.05)', color:T.dim }}>
            {item.subcategoria}
          </span>
        )}
      </div>
    </div>
  )
}

function ComponentDetail({ item }: { item: CatItem }) {
  const [showForm, setShowForm] = useState(false)
  const specs = item.especificacoes ?? {}
  const img   = item.imagens?.[0]

  return (
    <div style={{ height:'100%', overflowY:'auto' as const, padding:'14px' }}>
      <div style={{ marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
          {img
            ? <img src={img} alt={item.nome} style={{ width:48, height:48, borderRadius:8, objectFit:'cover' as const, flexShrink:0 }}/>
            : <span style={{ fontSize:32 }}>📦</span>
          }
          <div style={{ flex:1 }}>
            <p style={{ margin:'0 0 3px', fontSize:14, fontWeight:800, color:'#fff', lineHeight:1.3 }}>{item.nome}</p>
            <p style={{ margin:0, fontSize:11, color:T.dim }}>{item.fornecedor ?? '—'}</p>
          </div>
        </div>
      </div>

      <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' as const }}>
        {item.categoria && (
          <span style={{ padding:'3px 9px', borderRadius:10, fontSize:10, background:'rgba(124,58,237,0.15)', color:T.purpleL }}>
            {item.categoria}
          </span>
        )}
        {item.subcategoria && (
          <span style={{ padding:'3px 9px', borderRadius:10, fontSize:10, background:'rgba(255,255,255,0.06)', color:T.dim }}>
            {item.subcategoria}
          </span>
        )}
      </div>

      {item.descricao && (
        <p style={{ margin:'0 0 12px', fontSize:11, color:T.text, lineHeight:1.65 }}>{item.descricao}</p>
      )}

      {item.precoBase && (
        <div style={{ marginBottom:12, padding:'8px 10px', borderRadius:8, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}` }}>
          <p style={{ margin:'0 0 4px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>PREÇO BASE</p>
          <p style={{ margin:0, fontSize:14, fontWeight:800, color:T.purpleL }}>R$ {Number(item.precoBase).toFixed(2)}</p>
        </div>
      )}

      {Object.keys(specs).length > 0 && (
        <div style={{ marginBottom:12 }}>
          <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>ESPECIFICAÇÕES</p>
          {Object.entries(specs).slice(0, 8).map(([k, v]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:`1px solid rgba(255,255,255,0.04)`, fontSize:10 }}>
              <span style={{ color:T.dim }}>{k}</span>
              <span style={{ color:T.text }}>{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      {item.imagens && item.imagens.length > 1 && (
        <div style={{ marginBottom:12 }}>
          <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>IMAGENS</p>
          <div style={{ display:'flex', gap:4 }}>
            {item.imagens.slice(0, 4).map((url, i) => (
              <img key={i} src={url} alt="" style={{ width:48, height:48, borderRadius:6, objectFit:'cover' as const, border:`1px solid ${T.border}` }}/>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => setShowForm(true)} style={{
        width:'100%', padding:'10px', borderRadius:8, border:'none', background:T.purple,
        color:'#fff', cursor:'pointer', fontSize:12, fontWeight:700,
      }}>
        🔗 Vincular a Objeto do Projeto
      </button>

      {showForm && (
        <div style={{ marginTop:12, padding:'12px', borderRadius:8, background:'rgba(124,58,237,0.07)', border:`1px solid rgba(124,58,237,0.2)` }}>
          <p style={{ margin:'0 0 8px', fontSize:11, fontWeight:700, color:T.purpleL }}>Vincular a objeto</p>
          <p style={{ margin:'0 0 10px', fontSize:10, color:T.dim, lineHeight:1.6 }}>
            Selecione o objeto no painel <strong style={{ color:T.text }}>Projeto Inteligente</strong> e use a aba Componente no inspector para vincular <em>{item.nome}</em>.
          </p>
          <button onClick={()=>setShowForm(false)} style={{ padding:'5px 12px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, cursor:'pointer', fontSize:10 }}>
            Entendido
          </button>
        </div>
      )}
    </div>
  )
}

export function ComponentsPanel() {
  const [items,   setItems]   = useState<CatItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string|null>(null)
  const [query, setQuery]     = useState('')
  const [cat, setCat]         = useState('')
  const [mfr, setMfr]         = useState('')
  const [sel, setSel]         = useState<CatItem|null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ limit: '120' })
      if (cat) params.set('categoria', cat)
      if (mfr) params.set('fornecedor', mfr)
      if (query) params.set('busca', query)
      const res = await fetch(`${BASE}/arch/catalogo?${params}`, { headers: authHeaders() })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: CatItem[] = await res.json()
      setItems(data)
      if (data.length > 0 && !sel) setSel(data[0])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar componentes')
    } finally {
      setLoading(false)
    }
  }, [cat, mfr, query, sel])

  useEffect(() => { load() }, [load])

  const categories  = [...new Set(items.map(i => i.categoria).filter(Boolean))] as string[]
  const fornecedores = [...new Set(items.map(i => i.fornecedor).filter(Boolean))].sort() as string[]

  const filtered = items.filter(item => {
    if (cat && item.categoria !== cat) return false
    if (mfr && item.fornecedor !== mfr) return false
    if (query) {
      const q = query.toLowerCase()
      return item.nome.toLowerCase().includes(q) || (item.descricao ?? '').toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const }}>
      <div style={{ padding:'0 0 10px', flexShrink:0 }}>
        <div style={{ display:'flex', gap:8, marginBottom:8 }}>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar componente…"
            style={{ flex:1, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, padding:'5px 10px', outline:'none' }}/>
          <button onClick={load} style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, cursor:'pointer', fontSize:10 }}>↻</button>
        </div>
        <div style={{ display:'flex', gap:6, overflowX:'auto' as const }}>
          <select value={cat} onChange={e=>setCat(e.target.value)}
            style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:cat?T.text:T.dim, fontSize:10, padding:'4px 8px', cursor:'pointer' }}>
            <option value=''>Categoria</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={mfr} onChange={e=>setMfr(e.target.value)}
            style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:mfr?T.text:T.dim, fontSize:10, padding:'4px 8px', cursor:'pointer' }}>
            <option value=''>Fabricante</option>
            {fornecedores.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          {(cat||mfr||query) && (
            <button onClick={()=>{setCat('');setMfr('');setQuery('')}} style={{ padding:'4px 10px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:'#f87171', cursor:'pointer', fontSize:10 }}>
              ✕ Limpar
            </button>
          )}
          <span style={{ fontSize:10, color:T.dim, alignSelf:'center', marginLeft:'auto', flexShrink:0 }}>
            {loading ? '…' : `${filtered.length}/${items.length}`}
          </span>
        </div>
        {error && (
          <div style={{ marginTop:6, fontSize:10, color:'#f87171' }}>⚠ {error}</div>
        )}
      </div>

      <div style={{ flex:1, display:'flex', gap:0, overflow:'hidden', borderTop:`1px solid ${T.border}` }}>
        <div style={{ flex:1, overflowY:'auto' as const, padding:'12px 0' }}>
          {loading && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10, paddingRight:12 }}>
              {[1,2,3,4,5,6].map(i=><div key={i} style={{ height:110, borderRadius:10, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, animation:'pulse 1.5s infinite' }}/>)}
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ padding:'40px', textAlign:'center' as const, color:T.dim, fontSize:12 }}>
              {items.length === 0
                ? <span>Catálogo vazio. Adicione itens via Biblioteca.</span>
                : <span>Nenhum componente encontrado.</span>
              }
            </div>
          )}
          {!loading && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10, paddingRight:12 }}>
              {filtered.map(item => (
                <ComponentCard key={item.id} item={item} selected={sel?.id===item.id} onSelect={()=>setSel(item)}/>
              ))}
            </div>
          )}
        </div>

        {sel && (
          <div style={{ width:280, flexShrink:0, borderLeft:`1px solid ${T.border}` }}>
            <ComponentDetail item={sel}/>
          </div>
        )}
      </div>
    </div>
  )
}
