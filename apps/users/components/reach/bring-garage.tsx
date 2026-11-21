'use client'

import { useState } from 'react'
import { IconGift } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { bringGarageCardWords, bringGarageRowLabel, referralAmountLabel } from '@repo/core/bring-garage'
import { fill } from '@repo/core/i18n'
import { RecommendSheet, useCustomerZone } from '@/components/reach/free-wash'
import { ScCard } from '@/components/ui/card'

/**
 * "Know a good garage? Bring it to Detlio" (Bring your garage, mockup
 * screen 1): the last thing on the garage list, in every area, above
 * "Nothing here suits you?". The button is the white outline, so it never
 * competes with the garage cards; it opens the Recommend sheet, sent from
 * the customer's area when we know it (Coverage files it there). In a small
 * city it stands where the quiet "Know a great garage in <City>?" row was,
 * never beside it.
 */
export function BringGarageCard() {
  const zone = useCustomerZone()
  const [open, setOpen] = useState(false)
  const words = bringGarageCardWords()
  return (
    <>
      <section
        aria-labelledby="bring-garage-title"
        data-bring-garage-card=""
        className="fx-raised flex flex-col gap-4 rounded-[20px] p-4"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/[0.06] text-success" aria-hidden>
            <IconGift size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="bring-garage-title" className="text-t3 font-medium text-text-primary">
              {words.title}
            </h2>
            <p className="mt-0.5 text-t4 text-text-secondary">
              {fill(words.body, { amount: <strong className="font-semibold text-text-primary">{referralAmountLabel()}</strong> })}
            </p>
          </div>
        </div>
        <ScButton variant="outline" onClick={() => setOpen(true)}>
          {words.action}
        </ScButton>
      </section>
      <RecommendSheet open={open} onClose={() => setOpen(false)} zoneSlug={zone?.slug ?? null} />
    </>
  )
}

/**
 * Profile's "Bring your garage · Get ₹500" (mockup screen 5), under Gift a
 * wash: the same Recommend sheet. Always shown, even while Detlio credit
 * and Gift a wash are hidden (the credit is owed until they are on).
 */
export function BringGarageRow() {
  const zone = useCustomerZone()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-bring-garage-row="" className="block w-full text-left">
        <ScCard className="text-t4 text-text-primary">{bringGarageRowLabel()}</ScCard>
      </button>
      <RecommendSheet open={open} onClose={() => setOpen(false)} zoneSlug={zone?.slug ?? null} />
    </>
  )
}
