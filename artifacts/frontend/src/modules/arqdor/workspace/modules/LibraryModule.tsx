import { useState, useEffect, useCallback } from 'react'
import { ComponentsPanel } from './ComponentsPanel'
import { T } from '../../shared/arqdor-theme'

const BASE = '/api'
function authHeaders(): Record<string, string> {
  const tok = localStorage.getItem('vendorai_token')
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

interface CatalogoItem {
  id:            string
  nome:          string
  descricao:     string | null
  categoria:     string | null
  subcategoria:  string | null
  fornecedor:    string | null
  precoBase:     string | null
  imagens:       string[] | null
  especificacoes: Record<string, unknown> | null
  ativo:         boolean
  createdAt:     string
}

const STYLES = [
  { id:'s1', name:'Contemporâneo', palette:['#E8E0D5','#C8A87A','#2D2D2D'] },
  { id:'s2', name:'Minimalista',   palette:['#FFFFFF','#F0F0F0','#1A1A1A'] },
  { id:'s3', name:'Japandi',       palette:['#E8DDD0','#8B7355','#4A4A4A'] },
  { id:'s4', name:'Industrial',    palette:['#6B6B6B','#3D2B1F','#C0C0C0'] },
  { id:'s5', name:'Escandinavo',   palette:['#FAFAFA','#D4C5B5','#5B7B7A'] },
  { id:'s6', name:'Boho',          palette:['#D4A76A','#8B5A2B','#6B8E6B'] },
  { id:'s7', name:'Luxo',          palette:['#1A1A2E','#C9A227','#E8E0D5'] },
  { id:'s8', name:'Clássico',      palette:['#F5E6D3','#8B6914','#2C1810'] },
]

export function LibraryModule() {
  const [tab, setTab] = useState<'materiais'|'estilos'|'componentes'>('materiais')
  const [items,   setItems]   = useState<CatalogoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string|null>(null)
  const [q, setQ]             = useState('')
  const [catFilt, setCatFilt] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [adding,  setAdding]  = useState(false)
  const [form, setForm]       = useState({ nome:'', categoria:'', fornecedor:'', descricao:'' })

  const load = useCallback(async () => {
    if (tab !== 'materiais') return
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ limit: '60' })
      if (catFilt) params.set('categoria', catFilt)
      if (q)       params.set('busca', q)
      const res = await fetch(`${BASE}/arch/catalogo?${params}`, { headers: authHeaders() })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setItems(await res.json())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar catálogo')
    } finally {
      setLoading(false)
    }
  }, [tab, catFilt, q])

  useEffect(() => { load() }, [load])

  const categories = [...new Set(items.map(i => i.categoria).filter(Boolean))] as string[]

  const handleAdd = async () => {
    if (!form.nome.trim()) return
    setAdding(true)
    try {
      const res = await fetch(`${BASE}/arch/catalogo`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setForm({ nome:'', categoria:'', fornecedor:'', descricao:'' })
      setShowAdd(false)
      load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao adicionar item')
    } finally {
      setAdding(false)
    }
  }

  const card = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 8 } as const

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const, background:T.bg }}>
      {/* Header */}
      <div style={{ padding:'14px 20px 0', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        <h2 style={{ margin:'0 0 12px', fontSize:16, fontWeight:800, color:'#fff' }}>📚 Biblioteca</h2>
        <div style={{ display:'flex', gap:4, marginBottom:12 }}>
          {(['materiais','estilos','componentes'] as const).map(t => (
            <button key={t} onClick={()=>{ setTab(t); setQ('') }} style={{
              padding:'5px 14px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, textTransform:'capitalize' as const,
              background: tab===t ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.05)',
              color: tab===t ? T.purpleL : T.dim,
            }}>{t==='componentes' ? '🧩 Componentes' : t}</button>
          ))}
          <div style={{ flex:1 }}/>
          {tab==='materiais' && (
            <>
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar…"
                style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6,
                  color:T.text, fontSize:12, padding:'5px 10px', outline:'none', width:160 }}/>
              <button onClick={()=>setShowAdd(v=>!v)} style={{ padding:'5px 12px', borderRadius:6, border:'none', background:T.purple, color:'#fff', cursor:'pointer', fontSize:11, fontWeight:700, whiteSpace:'nowrap' as const }}>
                + Adicionar
              </button>
            </>
          )}
          {tab==='estilos' && (
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar…"
              style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6,
                color:T.text, fontSize:12, padding:'5px 10px', outline:'none', width:160 }}/>
          )}
        </div>

        {/* Category filter */}
        {tab==='materiais' && categories.length > 0 && (
          <div style={{ display:'flex', gap:4, paddingBottom:10, overflowX:'auto' as const }}>
            <button onClick={()=>setCatFilt('')} style={{ padding:'3px 10px', borderRadius:12, border:`1px solid ${!catFilt?T.purple:T.border}`, background:!catFilt?'rgba(124,58,237,0.15)':'transparent', color:!catFilt?T.purpleL:T.dim, fontSize:11, cursor:'pointer', whiteSpace:'nowrap' as const }}>Todos</button>
            {categories.map(c => (
              <button key={c} onClick={()=>setCatFilt(catFilt===c?'':c)} style={{
                padding:'3px 10px', borderRadius:12, border:`1px solid ${catFilt===c?T.purple:T.border}`,
                background:catFilt===c?'rgba(124,58,237,0.15)':'transparent',
                color:catFilt===c?T.purpleL:T.dim, fontSize:11, cursor:'pointer', whiteSpace:'nowrap' as const,
              }}>{c}</button>
            ))}
          </div>
        )}
      </div>

      {/* Add form */}
      {showAdd && tab==='materiais' && (
        <div style={{ padding:'14px 20px', borderBottom:`1px solid ${T.border}`, background:'rgba(124,58,237,0.05)', flexShrink:0 }}>
          <p style={{ margin:'0 0 10px', fontSize:11, fontWeight:700, color:T.purpleL }}>Novo item no catálogo</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8 }}>
            {(['nome','categoria','fornecedor'] as const).map(field => (
              <input key={field} value={form[field]} onChange={e=>setForm(f=>({...f,[field]:e.target.value}))}
                placeholder={field.charAt(0).toUpperCase()+field.slice(1)+'…'}
                style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, padding:'6px 10px', outline:'none' }}/>
            ))}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <input value={form.descricao} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))}
              placeholder="Descrição…"
              style={{ flex:1, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, padding:'6px 10px', outline:'none' }}/>
            <button onClick={handleAdd} disabled={adding||!form.nome.trim()} style={{ padding:'6px 14px', borderRadius:6, border:'none', background:T.purple, color:'#fff', cursor:'pointer', fontSize:11, fontWeight:700 }}>
              {adding?'Salvando…':'Salvar'}
            </button>
            <button onClick={()=>setShowAdd(false)} style={{ padding:'6px 12px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, cursor:'pointer', fontSize:11 }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding:'8px 20px', background:'rgba(248,113,113,0.08)', borderBottom:`1px solid rgba(248,113,113,0.2)`, fontSize:11, color:'#f87171', flexShrink:0 }}>
          ⚠ {error} — <button onClick={load} style={{ background:'none', border:'none', color:'#f87171', cursor:'pointer', textDecoration:'underline', fontSize:11 }}>Tentar novamente</button>
        </div>
      )}

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto' as const, padding:'16px 20px' }}>

        {/* Materiais */}
        {tab==='materiais' && (
          <>
            {loading && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:12 }}>
                {[1,2,3,4,5,6].map(i=>(
                  <div key={i} style={{ ...card, height:110, animation:'pulse 1.5s infinite' }}/>
                ))}
              </div>
            )}
            {!loading && items.length === 0 && !error && (
              <div style={{ textAlign:'center' as const, padding:60, color:T.dim, fontSize:13 }}>
                <p style={{ margin:'0 0 8px', fontSize:32 }}>📦</p>
                <p style={{ margin:'0 0 4px', fontWeight:700, color:T.text }}>Catálogo vazio</p>
                <p style={{ margin:0 }}>Adicione materiais, componentes e referências ao seu catálogo pessoal.</p>
              </div>
            )}
            {!loading && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:12 }}>
                {items.map(item => {
                  const img = item.imagens?.[0]
                  return (
                    <div key={item.id} style={{ ...card, padding:'12px', cursor:'pointer' }}>
                      {img ? (
                        <img src={img} alt={item.nome} style={{ width:'100%', height:64, objectFit:'cover' as const, borderRadius:6, marginBottom:8 }}/>
                      ) : (
                        <div style={{ height:64, borderRadius:6, background:'rgba(124,58,237,0.08)', border:`1px solid rgba(124,58,237,0.15)`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:8 }}>
                          <span style={{ fontSize:22 }}>📦</span>
                        </div>
                      )}
                      <p style={{ margin:'0 0 2px', fontSize:12, fontWeight:700, color:'#fff', lineHeight:1.3 }}>{item.nome}</p>
                      <p style={{ margin:'0 0 6px', fontSize:10, color:T.dim }}>{item.categoria ?? '—'}</p>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:T.dim }}>
                        <span>{item.fornecedor ?? '—'}</span>
                        {item.precoBase && <span style={{ color:T.purpleL }}>R$ {Number(item.precoBase).toFixed(2)}</span>}
                      </div>
                    </div>
                  )
                })}
                {!loading && items.length > 0 && <p style={{ gridColumn:'1/-1', fontSize:10, color:T.dim, textAlign:'center' as const }}>
                  {items.length} item(s) encontrado(s)
                </p>}
              </div>
            )}
          </>
        )}

        {/* Estilos */}
        {tab==='estilos' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
            {STYLES.filter(s => !q || s.name.toLowerCase().includes(q.toLowerCase())).map(s => (
              <div key={s.id} style={{ ...card, padding:'14px', cursor:'pointer' }}>
                <div style={{ display:'flex', gap:4, marginBottom:10 }}>
                  {s.palette.map((c,i) => <div key={i} style={{ flex:1, height:28, borderRadius:4, background:c }}/>)}
                </div>
                <p style={{ margin:0, fontSize:13, fontWeight:700, color:'#fff' }}>{s.name}</p>
                <p style={{ margin:'4px 0 0', fontSize:10, color:T.dim }}>Clique para aplicar ao projeto</p>
              </div>
            ))}
          </div>
        )}

        {/* Componentes */}
        {tab==='componentes' && (
          <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column' as const }}>
            <ComponentsPanel/>
          </div>
        )}
      </div>
    </div>
  )
}
