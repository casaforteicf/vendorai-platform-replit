import { getStalenessInfo, STALE_AMBER_DAYS, STALE_RED_DAYS } from './useSavedVariations'
import { T } from '../../shared/arqdor-theme'

export { STALE_AMBER_DAYS, STALE_RED_DAYS }

interface PendingSyncBadgeProps {
  savedAt: number
  now?: number
}

/**
 * Badge rendered on variation cards that are pending server sync.
 * Color reflects how stale the pending item is:
 *   fresh  (< STALE_AMBER_DAYS days) — muted gray
 *   amber  (≥ STALE_AMBER_DAYS, < STALE_RED_DAYS days) — amber
 *   red    (≥ STALE_RED_DAYS days) — red
 */
export function PendingSyncBadge({ savedAt, now = Date.now() }: PendingSyncBadgeProps) {
  const staleness = getStalenessInfo(savedAt, now)

  const color =
    staleness.level === 'red'   ? 'rgba(239,68,68,0.9)'  :
    staleness.level === 'amber' ? 'rgba(251,191,36,0.9)' :
    'rgba(148,163,184,0.7)'

  const borderColor =
    staleness.level === 'red'   ? 'rgba(239,68,68,0.35)'  :
    staleness.level === 'amber' ? 'rgba(251,191,36,0.35)' :
    T.border

  const background =
    staleness.level === 'red'   ? 'rgba(239,68,68,0.15)'  :
    staleness.level === 'amber' ? 'rgba(251,191,36,0.15)' :
    'rgba(148,163,184,0.12)'

  return (
    <span
      data-staleness={staleness.level}
      title={staleness.label}
      style={{
        fontSize: 8,
        padding: '1px 7px',
        borderRadius: 4,
        fontWeight: 800,
        flexShrink: 0,
        background,
        color,
        border: `1px solid ${borderColor}`,
      }}
    >
      🔄 offline
    </span>
  )
}
