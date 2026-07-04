import { useState, useEffect, useCallback } from 'react'
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

const ORIGEM_META: Record<string, { color: string; label: string }> = {
  'flux-kontext':  { color: '#a78bfa', label: 'Flux Kontext' },
  'flux-ultra':    { color: '#60a5fa', label: 'Flux Ultra' },
  'flux-fill':     { color: '#34d399', label: 'Flux Fill' },
  'openai':        { color: '#4ade80', label: 'OpenAI' },
  'blender':       { color: '#fb923c', label: 'Blender' },
  'replicate':     { color: '#a78bfa', label: 'Replicate' },
}

function origemMeta(origem: string | null) {
  if (!origem) return { color: T.dim, label: 'Render' }
  const key = Object.keys(ORIGEM_META).find(k => origem.toLowerCase().includes(k))
  return key ? ORIGEM_META[key] : { color: T.dim, label: origem }
}

export function RenderHistoryModule() {
  const [renders,  setRenders]  = useState<GalleryRender[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [sel,      setSel]      = useState<string | null>(null)
  const [busca,    setBusca]    = useState('')
  const [limit]                 = useState(40)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${BASE}/arch/renders/gallery?limit=${limit}`, {
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: GalleryRender[] = await res.json()
      setRenders(data)
      if (data.length > 0 && !sel) setSel(data[0].id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar renders')
    } finally {
      setLoading(false)
    }
  }, [limit, sel])

  useEffect(() => { load() }, [load])

  const filtered = renders.filter(r => {
    if (!busca) return true
    const q = busca.toLowerCase()
    return (r.cenaNome ?? '').toLowerCase().includes(q) || r.id.toLowerCase().includes(q)
  })

  const selRender = renders.find(r => r.id === sel) ?? null

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' as const, background: T.bg }}>
      {/* Header */}
      <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 800, color: '#fff' }}>🎬 Histórico de Renders</h2>
          <p style={{ margin: 0, fontSize: 11, color: T.dim }}>
            {loading ? 'Carregando…' : `${renders.length} render(s) gerado(s)`}
          </p>
        </div>
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar cena…"
          style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 11, padding: '5px 10px', outline: 'none', width: 160 }}
        />
        <button
          onClick={load}
          style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.07)', color: T.dim, cursor: 'pointer', fontSize: 11 }}
        >↻ Atualizar</button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '10px 20px', background: 'rgba(248,113,113,0.08)', borderBottom: `1px solid rgba(248,113,113,0.2)`, fontSize: 11, color: '#f87171' }}>
          ⚠ {error}
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* List */}
        <div style={{ width: 320, flexShrink: 0, borderRight: `1px solid ${T.border}`, overflowY: 'auto' as const, padding: '10px 12px' }}>
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
              {[1,2,3].map(i => (
                <div key={i} style={{ height: 110, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`, animation: 'pulse 1.5s infinite' }}/>
              ))}
            </div>
          )}
          {!loading && filtered.length === 0 && renders.length === 0 && (
            <div style={{ textAlign: 'center' as const, padding: '48px 20px', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 16 }}>
              <div style={{ fontSize: 40 }}>🎨</div>
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: '#fff' }}>Nenhum render ainda</p>
                <p style={{ margin: 0, fontSize: 11, color: T.dim, lineHeight: 1.5 }}>Gere seu primeiro render com o<br/>Prompt Engine + AI</p>
              </div>
              <a
                href="/arch/render"
                style={{
                  display: 'inline-block', padding: '10px 22px', borderRadius: 8,
                  background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
                  color: '#fff', textDecoration: 'none', fontSize: 12, fontWeight: 700,
                  boxShadow: '0 4px 16px rgba(124,58,237,0.35)',
                }}
              >
                ✨ Gerar Primeiro Render
              </a>
            </div>
          )}
          {!loading && filtered.length === 0 && renders.length > 0 && (
            <div style={{ textAlign: 'center' as const, padding: 40, color: T.dim, fontSize: 12 }}>
              Nenhum resultado para a busca.
            </div>
          )}
          {!loading && filtered.map(r => {
            const meta = origemMeta(r.origem)
            const isSel = sel === r.id
            return (
              <div key={r.id} onClick={() => setSel(r.id)} style={{
                borderRadius: 8, marginBottom: 8, cursor: 'pointer', overflow: 'hidden',
                border: `1px solid ${isSel ? 'rgba(124,58,237,0.4)' : T.border}`,
                background: isSel ? 'rgba(124,58,237,0.10)' : 'rgba(255,255,255,0.03)',
              }}>
                {/* Thumbnail */}
                {r.imageUrl ? (
                  <img
                    src={r.imageUrl}
                    alt={r.cenaNome ?? 'Render'}
                    style={{ width: '100%', height: 90, objectFit: 'cover' as const, display: 'block' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <div style={{ height: 72, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 10, color: T.dim }}>🎨 Sem prévia</span>
                  </div>
                )}
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: 160 }}>
                      {r.cenaNome ?? 'Sem nome'}
                    </span>
                    <span style={{ padding: '2px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700, background: `${meta.color}22`, color: meta.color, whiteSpace: 'nowrap' as const }}>
                      {meta.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.dim }}>
                    <span>{new Date(r.createdAt).toLocaleDateString('pt-BR')}</span>
                    {r.versao != null && <span>V{r.versao}</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Detail */}
        {selRender ? (
          <div style={{ flex: 1, overflowY: 'auto' as const, padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: '#fff' }}>
                  {selRender.cenaNome ?? 'Render'}
                </h3>
                <p style={{ margin: 0, fontSize: 11, color: T.dim }}>
                  {selRender.versao != null ? `Versão ${selRender.versao}` : 'Versão única'} · {new Date(selRender.createdAt).toLocaleString('pt-BR')}
                </p>
              </div>
              <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 10, fontWeight: 700, background: `${origemMeta(selRender.origem).color}22`, color: origemMeta(selRender.origem).color }}>
                {origemMeta(selRender.origem).label}
              </span>
            </div>

            {/* Image */}
            {selRender.imageUrl ? (
              <div style={{ borderRadius: 10, overflow: 'hidden', marginBottom: 16, border: `1px solid ${T.border}` }}>
                <img
                  src={selRender.imageUrl}
                  alt="Render"
                  style={{ width: '100%', display: 'block', maxHeight: 400, objectFit: 'contain' as const, background: '#0a0a0a' }}
                />
              </div>
            ) : (
              <div style={{ height: 200, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <p style={{ color: T.dim, fontSize: 12 }}>🎨 Imagem não disponível</p>
              </div>
            )}

            {/* Metadata */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              {[
                ['ID do Render', selRender.id.slice(0, 16) + '…'],
                ['Cena ID',      selRender.cenaId.slice(0, 16) + '…'],
                ['Motor',        origemMeta(selRender.origem).label],
                ['Gerado em',    new Date(selRender.createdAt).toLocaleString('pt-BR')],
              ].map(([k, v]) => (
                <div key={k} style={{ padding: '8px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}` }}>
                  <p style={{ margin: '0 0 2px', fontSize: 8, color: T.dim, fontWeight: 700, letterSpacing: '0.06em' }}>{k}</p>
                  <p style={{ margin: 0, fontSize: 10, color: T.text, fontFamily: 'ui-monospace,monospace', wordBreak: 'break-all' as const }}>{v}</p>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              {selRender.imageUrl && (
                <a
                  href={selRender.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: T.purple, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, textAlign: 'center' as const, textDecoration: 'none', display: 'block' }}
                >
                  🔗 Abrir em nova aba
                </a>
              )}
              <button
                onClick={() => {
                  if (selRender.imageUrl) {
                    const a = document.createElement('a')
                    a.href = selRender.imageUrl!
                    a.download = `render-${selRender.id}.jpg`
                    a.click()
                  }
                }}
                disabled={!selRender.imageUrl}
                style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: selRender.imageUrl ? T.text : T.dim, cursor: selRender.imageUrl ? 'pointer' : 'not-allowed', fontSize: 12 }}
              >
                ⬇ Baixar
              </button>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.dim, fontSize: 13 }}>
            Selecione um render para ver os detalhes.
          </div>
        )}
      </div>
    </div>
  )
}
