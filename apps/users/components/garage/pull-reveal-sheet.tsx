'use client'

import { useEffect, useMemo, useState } from 'react'
import { ScButton } from '@repo/ui/sc/button'
import { ScSheet } from '@repo/ui/sc/modal'
import type { GaragePull } from '@repo/core/api/garage'
import { useMarkGaragePullsSeen } from '@repo/core/api/hooks/use-garage'
import { PullReveal } from './pull-reveal'

/** A sheet reveals at most this many in a row; any more are in the album, counted as seen. */
const SHOWN_AT_ONCE = 3

/**
 * New cars for the Garage (0057), on Home and the album: a sheet (not a
 * card, so Home's two-card rule holds) revealing each card the customer has
 * not seen yet, one after another, then marked seen on every device. A
 * push's tap (?pull=<id>) puts that one first.
 */
export function PullRevealSheet({ pulls, focusId = null, firstName = null }: { pulls: GaragePull[]; focusId?: string | null; firstName?: string | null }) {
  const seen = useMarkGaragePullsSeen()
  const [queue, setQueue] = useState<GaragePull[]>([])
  const [waiting, setWaiting] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState<string[]>([])

  const ordered = useMemo(() => {
    const fresh = pulls.filter((p) => !p.seen && !done.includes(p.id))
    const first = fresh.find((p) => p.id === focusId)
    return first ? [first, ...fresh.filter((p) => p !== first)] : fresh
  }, [pulls, focusId, done])

  useEffect(() => {
    if (open || ordered.length === 0) return
    const timer = window.setTimeout(() => {
      setQueue(ordered.slice(0, SHOWN_AT_ONCE))
      setWaiting(ordered.map((p) => p.id))
      setIndex(0)
      setOpen(true)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [ordered, open])

  const finish = () => {
    if (!open) return
    setDone((current) => [...current, ...waiting])
    setOpen(false)
    seen.mutate(waiting)
  }
  const pull = queue[index] ?? null
  const more = queue.length - index - 1
  const [revealed, setRevealed] = useState(false)

  return (
    <ScSheet open={open && pull !== null} onClose={finish} aria-label="New car for your Garage">
      {pull && (
        <div key={pull.id} className="flex flex-col items-center gap-1 px-5 pb-2 pt-2">
          <p className="text-[12px] uppercase tracking-[0.14em] text-text-secondary">New car for your Garage</p>
          <PullReveal pull={{ ...pull, seen: false }} onRevealed={() => setRevealed(true)} firstName={firstName} compact />
          {revealed && (
            <ScButton
              variant="secondary"
              className="min-h-11"
              onClick={() => {
                setRevealed(false)
                if (more > 0) setIndex(index + 1)
                else finish()
              }}
            >
              {more > 0 ? `Next card (${more} more)` : 'Done'}
            </ScButton>
          )}
        </div>
      )}
    </ScSheet>
  )
}
