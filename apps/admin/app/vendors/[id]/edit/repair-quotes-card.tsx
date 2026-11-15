'use client'

import { useId, useState } from 'react'
import { ScSwitch } from '@repo/ui/sc/switch'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import {
  repairQuotesOn,
  useAdminGarageRepairSetting,
  useRepairQuotesConfig,
  useSetAdminGarageRepairSetting,
} from '@repo/core/api/hooks/use-repair-quotes'
import { SavedNote } from '@/components/save-bar'

/**
 * "Repair & bodywork quotes" on the editor's Hours & booking tab (0075):
 * the garage's switch, which saves on tap, and its last 30 days — how often
 * it was asked, how often it answered in time, and how many final bills
 * stayed inside its quote. Only garages with it on are asked, and only one
 * with a free "price on inspection" service can turn it on (a visit books
 * that service). Not there at all while REPAIR_QUOTES_ENABLED is off.
 */
export function RepairQuotesCard({ vendorId, onSaved }: { vendorId: string; onSaved: () => void }) {
  const titleId = useId()
  const config = useRepairQuotesConfig()
  const on = repairQuotesOn(config.data)
  const setting = useAdminGarageRepairSetting(vendorId, on)
  const save = useSetAdminGarageRepairSetting(vendorId)
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState('')
  if (!on || !setting.data) return null
  const data = setting.data

  const change = (enabled: boolean) => {
    setError('')
    setState('saving')
    save.mutate(enabled, {
      onSuccess: () => {
        setState('saved')
        onSaved()
      },
      onError: (err) => {
        setState('idle')
        setError(errorMessage(err, 'Couldn’t save. Try again.'))
      },
    })
  }

  return (
    <section aria-labelledby={titleId} className="mt-4 rounded-[16px] border border-border bg-surface p-4">
      <div className="flex min-h-[22px] items-center justify-between gap-3">
        <h2 id={titleId} className="text-[15px] font-medium tracking-[-0.01em] text-text-primary">
          Repair &amp; bodywork quotes
        </h2>
        <SavedNote state={state} idleText="Saves on tap" />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <span>
          <span className="block text-[15px] text-text-primary">Takes repair &amp; bodywork quotes</span>
          <span className="mt-0.5 block text-[12.5px] text-text-muted">
            Gets customers’ dent and scratch requests with a video. The {data.maxGarages} nearest garages with this on
            are asked.
          </span>
        </span>
        <ScSwitch
          checked={save.isPending ? Boolean(save.variables) : data.enabled}
          onChange={change}
          disabled={save.isPending || (!data.enabled && !data.bookable)}
          label="Takes repair & bodywork quotes"
        />
      </div>
      {!data.bookable && (
        <p className="mt-2 text-[12.5px] text-text-secondary">
          Add a free inspection service first (Price on inspection, no fee): customers book their visit as that.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[12.5px] text-error">
          {error}
        </p>
      )}
      <div className="-mx-4 mt-3.5 grid grid-cols-3 gap-3 border-t border-border px-4 pt-3">
        <div>
          <p className="text-[12px] text-text-secondary">Asked, last 30 days</p>
          <p className="font-numeric text-[15px] font-semibold text-text-primary">{data.asked}</p>
        </div>
        <div>
          <p className="text-[12px] text-text-secondary">Answered in time</p>
          <p className="font-numeric text-[15px] font-semibold text-text-primary">
            {data.answeredInTime} of {data.asked}
          </p>
        </div>
        <div>
          <p className="text-[12px] text-text-secondary">Final bill inside quote</p>
          <p className="font-numeric text-[15px] font-semibold text-text-primary">
            {data.billsInside} of {data.billsTotal}
          </p>
        </div>
      </div>
    </section>
  )
}
