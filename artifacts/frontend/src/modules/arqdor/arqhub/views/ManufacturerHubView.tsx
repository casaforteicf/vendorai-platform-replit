import { useState, useEffect, useCallback } from 'react'
import { T } from '../../shared/arqdor-theme'

const BASE = '/api'
function authHeaders(): Record<string, string> {
  const tok = localStorage.getItem('vendorai_token')
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

interface CatItem {
  id:        string
  nome:      string
  descricao: string | null
  categoria: string | null
  fornecedor: string | null
  precoBase:  string | null
  imagens:    string[] | null
}

interface Manufacturer {
  name:       string
  itemCount:  number
  categories: string[]
  items:      CatItem[]
}

function MfrCard({ m, selected, onSelect }: { m: Manufacturer; selected: boolean; onSelect: ()=>void }) {
  return (
    <div onClick={onSelect} style={{ cursor:'pointer', borderRadius:10, border:`1px solid ${selected?'rgba(124,58,237,0.5)':T.border}`, background:selected?'rgba(124,58,237,0.07)':T.surface, padding:14, transition:'border 0.15s' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
        <div style={{ width:42, height:42, borderRadius:8, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>
          🏭
        </div>
        <span style={{ fontSize:9, padding:'2px 6px', borderRadius:6, background:'rgba(74,222,128,0.12)', color:'#4ade80', fontWeight:700 }}>
          {m.itemCount} item(s)
        </span>
      </div>
      <p style={{ margin:'0 0 6px', fontSize:12, fontWeight:800, color:'#fff' }}>{m.name}</p>
      <div style={{ display:'flex', gap:3, flexWrap:'wrap' as const }}>
        {m.categories.slice(0, 2).map(c => (
          <span key={c} style={{ fontSize:8, padding:'2px 6px', borderRadius:5, background:'rgba(124,58,237,0.1)', color:T.purpleL }}>{c}</span>
        ))}
        {m.categories.length > 2 && (
          <span style={{ fontSize:8, padding:'2px 6px', borderRadius:5, background:'rgba(255,255,255,0.05)', color:T.dim }}>+{m.categories.length-2}</span>
        )}
      </div>
    </div>
  )
}

function MfrDetail({ m }: { m: Manufacturer }) {
  return (
    <div style={{ height:'100%', overflowY:'auto' as const, padding:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
        <div style={{ width:56, height:56, borderRadius:10, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, flexShrink:0 }}>
          🏭
        </div>
        <div>
          <p style={{ margin:'0 0 3px', fontSize:15, fontWeight:900, color:'#fff' }}>{m.name}</p>
          <span style={{ fontSize:9, padding:'2px 8px', borderRadius:6, background:'rgba(74,222,128,0.12)', color:'#4ade80', fontWeight:700 }}>
            {m.itemCount} item(s) no catálogo
          </span>
        </div>
      </div>

      {m.categories.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <p style={{ margin:'0 0 5px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>CATEGORIAS</p>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
            {m.categories.map(c => (
              <span key={c} style={{ fontSize:10, padding:'2px 8px', borderRadius:6, background:'rgba(124,58,237,0.1)', color:T.purpleL }}>{c}</span>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom:12 }}>
        <p style={{ margin:'0 0 8px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>PRODUTOS NO CATÁLOGO</p>
        {m.items.slice(0, 8).map(item => (
          <div key={item.id} style={{ display:'flex', gap:10, alignItems:'center', padding:'7px 10px', borderRadius:7, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, marginBottom:6 }}>
            {item.imagens?.[0]
              ? <img src={item.imagens[0]} alt={item.nome} style={{ width:32, height:32, borderRadius:6, objectFit:'cover' as const, flexShrink:0 }}/>
              : <span style={{ fontSize:18, flexShrink:0 }}>📦</span>
            }
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{item.nome}</p>
              <p style={{ margin:0, fontSize:9, color:T.dim }}>{item.categoria ?? '—'}</p>
            </div>
            {item.precoBase && <span style={{ fontSize:10, color:T.purpleL, flexShrink:0 }}>R$ {Number(item.precoBase).toFixed(0)}</span>}
          </div>
        ))}
        {m.items.length > 8 && <p style={{ margin:'4px 0 0', fontSize:10, color:T.dim }}>+ {m.items.length - 8} outros…</p>}
      </div>
    </div>
  )
}

export function ManufacturerHubView() {
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([])
  const [loading, setLoading]             = useState(true)
  const [error,   setError]               = useState<string|null>(null)
  const [query,   setQuery]               = useState('')
  const [sel,     setSel]                 = useState<Manufacturer|null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${BASE}/arch/catalogo?limit=200`, { headers: authHeaders() })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const items: CatItem[] = await res.json()

      // Aggregate by fornecedor
      const grouped: Record<string, CatItem[]> = {}
      for (const item of items) {
        const key = item.fornecedor?.trim() || '(sem fornecedor)'
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(item)
      }

      const mfrs: Manufacturer[] = Object.entries(grouped)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([name, itens]) => ({
          name,
          itemCount:  itens.length,
          categories: [...new Set(itens.map(i => i.categoria).filter(Boolean) as string[])],
          items:      itens,
        }))

      setManufacturers(mfrs)
      if (mfrs.length > 0) setSel(mfrs[0])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar fabricantes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = manufacturers.filter(m =>
    !query || m.name.toLowerCase().includes(query.toLowerCase()) ||
    m.categories.some(c => c.toLowerCase().includes(query.toLowerCase()))
  )

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const }}>
      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', gap:8, alignItems:'center' }}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar fabricante…"
          style={{ flex:1, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, padding:'5px 10px', outline:'none' }}/>
        <button onClick={load} style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, cursor:'pointer', fontSize:10 }}>↻</button>
        <span style={{ fontSize:10, color:T.dim, whiteSpace:'nowrap' as const }}>{filtered.length} fabricantes</span>
      </div>

      {error && <div style={{ padding:'8px 16px', background:'rgba(248,113,113,0.08)', borderBottom:`1px solid rgba(248,113,113,0.2)`, fontSize:11, color:'#f87171', flexShrink:0 }}>⚠ {error}</div>}

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <div style={{ flex:1, overflowY:'auto' as const, padding:16 }}>
          {loading && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12 }}>
              {[1,2,3,4,5,6].map(i=><div key={i} style={{ height:100, borderRadius:10, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, animation:'pulse 1.5s infinite' }}/>)}
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign:'center' as const, padding:60, color:T.dim, fontSize:12 }}>
              <p style={{ margin:'0 0 8px', fontSize:28 }}>🏭</p>
              <p>Nenhum fabricante. Adicione itens com o campo "fornecedor" preenchido via Biblioteca.</p>
            </div>
          )}
          {!loading && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12 }}>
              {filtered.map(m=><MfrCard key={m.name} m={m} selected={sel?.name===m.name} onSelect={()=>setSel(m)}/>)}
            </div>
          )}
        </div>
        {sel && <div style={{ width:300, flexShrink:0, borderLeft:`1px solid ${T.border}` }}><MfrDetail m={sel}/></div>}
      </div>
    </div>
  )
}
