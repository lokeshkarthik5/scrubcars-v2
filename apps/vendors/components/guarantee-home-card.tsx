'use client'

import Link from 'next/link'
import { IconChevronRight, IconShieldCheck } from '@tabler/icons-react'
import { ScCard } from '@repo/ui/sc/card'
import { useGarageClaims, useGuaranteeConfig } from '@repo/core/api/hooks/use-guarantee'

/**
 * Free redo claims (Detlio Guarantee, 0051) on the portal's Home, for the
 * owner seat: how many wait for an answer, or simply the way to the claims
 * page. Nothing while the guarantee is off; the server refuses operators.
 */
export function GuaranteeHomeCard() {
  const config = useGuaranteeConfig()
  const on = config.data?.enabled === true
  const claims = useGarageClaims('open', on)
  if (!on || !claims.data) return null
  const toAnswer = claims.data.items.filter((claim) => claim.canAnswer).length

  return (
    <Link href="/guarantee" className="block">
      <ScCard className="flex items-center gap-3 transition-colors hover:bg-surface-elevated">
        <IconShieldCheck size={22} aria-hidden="true" className="shrink-0 text-text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold text-text-primary">Free redo claims</h2>
          <p className="text-[12px] text-text-secondary">
            {toAnswer > 0
              ? `${toAnswer} to answer within ${claims.data.reviewHours} hours of opening — no answer approves the redo.`
              : 'Before and after photos on every job are your defence if a customer claims.'}
          </p>
        </div>
        <IconChevronRight size={18} aria-hidden="true" className="shrink-0 text-text-secondary" />
      </ScCard>
    </Link>
  )
}
