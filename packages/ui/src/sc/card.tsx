import { cn } from '@repo/core/utils'
import { type HTMLAttributes } from 'react'

export function ScCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[14px] border border-border bg-surface px-3.5 py-3',
        className
      )}
      {...props}
    />
  )
}
