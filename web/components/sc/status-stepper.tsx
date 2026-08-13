'use client'

import { IconCheck } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

type StepKey = 'confirmed' | 'in_progress' | 'completed'

const statusToStep: Record<string, StepKey> = {
  pending: 'confirmed',
  confirmed: 'confirmed',
  in_progress: 'in_progress',
  completed: 'completed',
}

const ORDER: StepKey[] = ['confirmed', 'in_progress', 'completed']

// The first step reads differently before and after the vendor accepts.
function steps(status: string) {
  const awaitingVendor = status === 'pending'
  return [
    {
      key: 'confirmed' as const,
      label: awaitingVendor ? 'Waiting' : 'Confirmed',
      caption: awaitingVendor ? 'Waiting for confirmation' : 'Confirmed successfully',
    },
    { key: 'in_progress' as const, label: 'In Progress', caption: 'Pending detailing' },
    { key: 'completed' as const, label: 'Completed', caption: 'Pending ready state' },
  ]
}

export function StatusStepper({ status }: { status: string }) {
  const currentIndex = ORDER.indexOf(statusToStep[status] ?? 'confirmed')
  const awaitingVendor = status === 'pending'

  return (
    <div className="flex flex-col">
      {steps(status).map((step, i) => {
        const done = i < currentIndex || (i === currentIndex && !awaitingVendor)
        const current = i === currentIndex
        const isLast = i === ORDER.length - 1

        return (
          <div key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2',
                  done
                    ? 'border-brand-white bg-brand-white'
                    : current
                      ? 'border-brand-white'
                      : 'border-text-muted'
                )}
              >
                {done && <IconCheck size={13} stroke={3} className="text-brand-black" />}
              </div>
              {!isLast && (
                <div className={cn('my-1 min-h-[22px] w-px flex-1', done ? 'bg-brand-white/30' : 'bg-border')} />
              )}
            </div>
            <div className={cn(isLast ? 'pb-0' : 'pb-4', 'pt-0')}>
              <p
                className={cn(
                  'text-[14px] font-semibold leading-tight',
                  done || current ? 'text-text-primary' : 'text-text-muted'
                )}
              >
                {step.label}
              </p>
              <p
                className={cn(
                  'mt-0.5 text-[12px] leading-tight',
                  done || current ? 'text-text-secondary' : 'text-text-muted'
                )}
              >
                {step.caption}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
