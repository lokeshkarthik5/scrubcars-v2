'use client'

import { IconCheck } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

const STEPS = [
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
] as const

type StepKey = (typeof STEPS)[number]['key']

const statusToStep: Record<string, StepKey> = {
  pending: 'confirmed',
  confirmed: 'confirmed',
  in_progress: 'in_progress',
  completed: 'completed',
}

function getStepIndex(status: string): number {
  const key = statusToStep[status] ?? 'confirmed'
  return STEPS.findIndex((s) => s.key === key)
}

export function StatusStepper({ status }: { status: string }) {
  const currentIndex = getStepIndex(status)

  return (
    <div className="flex flex-col gap-0">
      {STEPS.map((step, i) => {
        const done = i < currentIndex
        const current = i === currentIndex
        const waiting = i > currentIndex

        return (
          <div key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full',
                  done && 'bg-success-muted',
                  current && 'bg-accent-muted pulse-dot',
                  waiting && 'border border-border bg-surface'
                )}
              >
                {done ? (
                  <IconCheck size={14} className="text-success" />
                ) : (
                  <div
                    className={cn(
                      'h-2 w-2 rounded-full',
                      current ? 'bg-brand-red' : 'bg-text-muted'
                    )}
                  />
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    'my-1 w-px flex-1 min-h-[24px]',
                    done ? 'bg-success/30' : 'bg-border'
                  )}
                />
              )}
            </div>
            <div className="pb-5 pt-1">
              <p
                className={cn(
                  'text-[13px] font-medium',
                  done && 'text-success',
                  current && 'text-brand-red',
                  waiting && 'text-text-muted'
                )}
              >
                {step.label}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
