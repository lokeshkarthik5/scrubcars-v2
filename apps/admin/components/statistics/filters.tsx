'use client'

import type { ReactNode } from 'react'
import {
  IconBuildingStore,
  IconCalendar,
  IconCar,
  IconChevronDown,
} from '@tabler/icons-react'
import { ScSwitch } from '@repo/ui/sc/switch'
import { useAdminVendors } from '@repo/core/api/hooks/use-admin-vendors'
import { cn } from '@repo/core/utils'

/**
 * A native select with an icon in front: the phone's own picker opens on a
 * tap, which on the owner's phone is easier than any drawn dropdown. Drawn
 * like ScSelect, 44px tall, with the name a screen reader needs in place of a
 * visible label (the icon and the value say what it is).
 */
function IconSelect({
  icon,
  label,
  value,
  onChange,
  children,
}: {
  icon: ReactNode
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <div className="relative min-w-0">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
      >
        {icon}
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'h-11 w-full appearance-none truncate rounded-[10px] border border-border bg-surface pl-9 pr-8 text-[13px] text-text-primary outline-none transition-colors',
          'focus:border-text-secondary focus-visible:ring-2 focus-visible:ring-text-primary/70'
        )}
      >
        {children}
      </select>
      <IconChevronDown
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted"
      />
    </div>
  )
}

/** The period: one of the presets, or (Commission) one of the months. */
export function PeriodSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: ReadonlyArray<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <IconSelect
      icon={<IconCalendar size={16} stroke={1.5} />}
      label="Period"
      value={value}
      onChange={onChange}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </IconSelect>
  )
}

/** Every garage, or one. Fed by the same list as the Vendors page. */
export function GarageSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (vendorId: string) => void
}) {
  const { data: vendors = [] } = useAdminVendors()
  const sorted = [...vendors].sort((a, b) =>
    a.businessName.localeCompare(b.businessName)
  )
  // A garage in the URL that the list doesn't have (yet, or any more) still
  // shows as picked rather than silently reading "All garages".
  const unknown = value !== '' && !sorted.some((vendor) => vendor.id === value)

  return (
    <IconSelect
      icon={<IconBuildingStore size={16} stroke={1.5} />}
      label="Garage"
      value={value}
      onChange={onChange}
    >
      <option value="">All garages</option>
      {unknown && <option value={value}>One garage</option>}
      {sorted.map((vendor) => (
        <option key={vendor.id} value={vendor.id}>
          {vendor.businessName}
        </option>
      ))}
    </IconSelect>
  )
}

/** The Funnel's booking type: all, or one. */
export function ModeSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: ReadonlyArray<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <IconSelect
      icon={<IconCar size={16} stroke={1.5} />}
      label="Booking type"
      value={value}
      onChange={onChange}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </IconSelect>
  )
}

/** "Compare with previous 30 days", with the two periods' dates under it. */
export function CompareToggle({
  checked,
  onChange,
  title,
  dates,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  title: string
  dates: string
}) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-3 rounded-[10px] border border-border py-1 pl-3 pr-1.5">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-text-primary">{title}</p>
        <p className="font-numeric text-[12px] text-text-muted">{dates}</p>
      </div>
      <ScSwitch checked={checked} onChange={onChange} label={title} />
    </div>
  )
}
