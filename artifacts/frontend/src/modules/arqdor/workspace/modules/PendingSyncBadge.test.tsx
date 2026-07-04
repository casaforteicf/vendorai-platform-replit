import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PendingSyncBadge, STALE_AMBER_DAYS, STALE_RED_DAYS } from './PendingSyncBadge'

const DAY_MS = 24 * 60 * 60 * 1000

function renderBadge(ageMs: number) {
  const now = Date.now()
  const savedAt = now - ageMs
  return render(<PendingSyncBadge savedAt={savedAt} now={now} />)
}

/**
 * jsdom normalises inline CSS colour values by adding spaces after commas,
 * so we compare with toContain on recognisable sub-strings rather than exact
 * string equality. The data-staleness attribute is the primary assertion; the
 * style checks are secondary verification that the correct colour token is
 * applied.
 */

describe('PendingSyncBadge — staleness colors', () => {
  it('renders with muted gray color when item is fresh (< 1 day old)', () => {
    renderBadge(12 * 60 * 60 * 1000) // 12 hours
    const badge = screen.getByTitle(/Aguardando sync/i)
    expect(badge).toBeInTheDocument()
    // Primary: correct level
    expect(badge).toHaveAttribute('data-staleness', 'fresh')
    // Secondary: gray color token present, no amber/red
    expect(badge.style.color).toContain('148')
    expect(badge.style.color).not.toContain('251') // not amber
    expect(badge.style.color).not.toContain('239') // not red
    expect(badge.style.background).toContain('148')
  })

  it('renders with amber color when item is between 1 and 3 days old', () => {
    renderBadge(STALE_AMBER_DAYS * DAY_MS + 1) // just over amber threshold
    const badge = screen.getByTitle(/Aguardando sync/i)
    // Primary: correct level
    expect(badge).toHaveAttribute('data-staleness', 'amber')
    // Secondary: amber color token (251,191,36) present, no red
    expect(badge.style.color).toContain('251')
    expect(badge.style.color).not.toContain('239') // not red
    expect(badge.style.background).toContain('251')
    expect(badge.style.border).toContain('251')
  })

  it('renders with amber color at exactly STALE_AMBER_DAYS days old', () => {
    renderBadge(STALE_AMBER_DAYS * DAY_MS)
    const badge = screen.getByTitle(/Aguardando sync/i)
    expect(badge).toHaveAttribute('data-staleness', 'amber')
    expect(badge.style.color).toContain('251')
    expect(badge.style.color).not.toContain('239')
  })

  it('renders with red color when item is 3 or more days old', () => {
    renderBadge(STALE_RED_DAYS * DAY_MS)
    const badge = screen.getByTitle(/Aguardando sync/i)
    // Primary: correct level
    expect(badge).toHaveAttribute('data-staleness', 'red')
    // Secondary: red color token (239,68,68) present, no amber
    expect(badge.style.color).toContain('239')
    expect(badge.style.color).not.toContain('251') // not amber
    expect(badge.style.background).toContain('239')
    expect(badge.style.border).toContain('239')
  })

  it('renders with red color well beyond 3 days old', () => {
    renderBadge(7 * DAY_MS) // 7 days
    const badge = screen.getByTitle(/Aguardando sync/i)
    expect(badge).toHaveAttribute('data-staleness', 'red')
    expect(badge.style.color).toContain('239')
    expect(badge.style.color).not.toContain('251')
  })

  it('does not apply amber or red color just before the amber threshold', () => {
    renderBadge(STALE_AMBER_DAYS * DAY_MS - 1) // 1 ms before amber
    const badge = screen.getByTitle(/Aguardando sync/i)
    expect(badge).toHaveAttribute('data-staleness', 'fresh')
    expect(badge.style.color).toContain('148') // gray token
    expect(badge.style.color).not.toContain('251')
    expect(badge.style.color).not.toContain('239')
  })

  it('renders amber just before the red threshold', () => {
    renderBadge(STALE_RED_DAYS * DAY_MS - 1) // 1 ms before red
    const badge = screen.getByTitle(/Aguardando sync/i)
    expect(badge).toHaveAttribute('data-staleness', 'amber')
    expect(badge.style.color).toContain('251')
    expect(badge.style.color).not.toContain('239')
  })

  it('always renders the offline label regardless of staleness level', () => {
    renderBadge(0)
    const badge = screen.getByTitle(/Aguardando sync/i)
    expect(badge).toBeInTheDocument()
    expect(badge.textContent).toContain('offline')
  })
})
