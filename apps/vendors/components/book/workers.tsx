'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import type { TeamWorker } from '@repo/core/api/garage-book'
import { useBookTeam, useSetJobWorkers } from '@repo/core/api/hooks/use-garage-book'
import { useT } from '@repo/core/i18n'
import { LightChip, Overline, errorText } from './parts'

/**
 * "Done by" (T1's "When you finish a job · who did it?"): one chip per team
 * member, the red light under whoever did it. Each tap saves the whole set
 * (PUT /jobs/:ref/workers), so there is nothing else to press. Any seat may
 * set it; with no team written down it shows nothing at all.
 */
export function DoneBy({ jobRef, initial, title }: { jobRef: string; initial: TeamWorker[] | undefined; title?: string }) {
  const t = useT()
  const team = useBookTeam(undefined)
  const save = useSetJobWorkers()
  const [chosen, setChosen] = useState<string[]>(() => (initial ?? []).map((worker) => worker.id))
  const members = team.data?.members ?? []
  if (members.length === 0) return null

  const toggle = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]
    const before = chosen
    setChosen(next)
    save.mutate(
      { ref: jobRef, memberIds: next },
      {
        onError: (error) => {
          setChosen(before)
          toast.error(errorText(error, t("Couldn't save that. Try again.")))
        },
      }
    )
  }

  return (
    <div role="group" aria-label={title ?? t('Done by')} className="flex flex-col gap-2">
      <Overline>{title ?? t('Done by')}</Overline>
      <div className="grid grid-cols-3 gap-2">
        {members.map((member) => (
          <LightChip key={member.id} label={member.name.split(/\s+/)[0] ?? member.name} on={chosen.includes(member.id)} onClick={() => toggle(member.id)} />
        ))}
      </div>
    </div>
  )
}
