import { AppliedMaterial } from './render-types'

interface BottomBarProps {
  applied: Record<string, AppliedMaterial>
  renderResult: string
  prompt: string
  onPromptChange: (v: string) => void
  onRender: () => void
  loading: boolean
  onRemove: (zone: string) => void
}

export default function BottomBar({
  applied, renderResult, prompt, onPromptChange, onRender, loading, onRemove
}: BottomBarProps) {
  const zones = Object.entries(applied)
  const hasVersions = !!renderResult

  return (
    <div style={{
      height: 36,
      background: '#0e0c1a',
      borderTop: '0.5px solid rgba(255,255,255,0.1)',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '0 8px',
      flexShrink: 0,
      overflow: 'hidden',
    }}>

      {/* Seção 1 — Aplicados */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        overflow: 'hidden',
        minWidth: 0,
      }}>
        <span style={{
          fontSize: 9,
          color: 'rgba(255,255,255,0.35)',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          flexShrink: 0,
        }}>
          Aplicados
        </span>

        <div style={{
          display: 'flex',
          gap: 4,
          overflowX: 'auto',
          overflowY: 'hidden',
          flex: 1,
          alignItems: 'center',
          minWidth: 0,
        }}>
          {zones.length === 0 ? (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}>
              Arraste textura sobre a imagem
            </span>
          ) : zones.map(([zone, mat]) => (
            <div
              key={zone}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: 'rgba(255,255,255,0.06)',
                border: '0.5px solid rgba(255,255,255,0.12)',
                borderRadius: 20,
                padding: '2px 6px 2px 5px',
                flexShrink: 0,
              }}
            >
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: mat.color,
                flexShrink: 0,
                display: 'inline-block',
              }} />
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>
                {zone} · {mat.name}
              </span>
              <button
                onClick={() => onRemove(zone)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.35)',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 10,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                }}
                title={`Remover ${zone}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Seção 2 — Strip de versões */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        overflowX: 'auto',
        overflowY: 'hidden',
        flexShrink: 0,
        maxWidth: 120,
        borderLeft: '0.5px solid rgba(255,255,255,0.1)',
        borderRight: '0.5px solid rgba(255,255,255,0.1)',
        padding: '0 6px',
        height: '100%',
      }}>
        {!hasVersions ? (
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', whiteSpace: 'nowrap' }}>v1</span>
        ) : (
          <img
            src={renderResult}
            alt="Versão 1"
            style={{
              width: 22,
              height: 16,
              objectFit: 'cover',
              border: '1px solid rgba(139,92,246,0.6)',
              borderRadius: 3,
              flexShrink: 0,
              cursor: 'pointer',
            }}
            title="Render v1"
          />
        )}
      </div>

      {/* Seção 3 — Textarea + botão */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <textarea
          value={prompt}
          onChange={e => onPromptChange(e.target.value)}
          placeholder="Personalizar prompt…"
          rows={1}
          style={{
            width: 180,
            height: 24,
            resize: 'none',
            background: 'rgba(255,255,255,0.06)',
            border: '0.5px solid rgba(255,255,255,0.15)',
            borderRadius: 6,
            color: 'rgba(255,255,255,0.8)',
            fontSize: 10,
            padding: '3px 7px',
            outline: 'none',
            lineHeight: '18px',
            overflowY: 'hidden',
          }}
        />
        <button
          onClick={onRender}
          disabled={loading}
          style={{
            padding: '4px 14px',
            borderRadius: 7,
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 11,
            fontWeight: 600,
            color: '#fff',
            background: loading
              ? 'rgba(99,102,241,0.35)'
              : 'linear-gradient(90deg, #6366f1, #3b82f6)',
            opacity: loading ? 0.7 : 1,
            whiteSpace: 'nowrap',
            height: 26,
            transition: 'opacity 0.2s, background 0.2s',
          }}
        >
          {loading ? 'Gerando…' : 'Gerar render'}
        </button>
      </div>

    </div>
  )
}
