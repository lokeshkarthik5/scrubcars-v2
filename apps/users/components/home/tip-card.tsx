'use client'

import { useState } from 'react'
import { IconBulb, IconX } from '@tabler/icons-react'
import type { CarTip } from '@repo/core/api/home'
import { istDateKey } from '@repo/core/home-display'
import { TIP_HIDDEN_KEY } from '@/lib/home-hub'

const SEASON_LABELS: Record<CarTip['season'], string | null> = {
  all_year: null,
  summer: 'Summer',
  pre_monsoon: 'Before the rains',
  monsoon: 'Monsoon',
}

function hiddenToday(now: Date): boolean {
  try {
    return window.localStorage.getItem(TIP_HIDDEN_KEY) === istDateKey(now)
  } catch {
    return false
  }
}

/**
 * The car-care tip, always the last card (owner decision D10): one a day,
 * the same all day, from the owner's vetted list on the server. × hides it
 * until tomorrow, on this phone only — the one Home dismissal not kept on the
 * server, since tomorrow brings a different tip anyway.
 */
export function TipCard({ tip, now }: { tip: CarTip; now: Date }) {
  // Read on first render: Home is client-only (it waits for the session), so
  // there is no server render for this to disagree with.
  const [hidden, setHidden] = useState(() => hiddenToday(now))
  if (hidden) return null

  const season = SEASON_LABELS[tip.season]
  const hide = () => {
    try {
      window.localStorage.setItem(TIP_HIDDEN_KEY, istDateKey(now))
    } catch {
      // Storage blocked: hidden for this visit only.
    }
    setHidden(true)
  }

  return (
    <section aria-label="Car care tip" className="hub-card p-5">
      <div className="flex h-5 items-center justify-between">
        <span className="flex items-center gap-1.5 text-[13px] text-dim">
          <IconBulb size={15} stroke={1.5} aria-hidden className="text-text-muted" />
          Car care tip{season ? ` · ${season}` : ''}
        </span>
        <button
          type="button"
          onClick={hide}
          aria-label="Hide tip until tomorrow"
          className="-my-3 -mr-3 grid size-11 place-items-center text-dim"
        >
          <IconX size={20} stroke={1.5} aria-hidden />
        </button>
      </div>
      <p className="mt-3 text-[17px] font-medium tracking-[-0.012em] text-text-primary">{tip.category}</p>
      <p className="mt-1 text-[15px] leading-[1.42] text-[#A1A1AA]">{tip.text}</p>
    </section>
  )
}
