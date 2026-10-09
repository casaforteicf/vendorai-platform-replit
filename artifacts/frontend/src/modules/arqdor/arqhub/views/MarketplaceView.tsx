import { useState, useEffect, useCallback } from 'react'
import { T } from '../../shared/arqdor-theme'

const BASE = '/api'
function authHeaders(): Record<string, string> {
  const tok = localStorage.getItem('vendorai_token')
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

interface MktItem {
  id:               string
  vendedorTenantId: string
  nome:             string
  descricao:        string | null
  categoria:        string | null
  preco:            string | null
  especificacoes:   Record<string, unknown> | null
  ativo:            boolean
  totalVendas:      number | null
  createdAt:        string
}

export function MarketplaceView() {
  const [items,    setItems]    = useState<MktItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string|null>(null)
  const [sel,      setSel]      = useState<MktItem|null>(null)
  const [query,    setQuery]    = useState('')
  const [catFilt,  setCatFilt]  = useState('')
  const [buying,   setBuying]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ limit: '40' })
      if (query)   params.set('busca', query)
      if (catFilt) params.set('categoria', catFilt)
      const res = await fetch(`${BASE}/arch/marketplace?${params}`, { headers: authHeaders() })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: MktItem[] = await res.json()
      setItems(data)
      if (data.length > 0 && !sel) setSel(data[0])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar marketplace')
    } finally {
      setLoading(false)
    }
  }, [query, catFilt, sel])

  useEffect(() => { load() }, [load])

  const handleComprar = async (item: MktItem) => {
    setBuying(true)
    try {
      const res = await fetch(`${BASE}/arch/marketplace/${item.id}/comprar`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantidade: 1 }),
      })
      if (!res.ok) {
        const body = await res.json().catch(()=>({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      alert(`✅ "${item.nome}" adicionado ao seu projeto!`)
    } catch (e: unknown) {
      alert(`Erro: ${e instanceof Error ? e.message : 'falha na compra'}`)
    } finally {
      setBuying(false)
    }
  }

  const categories = [...new Set(items.map(i => i.categoria).filter(Boolean))] as string[]

  const fmtPreco = (p: string|null) => p && Number(p) > 0 ? `R$ ${Number(p).toFixed(2)}` : 'Grátis'

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const }}>
      {/* Toolbar */}
      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', gap:8, flexWrap:'wrap' as const, alignItems:'center' }}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar no marketplace…"
          style={{ flex:1, minWidth:120, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, padding:'5px 10px', outline:'none' }}/>
        <select value={catFilt} onChange={e=>setCatFilt(e.target.value)}
          style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:catFilt?T.text:T.dim, fontSize:10, padding:'5px 8px', cursor:'pointer' }}>
          <option value=''>Categoria</option>
          {categories.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={load} style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, cursor:'pointer', fontSize:10 }}>↻</button>
        <span style={{ fontSize:10, color:T.dim, alignSelf:'center' }}>{items.length} item(s)</span>
      </div>

      {error && (
        <div style={{ padding:'8px 16px', background:'rgba(248,113,113,0.08)', borderBottom:`1px solid rgba(248,113,113,0.2)`, fontSize:11, color:'#f87171', flexShrink:0 }}>
          ⚠ {error}
        </div>
      )}

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* List */}
        <div style={{ flex:1, overflowY:'auto' as const, padding:16 }}>
          {loading && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
              {[1,2,3,4,5,6].map(i=>(
                <div key={i} style={{ height:140, borderRadius:10, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, animation:'pulse 1.5s infinite' }}/>
              ))}
            </div>
          )}
          {!loading && items.length === 0 && (
            <div style={{ textAlign:'center' as const, padding:60, color:T.dim, fontSize:13 }}>
              <p style={{ margin:'0 0 8px', fontSize:32 }}>🛍️</p>
              <p style={{ margin:'0 0 4px', fontWeight:700, color:T.text }}>Marketplace vazio</p>
              <p style={{ margin:0 }}>Nenhum item disponível no momento. Tente outros filtros.</p>
            </div>
          )}
          {!loading && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
              {items.map(item => {
                const isGratis = !item.preco || Number(item.preco) === 0
                return (
                  <div key={item.id} onClick={()=>setSel(item)} style={{
                    cursor:'pointer', borderRadius:10,
                    border:`1px solid ${sel?.id===item.id?'rgba(15,159,110,0.55)':T.border}`,
                    background:sel?.id===item.id?'rgba(15,159,110,0.08)':T.surface,
                    padding:14, transition:'border 0.15s',
                  }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                      <span style={{ padding:'2px 7px', borderRadius:8, fontSize:9, background:'rgba(255,255,255,0.05)', color:T.dim }}>
                        {item.categoria ?? 'Geral'}
                      </span>
                      {(item.totalVendas ?? 0) > 0 && (
                        <span style={{ fontSize:9, color:T.dim }}>{item.totalVendas} vendas</span>
                      )}
                    </div>
                    <p style={{ margin:'0 0 4px', fontSize:12, fontWeight:700, color:'#fff', lineHeight:1.3 }}>{item.nome}</p>
                    {item.descricao && <p style={{ margin:'0 0 8px', fontSize:10, color:T.dim, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{item.descricao}</p>}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:14, fontWeight:800, color:isGratis?'#35d399':'#fff' }}>
                        {fmtPreco(item.preco)}
                      </span>
                      <button onClick={e=>{e.stopPropagation(); handleComprar(item)}} disabled={buying} style={{
                        padding:'4px 10px', borderRadius:6, border:'none',
                        background:isGratis?'rgba(53,211,153,0.15)':T.purple,
                        color:isGratis?'#35d399':'#fff', cursor:buying?'not-allowed':'pointer', fontSize:10, fontWeight:700,
                      }}>
                        {isGratis?'↓ Grátis':'Comprar'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Detail */}
        {sel && (
          <div style={{ width:300, flexShrink:0, borderLeft:`1px solid ${T.border}`, overflowY:'auto' as const, padding:16 }}>
            <div style={{ marginBottom:14 }}>
              <p style={{ margin:'0 0 4px', fontSize:14, fontWeight:800, color:'#fff' }}>{sel.nome}</p>
              <p style={{ margin:'0 0 2px', fontSize:10, color:T.dim }}>{sel.categoria ?? 'Geral'}</p>
            </div>

            {sel.descricao && (
              <p style={{ margin:'0 0 14px', fontSize:11, color:T.text, lineHeight:1.65 }}>{sel.descricao}</p>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:14 }}>
              {[
                ['Preço',     fmtPreco(sel.preco)],
                ['Vendas',    String(sel.totalVendas ?? 0)],
                ['Categoria', sel.categoria ?? '—'],
                ['Adicionado', new Date(sel.createdAt).toLocaleDateString('pt-BR')],
              ].map(([k,v])=>(
                <div key={k} style={{ padding:'6px 8px', borderRadius:6, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}` }}>
                  <p style={{ margin:'0 0 2px', fontSize:8, color:T.dim, fontWeight:700, letterSpacing:'0.06em' }}>{k}</p>
                  <p style={{ margin:0, fontSize:10, color:T.text }}>{v}</p>
                </div>
              ))}
            </div>

            {sel.especificacoes && Object.keys(sel.especificacoes).length > 0 && (
              <div style={{ marginBottom:14 }}>
                <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>ESPECIFICAÇÕES</p>
                {Object.entries(sel.especificacoes).slice(0, 6).map(([k,v])=>(
                  <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:`1px solid rgba(255,255,255,0.04)`, fontSize:10 }}>
                    <span style={{ color:T.dim }}>{k}</span>
                    <span style={{ color:T.text }}>{String(v)}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ padding:'14px', borderRadius:8, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, textAlign:'center' as const }}>
              <p style={{ margin:'0 0 10px', fontSize:22, fontWeight:900, color:(!sel.preco||Number(sel.preco)===0)?'#35d399':'#fff' }}>
                {fmtPreco(sel.preco)}
              </p>
              <button
                onClick={()=>handleComprar(sel)}
                disabled={buying}
                style={{ width:'100%', padding:'10px', borderRadius:8, border:'none', background:(!sel.preco||Number(sel.preco)===0)?'rgba(53,211,153,0.2)':T.purple, color:(!sel.preco||Number(sel.preco)===0)?'#35d399':'#fff', cursor:buying?'not-allowed':'pointer', fontSize:12, fontWeight:700 }}
              >
                {buying ? '⏳ Processando…' : (!sel.preco||Number(sel.preco)===0) ? '📥 Download Gratuito' : '🛍️ Adquirir'}
              </button>
              <p style={{ margin:'6px 0 0', fontSize:9, color:T.dim }}>Pagamento seguro · Entrega imediata</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
