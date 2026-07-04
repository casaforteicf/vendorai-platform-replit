// ─── Biblioteca Showroom — Sprint 3 Experience 1.0 ────────────────────────────
// Visual showroom: materiais como amostras, estilos como mood boards.
// Hover, glow, shimmer. Nenhuma funcionalidade nova.

import { useState, useEffect, useCallback } from 'react'
import { ComponentsPanel } from './ComponentsPanel'
import { T } from '../../shared/arqdor-theme'

const BASE = '/api'
function authHeaders(): Record<string, string> {
  const tok = localStorage.getItem('vendorai_token')
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

interface CatalogoItem {
  id:             string
  nome:           string
  descricao:      string | null
  categoria:      string | null
  subcategoria:   string | null
  fornecedor:     string | null
  precoBase:      string | null
  imagens:        string[] | null
  especificacoes: Record<string, unknown> | null
  ativo:          boolean
  createdAt:      string
}

const STYLES = [
  { id:'s1', name:'Contemporâneo', desc:'Linhas limpas, tons neutros',    palette:['#E8E0D5','#C8A87A','#2D2D2D'] },
  { id:'s2', name:'Minimalista',   desc:'Menos é mais, espaço amplo',     palette:['#FFFFFF','#F0F0F0','#1A1A1A'] },
  { id:'s3', name:'Japandi',       desc:'Wabi-sabi + escandinavismo',      palette:['#E8DDD0','#8B7355','#4A4A4A'] },
  { id:'s4', name:'Industrial',    desc:'Concreto, aço e madeira crua',    palette:['#6B6B6B','#3D2B1F','#C0C0C0'] },
  { id:'s5', name:'Escandinavo',   desc:'Funcional, claro e aconchegante', palette:['#FAFAFA','#D4C5B5','#5B7B7A'] },
  { id:'s6', name:'Boho',          desc:'Textura, cor e natureza',         palette:['#D4A76A','#8B5A2B','#6B8E6B'] },
  { id:'s7', name:'Luxo',          desc:'Materiais nobres, sofisticação',  palette:['#1A1A2E','#C9A227','#E8E0D5'] },
  { id:'s8', name:'Clássico',      desc:'Ornamentação e elegância atemporal', palette:['#F5E6D3','#8B6914','#2C1810'] },
]

// ─── Swatch color derivado da categoria ───────────────────────────────────────
function swatchGradient(cat: string | null): string {
  if (!cat) return 'linear-gradient(135deg, #2d2d4e 0%, #1a1a2e 100%)'
  const map: Record<string, string> = {
    piso:      'linear-gradient(135deg, #6B5A3A 0%, #3D3020 100%)',
    parede:    'linear-gradient(135deg, #4A6B5A 0%, #2A3D35 100%)',
    teto:      'linear-gradient(135deg, #5A6B7A 0%, #2D3740 100%)',
    madeira:   'linear-gradient(135deg, #7A5A2A 0%, #3D2D10 100%)',
    metal:     'linear-gradient(135deg, #6A7A8A 0%, #3A4455 100%)',
    pedra:     'linear-gradient(135deg, #6A6A6A 0%, #3A3A3A 100%)',
    tecido:    'linear-gradient(135deg, #7A5A6A 0%, #4A3040 100%)',
    iluminação:'linear-gradient(135deg, #8A7A3A 0%, #4A4010 100%)',
    vidro:     'linear-gradient(135deg, #3A6A8A 0%, #1A3A5A 100%)',
    cerâmica:  'linear-gradient(135deg, #8A7A6A 0%, #5A4A3A 100%)',
  }
  const key = Object.keys(map).find(k => cat.toLowerCase().includes(k))
  return key ? map[key] : 'linear-gradient(135deg, #4a3d7a 0%, #2d2050 100%)'
}

// ─── CSS keyframes (injetado uma vez) ─────────────────────────────────────────
const CSS = `
  @keyframes arq-shimmer {
    0%   { background-position: -600px 0; }
    100% { background-position: 600px 0; }
  }
  @keyframes arq-fadeIn {
    from { opacity:0; transform:translateY(8px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes arq-scaleIn {
    from { opacity:0; transform:scale(0.97); }
    to   { opacity:1; transform:scale(1); }
  }
  .arq-card {
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease !important;
    animation: arq-scaleIn 0.3s ease both;
  }
  .arq-card:hover {
    transform: translateY(-2px) scale(1.01) !important;
    border-color: rgba(167,139,250,0.35) !important;
    box-shadow: 0 8px 30px rgba(124,58,237,0.18) !important;
  }
  .arq-style-card {
    transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease !important;
    animation: arq-scaleIn 0.35s ease both;
  }
  .arq-style-card:hover {
    transform: translateY(-3px) !important;
    box-shadow: 0 12px 40px rgba(124,58,237,0.2) !important;
    border-color: rgba(167,139,250,0.5) !important;
  }
  .arq-shimmer {
    background: linear-gradient(90deg,
      rgba(255,255,255,0.04) 0px,
      rgba(255,255,255,0.09) 80px,
      rgba(255,255,255,0.04) 160px);
    background-size: 600px 100%;
    animation: arq-shimmer 1.5s ease infinite;
  }
  .arq-pill-btn {
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease !important;
  }
  .arq-pill-btn:hover {
    background: rgba(124,58,237,0.12) !important;
    border-color: rgba(167,139,250,0.4) !important;
    color: #c4b5fd !important;
  }
`

// ─── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{
      borderRadius: 12, overflow: 'hidden',
      background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}`,
    }}>
      <div className="arq-shimmer" style={{ height: 120 }}/>
      <div style={{ padding: '12px' }}>
        <div className="arq-shimmer" style={{ height: 12, borderRadius: 6, marginBottom: 6 }}/>
        <div className="arq-shimmer" style={{ height: 10, borderRadius: 6, width: '60%' }}/>
      </div>
    </div>
  )
}

// ─── Material Card ─────────────────────────────────────────────────────────────
function MaterialCard({ item }: { item: CatalogoItem }) {
  const img = item.imagens?.[0]

  return (
    <div
      className="arq-card"
      style={{
        borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${T.border}`,
      }}
    >
      {/* Image / Swatch */}
      <div style={{ position: 'relative', height: 120 }}>
        {img ? (
          <img
            src={img}
            alt={item.nome}
            style={{ width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: swatchGradient(item.categoria),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 28, opacity: 0.6 }}>📦</span>
          </div>
        )}
        {/* Category overlay badge */}
        {item.categoria && (
          <div style={{
            position: 'absolute', top: 8, left: 8,
            padding: '2px 8px', borderRadius: 20,
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
            fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.85)',
            letterSpacing: '0.04em',
          }}>
            {item.categoria.toUpperCase()}
          </div>
        )}
        {/* Price badge */}
        {item.precoBase && (
          <div style={{
            position: 'absolute', bottom: 8, right: 8,
            padding: '2px 8px', borderRadius: 20,
            background: 'rgba(124,58,237,0.75)', backdropFilter: 'blur(4px)',
            fontSize: 9, fontWeight: 700, color: '#fff',
          }}>
            R$ {Number(item.precoBase).toFixed(0)}
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '10px 12px' }}>
        <p style={{ margin: '0 0 3px', fontSize: 12, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>
          {item.nome}
        </p>
        {item.fornecedor && (
          <p style={{ margin: '0 0 4px', fontSize: 10, color: T.purpleL, fontWeight: 600 }}>
            {item.fornecedor}
          </p>
        )}
        {item.descricao && (
          <p style={{ margin: 0, fontSize: 9, color: T.dim, lineHeight: 1.4,
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
          }}>
            {item.descricao}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Style Card ───────────────────────────────────────────────────────────────
function StyleCard({ s, index }: { s: typeof STYLES[0]; index: number }) {
  return (
    <div
      className="arq-style-card"
      style={{
        borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${T.border}`,
        animationDelay: `${index * 0.04}s`,
      }}
    >
      {/* Large palette bar */}
      <div style={{ display: 'flex', height: 90 }}>
        {s.palette.map((c, i) => (
          <div key={i} style={{ flex: 1, background: c, position: 'relative' }}>
            {i === 0 && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to right, rgba(0,0,0,0.2), transparent)',
              }}/>
            )}
          </div>
        ))}
      </div>

      <div style={{ padding: '12px 14px' }}>
        <p style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 800, color: '#fff' }}>{s.name}</p>
        <p style={{ margin: '0 0 10px', fontSize: 10, color: T.textSub, lineHeight: 1.4 }}>{s.desc}</p>
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {s.palette.map((c, i) => (
            <div key={i} title={c} style={{
              width: 18, height: 18, borderRadius: '50%', background: c,
              border: `2px solid rgba(255,255,255,0.1)`, flexShrink: 0,
            }}/>
          ))}
        </div>
        <button style={{
          width: '100%', padding: '6px', borderRadius: 7, border: `1px solid rgba(124,58,237,0.3)`,
          background: 'rgba(124,58,237,0.08)', color: T.purpleL, cursor: 'pointer',
          fontSize: 10, fontWeight: 700, transition: 'all 0.15s',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,58,237,0.2)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,58,237,0.08)' }}
        >
          ✦ Aplicar ao Projeto
        </button>
      </div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyShowroom({ onAdd }: { onAdd: () => void }) {
  const steps = [
    { icon: '📦', title: 'Adicione materiais', desc: 'Pisos, paredes, mobiliário' },
    { icon: '🏭', title: 'Informe o fornecedor', desc: 'Para orçamento preciso' },
    { icon: '🎬', title: 'Gere renders', desc: 'Com os materiais do showroom' },
  ]
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 40px', gap: 28,
      animation: 'arq-fadeIn 0.5s ease',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
        <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 900, color: '#fff' }}>
          Showroom vazio
        </h3>
        <p style={{ margin: 0, fontSize: 12, color: T.textSub, maxWidth: 280, lineHeight: 1.5 }}>
          Adicione materiais e referências ao seu showroom pessoal de arquitetura.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        {steps.map((s, i) => (
          <div key={s.title} style={{
            padding: '16px', borderRadius: 12, textAlign: 'center',
            background: 'rgba(124,58,237,0.06)', border: `1px solid rgba(124,58,237,0.15)`,
            minWidth: 120,
          }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>{s.icon}</div>
            <div style={{
              width: 18, height: 18, borderRadius: '50%', background: T.purple,
              color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex',
              alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px',
            }}>{i + 1}</div>
            <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: 700, color: '#fff' }}>{s.title}</p>
            <p style={{ margin: 0, fontSize: 9, color: T.dim }}>{s.desc}</p>
          </div>
        ))}
      </div>

      <button
        onClick={onAdd}
        style={{
          padding: '12px 32px', borderRadius: 10, border: 'none', cursor: 'pointer',
          background: `linear-gradient(135deg, ${T.purple} 0%, #5b21b6 100%)`,
          color: '#fff', fontSize: 13, fontWeight: 800,
          boxShadow: '0 4px 20px rgba(124,58,237,0.4)',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
          ;(e.currentTarget as HTMLElement).style.boxShadow = '0 6px 28px rgba(124,58,237,0.5)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
          ;(e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(124,58,237,0.4)'
        }}
      >
        + Adicionar ao Showroom
      </button>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export function LibraryModule() {
  const [tab,     setTab]     = useState<'materiais'|'estilos'|'componentes'>('materiais')
  const [items,   setItems]   = useState<CatalogoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string|null>(null)
  const [q,       setQ]       = useState('')
  const [catFilt, setCatFilt] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [adding,  setAdding]  = useState(false)
  const [form,    setForm]    = useState({ nome:'', categoria:'', fornecedor:'', descricao:'' })

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

  const filteredStyles = STYLES.filter(s => !q || s.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const, background:T.bg }}>
      <style>{CSS}</style>

      {/* ── Showroom Header ── */}
      <div style={{
        padding: '14px 20px 0', flexShrink: 0,
        background: 'linear-gradient(180deg, rgba(124,58,237,0.06) 0%, transparent 100%)',
        borderBottom: `1px solid ${T.border}`,
      }}>
        {/* Title row */}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
          <div>
            <h2 style={{ margin:0, fontSize:16, fontWeight:900, color:'#fff', letterSpacing:'-0.02em' }}>
              ✦ SHOWROOM
            </h2>
            <p style={{ margin:0, fontSize:10, color:T.dim }}>Materiais, estilos e componentes</p>
          </div>
          <div style={{ flex:1 }}/>
          {/* Search */}
          {(tab === 'materiais' || tab === 'estilos') && (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position:'absolute', left:9, fontSize:11, color:T.dim, pointerEvents:'none' }}>🔍</span>
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Buscar…"
                style={{
                  background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`,
                  borderRadius: 8, color: T.text, fontSize: 11, padding: '6px 10px 6px 26px',
                  outline: 'none', width: 160, transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = T.purple}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = T.border}
              />
            </div>
          )}
          {tab === 'materiais' && (
            <button
              onClick={() => setShowAdd(v => !v)}
              style={{
                padding: '6px 14px', borderRadius: 8, border: 'none',
                background: showAdd ? 'rgba(124,58,237,0.3)' : T.purple,
                color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                transition: 'background 0.15s',
              }}
            >
              {showAdd ? '✕ Fechar' : '+ Adicionar'}
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:2 }}>
          {(['materiais','estilos','componentes'] as const).map(t => {
            const icons: Record<string, string> = { materiais:'📦', estilos:'🎨', componentes:'🧩' }
            const labels: Record<string, string> = { materiais:'Materiais', estilos:'Estilos', componentes:'Componentes' }
            const badge = t === 'materiais' ? items.length : t === 'estilos' ? STYLES.length : 0
            const active = tab === t
            return (
              <button
                key={t}
                onClick={() => { setTab(t); setQ('') }}
                style={{
                  padding: '8px 16px', borderRadius: '8px 8px 0 0', border: 'none',
                  cursor: 'pointer', fontSize: 11, fontWeight: 700,
                  background: active ? 'rgba(124,58,237,0.18)' : 'transparent',
                  color: active ? T.purpleL : T.dim,
                  borderBottom: `2px solid ${active ? T.purple : 'transparent'}`,
                  transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <span>{icons[t]}</span>
                {labels[t]}
                {badge > 0 && (
                  <span style={{
                    padding: '1px 6px', borderRadius: 10, fontSize: 9,
                    background: active ? T.purple : 'rgba(255,255,255,0.08)',
                    color: active ? '#fff' : T.dim, fontWeight: 700,
                  }}>{badge}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Category filter pills */}
      {tab === 'materiais' && categories.length > 0 && (
        <div style={{
          display:'flex', gap:6, padding:'10px 20px', overflowX:'auto' as const,
          borderBottom:`1px solid ${T.border}`, flexShrink:0,
          scrollbarWidth:'none' as const,
        }}>
          {['Todos', ...categories].map(c => {
            const isAll  = c === 'Todos'
            const active = isAll ? !catFilt : catFilt === c
            return (
              <button
                key={c}
                className="arq-pill-btn"
                onClick={() => setCatFilt(isAll ? '' : catFilt === c ? '' : c)}
                style={{
                  padding: '4px 12px', borderRadius: 20, border: `1px solid ${active ? T.purple : T.border}`,
                  background: active ? 'rgba(124,58,237,0.18)' : 'transparent',
                  color: active ? T.purpleL : T.dim,
                  fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const,
                  flexShrink: 0,
                }}
              >
                {c}
              </button>
            )
          })}
        </div>
      )}

      {/* Add form */}
      {showAdd && tab === 'materiais' && (
        <div style={{
          padding:'14px 20px', borderBottom:`1px solid ${T.border}`,
          background:'rgba(124,58,237,0.04)', flexShrink:0,
          animation:'arq-fadeIn 0.25s ease',
        }}>
          <p style={{ margin:'0 0 10px', fontSize:11, fontWeight:700, color:T.purpleL }}>
            ✦ Novo item no showroom
          </p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8 }}>
            {(['nome','categoria','fornecedor'] as const).map(field => (
              <input
                key={field}
                value={form[field]}
                onChange={e => setForm(f => ({...f, [field]:e.target.value}))}
                placeholder={field.charAt(0).toUpperCase() + field.slice(1) + '…'}
                style={{
                  background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`,
                  borderRadius:8, color:T.text, fontSize:11, padding:'7px 10px', outline:'none',
                  transition:'border-color 0.15s',
                }}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = T.purple}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = T.border}
              />
            ))}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <input
              value={form.descricao}
              onChange={e => setForm(f => ({...f, descricao:e.target.value}))}
              placeholder="Descrição…"
              style={{
                flex:1, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`,
                borderRadius:8, color:T.text, fontSize:11, padding:'7px 10px', outline:'none',
              }}
            />
            <button
              onClick={handleAdd}
              disabled={adding || !form.nome.trim()}
              style={{
                padding:'7px 18px', borderRadius:8, border:'none', background:T.purple,
                color:'#fff', cursor:'pointer', fontSize:11, fontWeight:700,
                opacity: adding || !form.nome.trim() ? 0.5 : 1, transition:'opacity 0.15s',
              }}
            >
              {adding ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              style={{
                padding:'7px 14px', borderRadius:8, border:`1px solid ${T.border}`,
                background:'transparent', color:T.dim, cursor:'pointer', fontSize:11,
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding:'8px 20px', background:'rgba(248,113,113,0.07)', borderBottom:`1px solid rgba(248,113,113,0.18)`,
          fontSize:11, color:'#f87171', flexShrink:0, display:'flex', alignItems:'center', gap:8,
        }}>
          <span>⚠</span> {error}
          <button onClick={load} style={{ background:'none', border:'none', color:'#f87171', cursor:'pointer', textDecoration:'underline', fontSize:11 }}>
            Tentar novamente
          </button>
        </div>
      )}

      {/* ── Content ── */}
      <div style={{ flex:1, overflowY:'auto' as const, padding:'16px 20px' }}>

        {/* Materiais */}
        {tab === 'materiais' && (
          <>
            {loading && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
                {[1,2,3,4,5,6].map(i => <SkeletonCard key={i}/>)}
              </div>
            )}
            {!loading && items.length === 0 && !error && (
              <EmptyShowroom onAdd={() => setShowAdd(true)} />
            )}
            {!loading && items.length > 0 && (
              <>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
                  {items.map((item, i) => (
                    <div key={item.id} style={{ animationDelay: `${i * 0.03}s` }}>
                      <MaterialCard item={item} />
                    </div>
                  ))}
                </div>
                <p style={{ marginTop:16, fontSize:10, color:T.dim, textAlign:'center' as const }}>
                  {items.length} item(s) no showroom
                </p>
              </>
            )}
          </>
        )}

        {/* Estilos */}
        {tab === 'estilos' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:14 }}>
            {filteredStyles.map((s, i) => <StyleCard key={s.id} s={s} index={i}/>)}
          </div>
        )}

        {/* Componentes */}
        {tab === 'componentes' && (
          <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column' as const }}>
            <ComponentsPanel/>
          </div>
        )}
      </div>
    </div>
  )
}
