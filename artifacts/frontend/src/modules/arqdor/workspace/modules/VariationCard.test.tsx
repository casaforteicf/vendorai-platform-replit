import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { VariationCard } from './PromptPlaygroundModule'
import { STALE_AMBER_DAYS, STALE_RED_DAYS } from './useSavedVariations'
import type { SavedVariation } from './useSavedVariations'
import { T } from '../../shared/arqdor-theme'

const DAY_MS = 24 * 60 * 60 * 1000

// Fixed reference point — tests never read the real wall clock
const NOW = 1_700_000_000_000

const noop = () => {}

function makeVariation(id: string, ageMs: number): SavedVariation {
  return {
    id,
    name: 'Test variation',
    translator: 'flux-1.1',
    detail: 'detalhado',
    prompt: 'test prompt',
    negativePrompt: '',
    estimatedTokens: 100,
    savedAt: NOW - ageMs,
  }
}

function renderCard(v: SavedVariation) {
  const { container } = render(
    <VariationCard
      now={NOW}
      v={v}
      editingId={null}
      editingName=""
      copiedId={null}
      copiedLinkId={null}
      onStartEdit={noop}
      onCommitEdit={noop}
      onCancelEdit={noop}
      onEditingNameChange={noop}
      onCopy={noop}
      onCopyLink={noop}
      onDelete={noop}
      onUpdateNotes={noop}
    />,
  )
  return container.firstElementChild as HTMLElement
}

/**
 * jsdom normalises inline CSS colour values by adding spaces after commas,
 * so we compare with toContain on recognisable numeric sub-strings rather
 * than exact string equality.
 *
 * The outer wrapper div carries the staleness border:
 *   border: `1px solid ${stalenessBorderColor}`
 *
 * Color tokens used:
 *   fresh / server-id  — T.border = 'rgba(255,255,255,0.07)'   → contains '255'
 *   amber              — 'rgba(251,191,36,0.35)'               → contains '251'
 *   red                — 'rgba(239,68,68,0.35)'                → contains '239'
 */

describe('VariationCard — stalenessBorderColor on outer wrapper', () => {
  // ── pending (local-*) cards ───────────────────────────────────────────────

  it('uses T.border when the pending item is fresh (< 1 day old)', () => {
    const wrapper = renderCard(makeVariation('local-fresh', 12 * 60 * 60 * 1000))
    expect(wrapper.style.border).toContain('255') // T.border channel
    expect(wrapper.style.border).not.toContain('251') // no amber
    expect(wrapper.style.border).not.toContain('239') // no red
  })

  it('turns amber when the pending item is between 1 and 3 days old', () => {
    const wrapper = renderCard(
      makeVariation('local-amber', STALE_AMBER_DAYS * DAY_MS + 1000),
    )
    expect(wrapper.style.border).toContain('251') // amber channel
    expect(wrapper.style.border).not.toContain('239') // not red
  })

  it('turns amber at exactly STALE_AMBER_DAYS days old', () => {
    const wrapper = renderCard(
      makeVariation('local-amber-exact', STALE_AMBER_DAYS * DAY_MS),
    )
    expect(wrapper.style.border).toContain('251')
    expect(wrapper.style.border).not.toContain('239')
  })

  it('turns red when the pending item is at or beyond STALE_RED_DAYS days old', () => {
    const wrapper = renderCard(
      makeVariation('local-red', STALE_RED_DAYS * DAY_MS),
    )
    expect(wrapper.style.border).toContain('239') // red channel
    expect(wrapper.style.border).not.toContain('251') // not amber
  })

  it('turns red well beyond the red threshold', () => {
    const wrapper = renderCard(makeVariation('local-red-old', 7 * DAY_MS))
    expect(wrapper.style.border).toContain('239')
    expect(wrapper.style.border).not.toContain('251')
  })

  it('is amber just before the red threshold', () => {
    // Use a 1-minute margin so the test is not sensitive to sub-millisecond timing
    const wrapper = renderCard(
      makeVariation('local-amber-boundary', STALE_RED_DAYS * DAY_MS - 60_000),
    )
    expect(wrapper.style.border).toContain('251')
    expect(wrapper.style.border).not.toContain('239')
  })

  // ── server-id cards always use T.border ──────────────────────────────────
  // jsdom normalises inline rgba() values by inserting spaces after commas, so
  // we use toContain('255') as the primary assertion (T.border channel) and
  // verify amber/red channels are absent — matching the PendingSyncBadge approach.

  it('always uses T.border for a server-id card regardless of savedAt age', () => {
    // A server-id card that would be "red" if it were pending
    const wrapper = renderCard(makeVariation('server-uuid-abc123', 7 * DAY_MS))
    expect(wrapper.style.border).toContain('255') // T.border = rgba(255,255,255,0.07)
    expect(wrapper.style.border).not.toContain('251') // no amber
    expect(wrapper.style.border).not.toContain('239') // no red
  })

  it('uses T.border for a server-id card that is brand new', () => {
    const wrapper = renderCard(makeVariation('server-uuid-new', 0))
    expect(wrapper.style.border).toContain('255')
    expect(wrapper.style.border).not.toContain('251')
    expect(wrapper.style.border).not.toContain('239')
  })

  it('uses T.border for a failed-* card (permanently failed, no longer retried)', () => {
    // failed-* ids are not pending (don't start with local-) so border stays neutral
    const wrapper = renderCard(makeVariation('failed-uuid-xyz', 7 * DAY_MS))
    expect(wrapper.style.border).toContain('255')
    expect(wrapper.style.border).not.toContain('251')
    expect(wrapper.style.border).not.toContain('239')
  })
})

// ─── Shared props helper for interval tests ────────────────────────────────────

function baseProps(v: SavedVariation) {
  return {
    v,
    editingId: null as string | null,
    editingName: '',
    copiedId: null as string | null,
    copiedLinkId: null as string | null,
    onStartEdit: noop,
    onCommitEdit: noop,
    onCancelEdit: noop,
    onEditingNameChange: noop,
    onCopy: noop,
    onCopyLink: noop,
    onDelete: noop,
    onUpdateNotes: noop,
  } as const
}

describe('VariationCard — interval lifecycle', () => {
  let setIntervalSpy: ReturnType<typeof vi.spyOn>
  let clearIntervalSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('starts interval when now is absent and clears it when now is injected', () => {
    const v = makeVariation('local-interval-test', 0)

    const { rerender } = render(<VariationCard {...baseProps(v)} />)

    // No now prop → interval must have been set up once
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000)
    expect(clearIntervalSpy).toHaveBeenCalledTimes(0)

    // Inject the now prop → React re-runs the effect; cleanup must fire clearInterval
    act(() => {
      rerender(<VariationCard {...baseProps(v)} now={NOW} />)
    })

    // The previous interval must have been cleared
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
    // No new interval should have been started (nowProp is now defined)
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
  })

  it('never starts an interval for a server-id card even without a now prop', () => {
    const v = makeVariation('server-uuid-no-now', 0)

    render(<VariationCard {...baseProps(v)} />)

    // id does not start with 'local-' so the guard short-circuits before setInterval
    expect(setIntervalSpy).not.toHaveBeenCalled()
    expect(clearIntervalSpy).not.toHaveBeenCalled()
  })

  it('does not start an interval when now is provided from the first render', () => {
    const v = makeVariation('local-with-now', 0)

    render(<VariationCard {...baseProps(v)} now={NOW} />)

    // nowProp is defined from the start → guard returns early
    expect(setIntervalSpy).not.toHaveBeenCalled()
    expect(clearIntervalSpy).not.toHaveBeenCalled()
  })
})
