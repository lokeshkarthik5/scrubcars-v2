'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { useSetBirthday } from '@repo/core/api/hooks/use-rewards'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** The optional birthday (month and day, no year) for the birthday wash. */
export function BirthdayForm({ birthday, perkFrom }: { birthday: { month: number; day: number } | null; perkFrom: string | null }) {
  const save = useSetBirthday()
  const [month, setMonth] = useState(birthday?.month ?? 0)
  const [day, setDay] = useState(birthday?.day ?? 0)
  const days = month ? new Date(Date.UTC(2024, month, 0)).getUTCDate() : 31
  const changed = month !== (birthday?.month ?? 0) || day !== (birthday?.day ?? 0)

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-text-secondary">
        {perkFrom ? `From ${perkFrom}, a wash on us in your birthday month.` : 'Your birthday, for birthday treats.'} Only the day and month.
      </p>
      <div className="grid grid-cols-[1fr_88px] gap-2">
        <label className="sr-only" htmlFor="birthday-month">Month</label>
        <select
          id="birthday-month"
          value={month}
          onChange={(e) => {
            const m = Number(e.target.value)
            setMonth(m)
            if (day > new Date(Date.UTC(2024, m, 0)).getUTCDate()) setDay(0)
          }}
          className="h-10 rounded-[10px] border border-border bg-surface px-3 text-[14px] text-text-primary"
        >
          <option value={0}>Month</option>
          {MONTHS.map((name, i) => (
            <option key={name} value={i + 1}>{name}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="birthday-day">Day</label>
        <select
          id="birthday-day"
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
          className="h-10 rounded-[10px] border border-border bg-surface px-3 font-numeric text-[14px] text-text-primary"
        >
          <option value={0}>Day</option>
          {Array.from({ length: days }, (_, i) => (
            <option key={i + 1} value={i + 1}>{i + 1}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <ScButton
          variant="secondary"
          className="h-9 w-auto px-4 text-[13px]"
          disabled={!changed || !month || !day || save.isPending}
          onClick={() =>
            save.mutate({ month, day }, {
              onSuccess: () => toast.success('Birthday saved'),
              onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't save it"),
            })
          }
        >
          Save
        </ScButton>
        {birthday && (
          <button
            type="button"
            className="text-[12px] text-text-secondary underline underline-offset-4"
            disabled={save.isPending}
            onClick={() =>
              save.mutate(null, {
                onSuccess: () => {
                  setMonth(0)
                  setDay(0)
                },
              })
            }
          >
            Remove
          </button>
        )}
      </div>
    </div>
  )
}
