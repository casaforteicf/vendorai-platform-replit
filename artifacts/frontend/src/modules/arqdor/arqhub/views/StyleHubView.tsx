import { useCallback, useEffect, useMemo, useState } from 'react'
import { T } from '../../shared/arqdor-theme'

const BASE = '/api'
function authHeaders(): Record<string, string> {
  const tok = localStorage.getItem('vendorai_token')
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

interface CatItem {
  id: string
  nome: string
  descricao: string | null
  categoria: string | null
  subcategoria: string | null
  fornecedor: string | null
  imagens: string[] | null
  especificacoes: Record<string, unknown> | null
}

function normalizeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(v) || /^#[0-9a-f]{3}$/i.test(v)) return v
  return null
}

function paletteFromSpecs(specs: Record<string, unknown> | null): string[] {
  if (!specs) return []
  const candidates = [specs['paleta'], specs['palette'], specs['cores'], specs['colors']]
  const values = candidates.flatMap((candidate) => {
    if (Array.isArray(candidate)) return candidate
    if (candidate && typeof candidate === 'object') return Object.values(candidate as Record<string, unknown>)
    return candidate ? [candidate] : []
  })
  return [...new Set(values.map(normalizeColor).filter((v): v is string => Boolean(v)))].slice(0, 8)
}

function StylePreview({ item }: { item: CatItem }) {
  const palette = paletteFromSpecs(item.especificacoes)
  if (item.imagens?.[0]) {
    return <img src={item.imagens[0]} alt={item.nome} style={{ width:'100%', height:72, objectFit:'cover', display:'block' }}/>
  }
  if (palette.length > 0) {
    return <div style={{ height:72, display:'flex' }}>{palette.map((color)=><div key={color} style={{ flex:1, background:color }}/>)}</div>
  }
  return <div style={{ height:72, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(255,255,255,0.03)', color:T.dim, fontSize:11 }}>Sem imagem ou paleta cadastrada</div>
}

export function StyleHubView() {
  const [items, setItems] = useState<CatItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string|null>(null)
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState<CatItem|null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${BASE}/arch/catalogo?limit=80`, { headers: authHeaders() })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: CatItem[] = await res.json()
      setItems(data)
      setSel((current) => current ?? data[0] ?? null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar estilos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => items.filter((item) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return [item.nome, item.descricao, item.categoria, item.subcategoria, item.fornecedor]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q))
  }), [items, query])

  const palette = paletteFromSpecs(sel?.especificacoes ?? null)

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, display:'flex', gap:8, alignItems:'center' }}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar estilo cadastrado…" style={{ flex:1, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, padding:'6px 10px', outline:'none' }}/>
        <button onClick={()=>void load()} style={{ padding:'6px 10px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, cursor:'pointer', fontSize:10 }}>↻</button>
        <span style={{ fontSize:10, color:T.dim }}>{filtered.length} item(s)</span>
      </div>

      {error && <div style={{ padding:'8px 16px', color:'#f87171', borderBottom:`1px solid ${T.border}` }}>⚠ {error}</div>}

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <div style={{ flex:1, overflowY:'auto', padding:16 }}>
          {loading && <div style={{ color:T.dim, fontSize:12 }}>Carregando estilos reais do catálogo…</div>}
          {!loading && filtered.length === 0 && <div style={{ color:T.dim, fontSize:12, padding:40, textAlign:'center' }}>Nenhum estilo cadastrado no catálogo.</div>}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))', gap:12 }}>
            {filtered.map((item) => (
              <button key={item.id} onClick={()=>setSel(item)} style={{ padding:0, overflow:'hidden', textAlign:'left', cursor:'pointer', borderRadius:10, border:`1px solid ${sel?.id===item.id?'rgba(124,58,237,0.5)':T.border}`, background:sel?.id===item.id?'rgba(124,58,237,0.07)':T.surface }}>
                <StylePreview item={item}/>
                <div style={{ padding:12 }}>
                  <p style={{ margin:'0 0 3px', fontSize:12, fontWeight:800, color:'#fff' }}>{item.nome}</p>
                  <p style={{ margin:0, fontSize:9, color:T.dim }}>{item.categoria ?? 'Sem categoria'}{item.subcategoria ? ` · ${item.subcategoria}` : ''}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {sel && <aside style={{ width:310, flexShrink:0, borderLeft:`1px solid ${T.border}`, padding:16, overflowY:'auto' }}>
          <StylePreview item={sel}/>
          <h3 style={{ margin:'14px 0 4px', color:'#fff', fontSize:15 }}>{sel.nome}</h3>
          <p style={{ margin:'0 0 12px', color:T.dim, fontSize:10 }}>{sel.fornecedor ?? 'Sem fabricante informado'}</p>
          {sel.descricao && <p style={{ color:T.text, fontSize:11, lineHeight:1.6 }}>{sel.descricao}</p>}

          <p style={{ margin:'16px 0 7px', color:T.dim, fontSize:9, fontWeight:700, letterSpacing:'0.06em' }}>PALETA CADASTRADA</p>
          {palette.length > 0 ? (
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>{palette.map((color)=><div key={color} title={color} style={{ width:34, height:34, borderRadius:7, background:color, border:`1px solid ${T.border}` }}/>)}</div>
          ) : (
            <p style={{ margin:0, color:T.dim, fontSize:10 }}>Nenhuma paleta foi cadastrada. O sistema não gera cores fictícias.</p>
          )}

          {sel.especificacoes && Object.keys(sel.especificacoes).length > 0 && <div style={{ marginTop:16 }}>
            <p style={{ margin:'0 0 7px', color:T.dim, fontSize:9, fontWeight:700, letterSpacing:'0.06em' }}>DADOS DO CATÁLOGO</p>
            {Object.entries(sel.especificacoes).filter(([key])=>!['paleta','palette','cores','colors'].includes(key)).slice(0,10).map(([key,value]) => (
              <div key={key} style={{ padding:'5px 0', borderBottom:`1px solid rgba(255,255,255,0.04)`, fontSize:10, display:'flex', justifyContent:'space-between', gap:10 }}>
                <span style={{ color:T.dim }}>{key}</span><span style={{ color:T.text, textAlign:'right' }}>{Array.isArray(value) ? value.join(', ') : String(value)}</span>
              </div>
            ))}
          </div>}

          <div style={{ marginTop:18, padding:12, borderRadius:8, border:`1px solid ${T.border}`, background:'rgba(255,255,255,0.03)' }}>
            <p style={{ margin:0, color:T.dim, fontSize:10 }}>Aplicação ao projeto deve passar pelo fluxo do projeto/Workspace. Esta tela não altera o projeto automaticamente.</p>
          </div>
        </aside>}
      </div>
    </div>
  )
}
