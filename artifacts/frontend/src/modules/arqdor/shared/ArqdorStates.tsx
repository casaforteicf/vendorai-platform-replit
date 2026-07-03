// ─── Arqdor Shared UI States — P1-005 ────────────────────────────────────────
// Standard Loading / Error / Empty / Retry / Success states for all arqdor modules.
// Import these instead of building one-off inline placeholders.

import { T } from './arqdor-theme'

// ─── Loading ─────────────────────────────────────────────────────────────────

export function ArqdorLoading({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 12, padding: 40,
      color: T.dim, fontSize: 12,
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        border: `2px solid ${T.purpleL}`,
        borderTopColor: 'transparent',
        animation: 'arqdor-spin 0.8s linear infinite',
      }} />
      <span>{label}</span>
      <style>{`@keyframes arqdor-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── Error ───────────────────────────────────────────────────────────────────

export function ArqdorError({
  message = 'Ocorreu um erro inesperado.',
  onRetry,
}: { message?: string; onRetry?: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 12, padding: 40, textAlign: 'center',
    }}>
      <span style={{ fontSize: 28 }}>⚠️</span>
      <p style={{ margin: 0, fontSize: 12, color: T.red, maxWidth: 280 }}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: '6px 16px', borderRadius: T.r.md,
            background: T.purple, color: '#fff',
            border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
          }}
        >
          Tentar novamente
        </button>
      )}
    </div>
  )
}

// ─── Empty ───────────────────────────────────────────────────────────────────

export function ArqdorEmpty({
  icon = '📭',
  title = 'Nenhum item encontrado',
  description,
  action,
}: {
  icon?: string
  title?: string
  description?: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 10, padding: 40, textAlign: 'center',
    }}>
      <span style={{ fontSize: 32 }}>{icon}</span>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.text }}>{title}</p>
      {description && (
        <p style={{ margin: 0, fontSize: 11, color: T.dim, maxWidth: 260 }}>{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: 6, padding: '6px 16px', borderRadius: T.r.md,
            background: T.purple, color: '#fff',
            border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

// ─── Success toast ────────────────────────────────────────────────────────────

export function ArqdorSuccess({ message }: { message: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 14px', borderRadius: T.r.md,
      background: 'rgba(74,222,128,0.12)', border: `1px solid rgba(74,222,128,0.3)`,
      fontSize: 11, color: T.green, fontWeight: 600,
    }}>
      <span>✓</span>
      <span>{message}</span>
    </div>
  )
}

// ─── Placeholder hub ─────────────────────────────────────────────────────────
// Use when a hub is not yet wired to real data (P1-003).

export function ArqdorHubPlaceholder({
  hubName,
  icon = '🔗',
  description,
}: {
  hubName: string
  icon?: string
  description?: string
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 12, padding: 40, textAlign: 'center',
    }}>
      <span style={{ fontSize: 32 }}>{icon}</span>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.text }}>{hubName}</p>
      <div style={{
        padding: '4px 12px', borderRadius: T.r.full,
        background: 'rgba(251,191,36,0.12)', border: `1px solid rgba(251,191,36,0.3)`,
        fontSize: 10, fontWeight: 700, color: T.amber, letterSpacing: '0.05em',
      }}>
        EM DESENVOLVIMENTO
      </div>
      {description && (
        <p style={{ margin: 0, fontSize: 11, color: T.dim, maxWidth: 280 }}>{description}</p>
      )}
    </div>
  )
}
