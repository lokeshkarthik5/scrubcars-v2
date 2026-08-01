'use client'

import { ScBadge, vendorStatusBadge } from '@/components/sc/badge'
import { ScCard } from '@/components/sc/card'
import { StarRating } from '@/components/sc/stars'
import { IconBuildingStore } from '@tabler/icons-react'
import Image from 'next/image'
import Link from 'next/link'
import type { Vendor } from '@/lib/types'

export function VendorCard({ vendor }: { vendor: Vendor }) {
  const status = vendorStatusBadge(vendor.status)

  return (
    <Link href={`/garage/${vendor.id}`}>
      <ScCard className="flex flex-col gap-2 transition-colors hover:border-brand-red/30">
        <div className="flex items-start gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-accent-muted">
            {vendor.logoUrl ? (
              <Image
                src={vendor.logoUrl}
                alt={vendor.name}
                fill
                sizes="40px"
                className="object-cover"
              />
            ) : (
              <IconBuildingStore size={20} className="text-brand-red" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[13px] font-semibold text-text-primary">{vendor.name}</p>
                <p className="text-[11px] text-text-secondary">
                  {vendor.area} · {vendor.distance}
                </p>
              </div>
              <ScBadge variant={status.variant}>{status.label}</ScBadge>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <StarRating rating={vendor.rating} reviewCount={vendor.reviewCount} />
          <span className="text-[13px] font-semibold text-text-primary">
            from ₹{vendor.startingPrice}
          </span>
        </div>
        {vendor.serviceTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {vendor.serviceTags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-surface-elevated px-2 py-0.5 text-[10px] text-text-secondary"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </ScCard>
    </Link>
  )
}
