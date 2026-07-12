import { useState } from 'react'

const STYLES = [
  { value: 'minimalista', label: 'Minimalista' },
  { value: 'atemporal',   label: 'Atemporal' },
  { value: 'provencal',   label: 'Provençal' },
  { value: 'neoclassico', label: 'Neoclássico' },
  { value: 'moderno',     label: 'Moderno' },
]

interface SuggestionsCardProps {
  referenceImageUrl?: string
  projectId?: string
}

function getBase() { return (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '') }
function getToken() { return localStorage.getItem('vendorai_token') ?? '' }

export default function SuggestionsCard({ referenceImageUrl, projectId }: SuggestionsCardProps) {
  const [style, setStyle]       = useState<string>('minimalista')
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [modal, setModal]       = useState(false)
  const [saved, setSaved]       = useState(false)

  async function generate() {
    setLoading(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(`/api/arch/suggestions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          style,
          projectId: projectId ?? undefined,
          referenceImageUrl: referenceImageUrl ?? undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as any).error ?? `Erro ${res.status}`)
      }
      const data = await res.json()
      setResult(data.imageUrl)
      setModal(true)
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao gerar sugestão')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div style={{
        background: 'rgba(139,92,246,0.06)',
        border: '0.5px solid rgba(139,92,246,0.2)',
        borderRadius: 10,
        padding: '12px 14px',
        minWidth: 200,
        maxWidth: 260,
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#a78bfa',
          marginBottom: 10,
          letterSpacing: '0.02em',
        }}>
          ✨ Sugestões de Decoração
        </div>

        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Estilo
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
          {STYLES.map(s => (
            <button
              key={s.value}
              onClick={() => setStyle(s.value)}
              style={{
                padding: '2px 8px',
                borderRadius: 20,
                border: `0.5px solid ${style === s.value ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.12)'}`,
                background: style === s.value ? 'rgba(139,92,246,0.18)' : 'transparent',
                color: style === s.value ? '#a78bfa' : 'rgba(255,255,255,0.45)',
                fontSize: 10,
                cursor: 'pointer',
                fontWeight: style === s.value ? 600 : 400,
                whiteSpace: 'nowrap',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ fontSize: 9, color: '#f87171', marginBottom: 6 }}>
            {error}
          </div>
        )}

        <button
          onClick={generate}
          disabled={loading}
          style={{
            width: '100%',
            padding: '5px 0',
            borderRadius: 7,
            border: 'none',
            background: loading ? 'rgba(139,92,246,0.3)' : 'linear-gradient(90deg, #7c3aed, #6366f1)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Gerando…' : 'Gerar sugestão'}
        </button>
      </div>

      {modal && result && (
        <div
          onClick={() => setModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#0e0c1a',
              border: '0.5px solid rgba(139,92,246,0.3)',
              borderRadius: 12,
              padding: 20,
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa' }}>
              ✨ Sugestão — {STYLES.find(s => s.value === style)?.label}
            </div>

            <img
              src={result}
              alt="Sugestão de decoração"
              style={{
                maxWidth: '70vw',
                maxHeight: '60vh',
                objectFit: 'contain',
                borderRadius: 8,
                border: '0.5px solid rgba(255,255,255,0.1)',
              }}
            />

            <div style={{
              fontSize: 9,
              color: 'rgba(255,255,255,0.35)',
              textAlign: 'center',
            }}>
              Sugestão visual apenas — não altera o projeto real
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              {!saved && (
                <button
                  onClick={() => setSaved(true)}
                  style={{
                    padding: '5px 16px',
                    borderRadius: 7,
                    border: '0.5px solid rgba(139,92,246,0.4)',
                    background: 'rgba(139,92,246,0.12)',
                    color: '#a78bfa',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {saved ? '✓ Salvo' : 'Salvar como referência'}
                </button>
              )}
              {saved && (
                <span style={{ fontSize: 10, color: '#86efac', alignSelf: 'center' }}>✓ Salvo como referência</span>
              )}
              <button
                onClick={() => { setModal(false); generate() }}
                style={{
                  padding: '5px 16px',
                  borderRadius: 7,
                  border: '0.5px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Gerar outra variação
              </button>
              <button
                onClick={() => setModal(false)}
                style={{
                  padding: '5px 16px',
                  borderRadius: 7,
                  border: '0.5px solid rgba(255,255,255,0.1)',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Descartar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
