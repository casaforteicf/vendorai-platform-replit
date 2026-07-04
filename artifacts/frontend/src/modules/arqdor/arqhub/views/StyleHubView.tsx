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
  imagens:        string[] | null
  especificacoes: Record<string, unknown> | null
}

// Generate a deterministic color palette from item name
function derivePalette(nome: string): string[] {
  const PALETTES = [
    ['#E8E0D5','#C8A87A','#2D2D2D','#6B5B4E'],
    ['#FFFFFF','#F0F0F0','#1A1A1A','#888'],
    ['#E8DDD0','#8B7355','#4A4A4A','#BEB0A0'],
    ['#6B6B6B','#3D2B1F','#C0C0C0','#8B7B6B'],
    ['#FAFAFA','#D4C5B5','#5B7B7A','#8B9E9D'],
    ['#D4A76A','#8B5A2B','#6B8E6B','#C8A87A'],
    ['#1A1A2E','#C9A227','#E8E0D5','#7A6B5A'],
    ['#F5E6D3','#8B6914','#2C1810','#D4A76A'],
  ]
  const idx = nome.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTES.length
  return PALETTES[idx]
}

function StyleCard({ item, selected, onSelect }: { item: CatItem; selected: boolean; onSelect: ()=>void }) {
  const palette = derivePalette(item.nome)
  return (
    <div onClick={onSelect} style={{ cursor:'pointer', borderRadius:10, border:`1px solid ${selected?'rgba(124,58,237,0.5)':T.border}`, background:selected?'rgba(124,58,237,0.07)':T.surface, overflow:'hidden', transition:'border 0.15s' }}>
      <div style={{ height:60, display:'flex' }}>
        {palette.map((c, i) => <div key={i} style={{ flex:1, background:c }}/>)}
      </div>
      <div style={{ padding:'10px 12px 12px' }}>
        <p style={{ margin:'0 0 2px', fontSize:13, fontWeight:800, color:'#fff' }}>{item.nome}</p>
        <p style={{ margin:'0 0 8px', fontSize:9, color:T.dim, lineHeight:1.5, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' as const }}>
          {item.descricao?.substring(0, 60) ?? item.categoria ?? '—'}
        </p>
        <div style={{ display:'flex', gap:4 }}>
          {item.categoria && <span style={{ fontSize:8, padding:'2px 6px', borderRadius:5, background:'rgba(124,58,237,0.1)', color:T.purpleL }}>{item.categoria}</span>}
          {item.subcategoria && <span style={{ fontSize:8, padding:'2px 6px', borderRadius:5, background:'rgba(255,255,255,0.05)', color:T.dim }}>{item.subcategoria}</span>}
        </div>
      </div>
    </div>
  )
}

function StyleDetail({ item }: { item: CatItem }) {
  const palette = derivePalette(item.nome)
  const specs = item.especificacoes ?? {}
  return (
    <div style={{ height:'100%', overflowY:'auto' as const, padding:16 }}>
      <div style={{ height:80, display:'flex', borderRadius:8, overflow:'hidden', marginBottom:14, border:`1px solid ${T.border}` }}>
        {palette.map((c, i) => (
          <div key={i} style={{ flex:1, background:c, position:'relative' as const }}>
            <span style={{ position:'absolute' as const, bottom:4, left:'50%', transform:'translateX(-50%)', fontSize:7, color:'rgba(255,255,255,0.6)', fontFamily:'monospace' }}>{c}</span>
          </div>
        ))}
      </div>

      <p style={{ margin:'0 0 3px', fontSize:15, fontWeight:900, color:'#fff' }}>{item.nome}</p>
      <p style={{ margin:'0 0 4px', fontSize:10, color:T.dim }}>
        {item.categoria ?? '—'}{item.subcategoria ? ` · ${item.subcategoria}` : ''}
        {item.fornecedor ? ` · ${item.fornecedor}` : ''}
      </p>

      {item.descricao && (
        <p style={{ margin:'0 0 14px', fontSize:11, color:T.text, lineHeight:1.65 }}>{item.descricao}</p>
      )}

      {Object.entries(specs).length > 0 && (
        <>
          {[
            ['ILUMINAÇÃO',    'iluminacao'],
            ['FOTOGRAFIA',    'fotografia'],
            ['ATMOSFERA',     'atmosfera'],
            ['MATERIAIS',     'materiais'],
            ['DECORAÇÃO',     'decoracao'],
            ['DESIGN INTENT', 'designIntent'],
            ['RESTRIÇÕES',    'restricoes'],
          ].map(([label, key]) => {
            const val = specs[key]
            if (!val) return null
            const arr = Array.isArray(val) ? val : [String(val)]
            return (
              <div key={key} style={{ padding:'8px 10px', borderRadius:7, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, marginBottom:8 }}>
                <p style={{ margin:'0 0 3px', fontSize:9, fontWeight:700, color:T.dim }}>{label}</p>
                <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
                  {arr.map((v, i) => <span key={i} style={{ fontSize:10, color:T.text }}>{v}{i<arr.length-1?',':''}</span>)}
                </div>
              </div>
            )
          })}
        </>
      )}

      <button style={{ width:'100%', padding:'10px', borderRadius:8, border:'none', background:T.purple, color:'#fff', cursor:'pointer', fontSize:12, fontWeight:700, marginTop:8 }}>
        🎨 Aplicar ao Projeto
      </button>
    </div>
  )
}

export function StyleHubView() {
  const [items,   setItems]   = useState<CatItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string|null>(null)
  const [query,   setQuery]   = useState('')
  const [sel,     setSel]     = useState<CatItem|null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${BASE}/arch/catalogo?limit=60`, { headers: authHeaders() })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: CatItem[] = await res.json()
      setItems(data)
      if (data.length > 0 && !sel) setSel(data[0])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar estilos')
    } finally {
      setLoading(false)
    }
  }, [sel])

  useEffect(() => { load() }, [load])

  const filtered = items.filter(item =>
    !query ||
    item.nome.toLowerCase().includes(query.toLowerCase()) ||
    (item.descricao ?? '').toLowerCase().includes(query.toLowerCase()) ||
    (item.categoria ?? '').toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const }}>
      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', gap:8 }}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar estilo…"
          style={{ flex:1, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, padding:'5px 10px', outline:'none' }}/>
        <button onClick={load} style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, cursor:'pointer', fontSize:10 }}>↻</button>
        <span style={{ fontSize:10, color:T.dim, alignSelf:'center' }}>{filtered.length} item(s)</span>
      </div>

      {error && <div style={{ padding:'8px 16px', background:'rgba(248,113,113,0.08)', borderBottom:`1px solid rgba(248,113,113,0.2)`, fontSize:11, color:'#f87171', flexShrink:0 }}>⚠ {error}</div>}

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <div style={{ flex:1, overflowY:'auto' as const, padding:16 }}>
          {loading && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
              {[1,2,3,4].map(i=><div key={i} style={{ height:120, borderRadius:10, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, animation:'pulse 1.5s infinite' }}/>)}
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign:'center' as const, padding:60, color:T.dim, fontSize:12 }}>
              <p style={{ margin:'0 0 8px', fontSize:28 }}>🎨</p>
              <p>Nenhum estilo disponível. Adicione itens ao catálogo via Biblioteca.</p>
            </div>
          )}
          {!loading && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
              {filtered.map(item=><StyleCard key={item.id} item={item} selected={sel?.id===item.id} onSelect={()=>setSel(item)}/>)}
            </div>
          )}
        </div>
        {sel && <div style={{ width:300, flexShrink:0, borderLeft:`1px solid ${T.border}` }}><StyleDetail item={sel}/></div>}
      </div>
    </div>
  )
}
