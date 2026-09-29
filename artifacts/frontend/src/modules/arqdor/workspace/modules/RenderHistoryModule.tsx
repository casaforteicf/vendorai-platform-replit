// ─── Render Gallery — Sprint 3 Experience 1.0 ─────────────────────────────────
// Cinema-style gallery: filmstrip esquerda, viewer central imersivo.
// Shimmer loading, hover overlays, auto-refresh. Nenhuma funcionalidade nova.

import { useState, useEffect, useCallback, useRef } from 'react'
import { T } from '../../shared/arqdor-theme'

const BASE = '/api'
function authHeaders(): Record<string, string> {
  const tok = localStorage.getItem('vendorai_token')
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

interface GalleryRender {
  id:        string
  imageUrl:  string | null
  versao:    number | null
  origem:    string | null
  createdAt: string
  cenaId:    string
  cenaNome:  string | null
  projetoId: string
}

const MODELS: Record<string, { color: string; label: string; icon: string }> = {
  'openai':       { color: '#4ade80', label: 'Render Premium', icon: '✨' },
  'gpt-image':    { color: '#4ade80', label: 'Render Premium', icon: '✨' },
  'blender':      { color: '#fb923c', label: 'Blender',        icon: '🔶' },
}
function modelMeta(origem: string | null) {
  if (!origem) return { color: T.dim, label: 'Render', icon: '🎬' }
  const normalized = origem.toLowerCase()
  if (normalized.includes('flux') || normalized.includes('replicate') || normalized.includes('kontext')) {
    return { color: T.dim, label: 'Render legado', icon: '🕘' }
  }
  const key = Object.keys(MODELS).find(k => normalized.includes(k))
  return key ? MODELS[key] : { color: T.dim, label: 'Render', icon: '🎬' }
}
function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
}
function fmtRelative(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)    return 'agora mesmo'
  if (diff < 3600)  return `há ${Math.round(diff / 60)}min`
  if (diff < 86400) return `há ${Math.round(diff / 3600)}h`
  return `há ${Math.round(diff / 86400)}d`
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  @keyframes rg-shimmer {
    0%   { background-position: -600px 0; }
    100% { background-position: 600px 0; }
  }
  @keyframes rg-fadeIn {
    from { opacity:0; transform:translateY(6px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes rg-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes rg-pulse {
    0%,100% { opacity:1; }
    50% { opacity:0.45; }
  }
  .rg-card {
    transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease !important;
    position: relative;
  }
  .rg-card:hover { transform: translateX(2px) !important; border-color: rgba(167,139,250,0.4) !important; }
  .rg-card .rg-overlay { opacity:0; transition: opacity 0.2s ease; }
  .rg-card:hover .rg-overlay { opacity:1; }
  .rg-shimmer {
    background: linear-gradient(90deg,
      rgba(255,255,255,0.04) 0px,
      rgba(255,255,255,0.09) 80px,
      rgba(255,255,255,0.04) 160px);
    background-size: 600px 100%;
    animation: rg-shimmer 1.5s ease infinite;
  }
  .rg-btn {
    transition: background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease !important;
  }
  .rg-btn:hover {
    transform: translateY(-1px) !important;
    box-shadow: 0 4px 16px rgba(124,58,237,0.3) !important;
  }
`

// ─── Skeleton strip ────────────────────────────────────────────────────────────
function SkeletonStrip() {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8, padding:12 }}>
      {[150,120,160,130,110].map((h, i) => (
        <div key={i} style={{ borderRadius:10, overflow:'hidden', flexShrink:0 }}>
          <div className="rg-shimmer" style={{ height:h }}/>
          <div style={{ padding:'8px 10px', background:'rgba(255,255,255,0.03)', borderBottom:`1px solid ${T.border}` }}>
            <div className="rg-shimmer" style={{ height:10, borderRadius:5, marginBottom:4 }}/>
            <div className="rg-shimmer" style={{ height:8, borderRadius:5, width:'60%' }}/>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Empty state ───────────────────────────────────────────────────────────────
function EmptyGallery() {
  return (
    <div style={{
      flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      padding:'40px 24px', gap:20, animation:'rg-fadeIn 0.5s ease',
    }}>
      {/* Mock filmstrip */}
      <div style={{ display:'flex', gap:6, opacity:0.25, marginBottom:8 }}>
        {[70,90,75,85,70].map((h, i) => (
          <div key={i} style={{
            width:52, height:h, borderRadius:6,
            background:`linear-gradient(135deg, rgba(124,58,237,0.3), rgba(96,165,250,0.2))`,
            border:`1px solid ${T.border}`,
          }}/>
        ))}
      </div>

      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:44, marginBottom:10 }}>🎨</div>
        <h3 style={{ margin:'0 0 6px', fontSize:18, fontWeight:900, color:'#fff' }}>
          Nenhum render ainda
        </h3>
        <p style={{ margin:'0 0 4px', fontSize:12, color:T.textSub, lineHeight:1.6 }}>
          Gere renders fotorrealistas usando o<br/>Prompt Engine + modelos de IA
        </p>
      </div>

      <a
        href={`${import.meta.env.BASE_URL}arch/render`}
        style={{
          display:'inline-block', padding:'12px 28px', borderRadius:10,
          background:`linear-gradient(135deg, ${T.purple} 0%, #5b21b6 100%)`,
          color:'#fff', textDecoration:'none', fontSize:13, fontWeight:800,
          boxShadow:'0 6px 24px rgba(124,58,237,0.4)',
          transition:'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
          ;(e.currentTarget as HTMLElement).style.boxShadow = '0 10px 32px rgba(124,58,237,0.5)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
          ;(e.currentTarget as HTMLElement).style.boxShadow = '0 6px 24px rgba(124,58,237,0.4)'
        }}
      >
        ✨ Gerar Primeiro Render
      </a>

      <div style={{ display:'flex', gap:12, marginTop:4 }}>
        {[
          { icon:'✨', label:'Render Premium', desc:'Alta qualidade fotorealista' },
          { icon:'🔒', label:'Preservação', desc:'Projeto e câmera preservados' },
          { icon:'🤖', label:'OpenAI', desc:'Criativo e rápido' },
        ].map(m => (
          <div key={m.label} style={{
            padding:'8px 12px', borderRadius:8, textAlign:'center',
            background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`,
          }}>
            <div style={{ fontSize:16, marginBottom:3 }}>{m.icon}</div>
            <p style={{ margin:'0 0 1px', fontSize:10, fontWeight:700, color:'#fff' }}>{m.label}</p>
            <p style={{ margin:0, fontSize:9, color:T.dim }}>{m.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Filmstrip card ────────────────────────────────────────────────────────────
function FilmCard({
  r, selected, onClick,
}: {
  r: GalleryRender; selected: boolean; onClick: () => void
}) {
  const meta = modelMeta(r.origem)
  return (
    <div
      className="rg-card"
      onClick={onClick}
      style={{
        borderRadius:10, overflow:'hidden', cursor:'pointer', marginBottom:8,
        border:`1px solid ${selected ? `${meta.color}55` : T.border}`,
        background: selected ? `${meta.color}0d` : 'rgba(255,255,255,0.025)',
        boxShadow: selected ? `0 0 20px ${meta.color}22` : 'none',
        flexShrink:0,
      }}
    >
      {/* Thumbnail */}
      <div style={{ position:'relative', height:130 }}>
        {r.imageUrl ? (
          <img
            src={r.imageUrl}
            alt={r.cenaNome ?? 'Render'}
            style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div style={{
            height:'100%', background:`linear-gradient(135deg, rgba(124,58,237,0.12), rgba(96,165,250,0.08))`,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <span style={{ fontSize:24, opacity:0.5 }}>🎨</span>
          </div>
        )}

        {/* Hover overlay */}
        <div className="rg-overlay" style={{
          position:'absolute', inset:0, background:'rgba(0,0,0,0.55)',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <div style={{
            padding:'4px 10px', borderRadius:20, background:'rgba(124,58,237,0.85)',
            fontSize:9, fontWeight:700, color:'#fff',
          }}>
            Ver render
          </div>
        </div>

        {/* Model badge */}
        <div style={{
          position:'absolute', top:6, right:6,
          padding:'2px 7px', borderRadius:20,
          background:`${meta.color}22`, backdropFilter:'blur(4px)',
          border:`1px solid ${meta.color}44`,
          fontSize:9, fontWeight:700, color:meta.color,
        }}>
          {meta.icon} {meta.label}
        </div>

        {/* Version badge */}
        {r.versao != null && (
          <div style={{
            position:'absolute', bottom:6, left:6,
            padding:'1px 6px', borderRadius:20,
            background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)',
            fontSize:8, fontWeight:700, color:'rgba(255,255,255,0.7)',
          }}>
            V{r.versao}
          </div>
        )}
      </div>

      {/* Info row */}
      <div style={{ padding:'8px 10px' }}>
        <p style={{
          margin:'0 0 2px', fontSize:11, fontWeight:700, color: selected ? '#fff' : T.text,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
        }}>
          {r.cenaNome ?? 'Sem nome'}
        </p>
        <p style={{ margin:0, fontSize:9, color:T.dim }}>{fmtRelative(r.createdAt)}</p>
      </div>
    </div>
  )
}

// ─── Viewer ────────────────────────────────────────────────────────────────────
function RenderViewer({ r }: { r: GalleryRender }) {
  const meta     = modelMeta(r.origem)
  const [zoom, setZoom] = useState(false)

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', animation:'rg-fadeIn 0.3s ease' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, flexWrap:'wrap', gap:8 }}>
        <div>
          <h3 style={{ margin:'0 0 4px', fontSize:16, fontWeight:900, color:'#fff', letterSpacing:'-0.01em' }}>
            {r.cenaNome ?? 'Render'}
          </h3>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ padding:'2px 8px', borderRadius:20, fontSize:9, fontWeight:700, background:`${meta.color}18`, color:meta.color, border:`1px solid ${meta.color}30` }}>
              {meta.icon} {meta.label}
            </span>
            {r.versao != null && (
              <span style={{ padding:'2px 8px', borderRadius:20, fontSize:9, fontWeight:700, background:'rgba(255,255,255,0.05)', color:T.dim }}>
                Versão {r.versao}
              </span>
            )}
            <span style={{ fontSize:10, color:T.dim }}>{fmtDate(r.createdAt)}</span>
          </div>
        </div>
        {/* Actions */}
        <div style={{ display:'flex', gap:8 }}>
          {r.imageUrl && (
            <a
              href={r.imageUrl}
              target="_blank"
              rel="noreferrer"
              className="rg-btn"
              style={{
                padding:'8px 16px', borderRadius:8, border:'none',
                background:T.purple, color:'#fff', cursor:'pointer',
                fontSize:11, fontWeight:700, textDecoration:'none',
                display:'flex', alignItems:'center', gap:5,
              }}
            >
              🔗 Abrir
            </a>
          )}
          <button
            className="rg-btn"
            onClick={() => {
              if (r.imageUrl) {
                const a = document.createElement('a')
                a.href = r.imageUrl!
                a.download = `render-${r.id.slice(0,8)}.jpg`
                a.click()
              }
            }}
            disabled={!r.imageUrl}
            style={{
              padding:'8px 16px', borderRadius:8, border:`1px solid ${T.border}`,
              background:'rgba(255,255,255,0.04)', color: r.imageUrl ? T.text : T.dim,
              cursor: r.imageUrl ? 'pointer' : 'not-allowed', fontSize:11, fontWeight:600,
              display:'flex', alignItems:'center', gap:5,
            }}
          >
            ⬇ Baixar
          </button>
        </div>
      </div>

      {/* Main image */}
      {r.imageUrl ? (
        <div
          onClick={() => setZoom(z => !z)}
          style={{
            borderRadius:12, overflow:'hidden', marginBottom:14,
            border:`1px solid ${T.border}`,
            background:'#060610', cursor: zoom ? 'zoom-out' : 'zoom-in',
            boxShadow:'0 8px 40px rgba(0,0,0,0.5)',
          }}
        >
          <img
            src={r.imageUrl}
            alt="Render"
            style={{
              width:'100%', display:'block',
              maxHeight: zoom ? 'none' : 420,
              objectFit: zoom ? 'contain' : 'cover',
              transition:'max-height 0.35s ease',
            }}
          />
        </div>
      ) : (
        <div style={{
          height:280, borderRadius:12, background:'rgba(255,255,255,0.02)',
          border:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:14,
        }}>
          <div style={{ textAlign:'center', color:T.dim }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🎨</div>
            <p style={{ margin:0, fontSize:11 }}>Imagem não disponível</p>
          </div>
        </div>
      )}

      {zoom && (
        <p style={{ margin:'-10px 0 14px', fontSize:9, color:T.dim, textAlign:'center' }}>
          Clique para reduzir
        </p>
      )}

      {/* Metadata grid */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        {[
          { k:'Motor de Render',  v: meta.label },
          { k:'Gerado em',        v: fmtDate(r.createdAt) },
          { k:'ID da Cena',       v: r.cenaId.slice(0, 12) + '…' },
          { k:'ID do Render',     v: r.id.slice(0, 12) + '…'    },
        ].map(({ k, v }) => (
          <div key={k} style={{
            padding:'9px 12px', borderRadius:8,
            background:'rgba(255,255,255,0.025)', border:`1px solid ${T.border}`,
          }}>
            <p style={{ margin:'0 0 2px', fontSize:8, color:T.dim, fontWeight:700, letterSpacing:'0.06em' }}>{k}</p>
            <p style={{ margin:0, fontSize:10, color:T.text, fontFamily:'ui-monospace,monospace', wordBreak:'break-all' }}>
              {v}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export function RenderHistoryModule() {
  const [renders,  setRenders]  = useState<GalleryRender[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string|null>(null)
  const [sel,      setSel]      = useState<string|null>(null)
  const [busca,    setBusca]    = useState('')
  const [polling,  setPolling]  = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval>|null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(null) }
    try {
      const res = await fetch(`${BASE}/arch/renders/gallery?limit=40`, { headers: authHeaders() })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: GalleryRender[] = await res.json()
      setRenders(data)
      if (data.length > 0 && !sel) setSel(data[0].id)
    } catch (e: unknown) {
      if (!silent) setError(e instanceof Error ? e.message : 'Erro ao carregar')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [sel])

  useEffect(() => { load() }, [load])

  // Auto-poll when explicitly waiting for new renders
  useEffect(() => {
    if (polling) {
      pollRef.current = setInterval(() => load(true), 8000)
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [polling, load])

  const filtered   = renders.filter(r => {
    if (!busca) return true
    const q = busca.toLowerCase()
    return (r.cenaNome ?? '').toLowerCase().includes(q) || r.id.toLowerCase().includes(q)
  })
  const selRender  = renders.find(r => r.id === sel) ?? null

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:T.bg }}>
      <style>{CSS}</style>

      {/* ── Ambient header ── */}
      <div style={{
        padding:'12px 20px', borderBottom:`1px solid ${T.border}`, flexShrink:0,
        background:'linear-gradient(180deg, rgba(124,58,237,0.06) 0%, transparent 100%)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <div style={{ flex:1 }}>
            <h2 style={{ margin:'0 0 2px', fontSize:16, fontWeight:900, color:'#fff', letterSpacing:'-0.02em' }}>
              🎬 Galeria de Renders
            </h2>
            <p style={{ margin:0, fontSize:10, color:T.dim }}>
              {loading ? 'Carregando…' : renders.length > 0 ? `${renders.length} render(s) · ${filtered.length} visíveis` : 'Nenhum render gerado'}
            </p>
          </div>

          {/* Poll toggle */}
          {renders.length > 0 && (
            <button
              onClick={() => setPolling(p => !p)}
              style={{
                padding:'5px 12px', borderRadius:8, border:`1px solid ${polling ? T.purpleL : T.border}`,
                background: polling ? 'rgba(167,139,250,0.12)' : 'transparent',
                color: polling ? T.purpleL : T.dim, cursor:'pointer', fontSize:10, fontWeight:700,
                display:'flex', alignItems:'center', gap:5, transition:'all 0.15s',
              }}
            >
              {polling ? (
                <span style={{ animation:'rg-pulse 1.5s ease infinite', display:'inline-block' }}>●</span>
              ) : '○'}
              {polling ? 'Aguardando novos…' : 'Auto-atualizar'}
            </button>
          )}

          {/* Search */}
          {renders.length > 0 && (
            <div style={{ position:'relative' }}>
              <span style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', fontSize:11, color:T.dim, pointerEvents:'none' }}>🔍</span>
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar cena…"
                style={{
                  background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`,
                  borderRadius:8, color:T.text, fontSize:11, padding:'6px 10px 6px 26px',
                  outline:'none', width:150, transition:'border-color 0.15s',
                }}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = T.purple}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = T.border}
              />
            </div>
          )}

          <button
            onClick={() => load()}
            style={{
              padding:'6px 12px', borderRadius:8, border:`1px solid ${T.border}`,
              background:'rgba(255,255,255,0.04)', color:T.dim, cursor:'pointer', fontSize:10,
              transition:'all 0.15s',
            }}
          >
            ↻
          </button>

          <a
            href={`${import.meta.env.BASE_URL}arch/render`}
            className="rg-btn"
            style={{
              padding:'6px 14px', borderRadius:8, border:'none',
              background:`linear-gradient(135deg, ${T.purple}, #5b21b6)`,
              color:'#fff', textDecoration:'none', fontSize:11, fontWeight:700,
              boxShadow:'0 3px 12px rgba(124,58,237,0.35)',
            }}
          >
            ✨ Novo Render
          </a>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding:'8px 20px', background:'rgba(248,113,113,0.07)', borderBottom:`1px solid rgba(248,113,113,0.18)`, fontSize:11, color:'#f87171', flexShrink:0 }}>
          ⚠ {error} — <button onClick={() => load()} style={{ background:'none', border:'none', color:'#f87171', cursor:'pointer', textDecoration:'underline', fontSize:11 }}>Tentar novamente</button>
        </div>
      )}

      {/* ── Body ── */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* ── Filmstrip ── */}
        {(loading || renders.length > 0) && (
          <div style={{
            width:240, flexShrink:0, borderRight:`1px solid ${T.border}`,
            overflowY:'auto', background:T.sidebar,
          }}>
            {loading ? (
              <SkeletonStrip />
            ) : (
              <div style={{ padding:10 }}>
                {filtered.length === 0 && busca && (
                  <div style={{ padding:'30px 12px', textAlign:'center', color:T.dim, fontSize:11 }}>
                    Nenhum resultado para "{busca}"
                  </div>
                )}
                {filtered.map(r => (
                  <FilmCard key={r.id} r={r} selected={sel === r.id} onClick={() => setSel(r.id)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Viewer ── */}
        {!loading && renders.length === 0 ? (
          <EmptyGallery />
        ) : selRender ? (
          <RenderViewer r={selRender} />
        ) : (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:T.dim, fontSize:12, animation:'rg-fadeIn 0.3s ease' }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:28, marginBottom:8, opacity:0.4 }}>🎬</div>
              <p style={{ margin:0 }}>Selecione um render para visualizar</p>
            </div>
          </div>
        )}
      </div>

      {/* Polling indicator bar */}
      {polling && (
        <div style={{
          padding:'6px 16px', background:'rgba(167,139,250,0.08)', borderTop:`1px solid rgba(167,139,250,0.15)`,
          display:'flex', alignItems:'center', gap:8, flexShrink:0,
        }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:T.purpleL, animation:'rg-pulse 1.2s ease infinite' }}/>
          <p style={{ margin:0, fontSize:10, color:T.purpleL, fontWeight:600 }}>
            Aguardando novos renders… atualiza a cada 8s
          </p>
          <button onClick={() => setPolling(false)} style={{ marginLeft:'auto', background:'none', border:'none', color:T.dim, cursor:'pointer', fontSize:11 }}>
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
