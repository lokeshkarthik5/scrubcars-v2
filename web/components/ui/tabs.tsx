'use client'

import * as React from 'react'
import { Tabs as TabsPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

/**
 * Tabs, on Radix's primitive.
 *
 * The primitive is the reason this exists — roving focus, arrow-key
 * navigation, correct `role="tab"`/`aria-selected` wiring and the
 * tab↔panel association are all things a handful of buttons would get wrong.
 *
 * The styling is NOT shadcn's default. That ships against `bg-muted`,
 * `text-foreground`, `ring-ring` and friends, none of which this app's theme
 * defines — it has its own palette (`surface`, `text-primary`, `brand-red`), so
 * the generated classes would fail the Tailwind build outright. What is here
 * instead is the segmented-control idiom the app already uses for the
 * At Garage / Doorstep switch, so tabs read as native rather than imported.
 */

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-4', className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn('flex rounded-[12px] bg-surface p-1', className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 rounded-[9px] py-2.5 text-[13px] font-medium text-text-secondary transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/60',
        'disabled:pointer-events-none disabled:opacity-40',
        // Radix sets data-state="active". The selected tab is marked by a
        // raised surface plus the brand colour as an accent — red hairline and
        // label — kept byte-identical to ScSegmented so the two never drift
        // into looking like different controls.
        'data-[state=active]:bg-surface-elevated data-[state=active]:text-brand-red data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-brand-red/50',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        'flex flex-col gap-5 outline-none',
        // Panels are mounted only when selected, so the map inside the Location
        // tab is not constructing a WebGL context behind three hidden panels.
        className
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
