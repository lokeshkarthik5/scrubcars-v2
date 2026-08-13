'use client'

import Image from 'next/image'
import Link from 'next/link'
import { IconBuildingStore, IconStarFilled } from '@tabler/icons-react'
import type { Vendor } from '@/lib/types'

function ModeBadge({ label, tone }: { label: string; tone: 'garage' | 'doorstep' }) {
  return (
    <span
      className={
        tone === 'garage'
          ? 'rounded-md bg-success-muted px-2 py-0.5 text-[10px] font-medium text-success'
          : 'rounded-md bg-surface-elevated px-2 py-0.5 text-[10px] font-medium text-text-secondary'
      }
    >
      {label}
    </span>
  )
}

export function VendorCard({ vendor }: { vendor: Vendor }) {
  const cover = vendor.photos[0] ?? vendor.logoUrl
  const hasDistance = /\d/.test(vendor.distance)

  return (
    <Link href={`/garage/${vendor.id}`}>
      <article className="overflow-hidden rounded-[16px] border border-border bg-surface transition-colors hover:border-brand-red/30">
        <div className="relative h-[150px] w-full bg-surface-elevated">
          {cover ? (
            <Image
              src={cover}
              alt={vendor.name}
              fill
              sizes="(max-width: 428px) 100vw, 428px"
              className="object-cover"
            />
          ) : (
            // No vendor photo on file — a neutral placeholder rather than stock
            // imagery, so the card never implies a photo we don't have.
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-elevated to-surface">
              <IconBuildingStore size={30} className="text-text-muted" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5 px-3.5 py-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text-primary">
              {vendor.name}
            </h3>
            <div className="flex shrink-0 gap-1.5">
              {vendor.dropinEnabled && <ModeBadge label="At Garage" tone="garage" />}
              {vendor.doorstepEnabled && <ModeBadge label="Doorstep" tone="doorstep" />}
            </div>
          </div>

          {/* The list endpoint has no geo, so `distance` arrives as an em-dash
              placeholder; skip it (and a ₹0 floor) rather than render a blank fact. */}
          <div className="flex items-center gap-1.5 text-[12px] text-text-secondary">
            <IconStarFilled size={12} className="text-warning" />
            <span className="font-medium text-text-primary">{vendor.rating.toFixed(1)}</span>
            {hasDistance && (
              <>
                <span>·</span>
                <span>{vendor.distance}</span>
              </>
            )}
            {vendor.startingPrice > 0 && (
              <>
                <span>·</span>
                <span>From ₹{vendor.startingPrice}</span>
              </>
            )}
          </div>
        </div>
      </article>
    </Link>
  )
}
