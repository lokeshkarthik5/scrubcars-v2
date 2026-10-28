'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { IconScan } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@/components/ui/card'
import { ScInput } from '@repo/ui/sc/input'
import { ApiError } from '@repo/core/api/client'
import { redeemCoupon, type MyCoupon } from '@repo/core/api/coupons'
import { invalidateCoupons } from '@repo/core/api/hooks/use-coupons'
import { track } from '@repo/core/analytics'
import {
  couponCodeProblem,
  formatCouponCode,
  parseCouponCode,
  type RedeemChannel,
} from '@repo/core/coupons'
import {
  CouponScanner,
  canScanCoupons,
} from '@/components/coupons/coupon-scanner'

/**
 * "Have a coupon?": the code off a printed coupon, typed (dashes, spaces
 * and the DTL in front are fine), or read with the camera where the browser
 * can. A typo is caught here before anything is sent; every other refusal
 * (a wrong code, already used, expired, too many tries) is the server's own
 * sentence.
 */
export function CouponCodeBox({
  onAdded,
}: {
  onAdded?: (coupon: MyCoupon | null) => void
}) {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [canScan, setCanScan] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null
  )

  // After mount: the server never knows whether this phone can scan.
  useEffect(() => {
    let live = true
    void canScanCoupons().then((can) => live && setCanScan(can))
    return () => {
      live = false
    }
  }, [])

  const add = async (raw: string, channel: RedeemChannel) => {
    if (busy) return
    const problem = couponCodeProblem(raw)
    if (problem) {
      setResult({ ok: false, text: problem })
      return
    }
    setBusy(true)
    setResult(null)
    try {
      const { coupon } = await redeemCoupon(raw, channel)
      track('coupon_redeem', { source: channel })
      setCode('')
      setResult({
        ok: true,
        text: coupon ? `Added: ${coupon.title}.` : 'Coupon added.',
      })
      void invalidateCoupons(queryClient)
      onAdded?.(coupon)
    } catch (error) {
      setResult({
        ok: false,
        text:
          error instanceof ApiError
            ? error.message
            : "Couldn't add that coupon. Check your connection and try again.",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScCard className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void add(code.trim(), 'typed')
        }}
      >
        <ScInput
          data-clarity-mask="true"
          label="Have a coupon?"
          placeholder="DTL-7K4QM-92MXA"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="font-numeric tracking-wide"
        />
        <div className="flex gap-2">
          <ScButton
            type="submit"
            variant="secondary"
            disabled={!code.trim() || busy}
            className="min-h-11 flex-1"
          >
            {busy ? 'Adding…' : 'Add coupon'}
          </ScButton>
          {canScan && (
            <ScButton
              type="button"
              variant="secondary"
              fullWidth={false}
              disabled={busy}
              onClick={() => setScanning(true)}
              className="min-h-11 gap-1.5 px-4"
            >
              <IconScan size={16} aria-hidden="true" />
              Scan
            </ScButton>
          )}
        </div>
      </form>
      {result && (
        <p
          role={result.ok ? 'status' : 'alert'}
          className={
            result.ok ? 'text-[12px] text-success' : 'text-[12px] text-error'
          }
        >
          {result.text}
        </p>
      )}
      {scanning && (
        <CouponScanner
          onClose={() => setScanning(false)}
          onCode={(scanned) => {
            setScanning(false)
            const parsed = parseCouponCode(scanned)
            if (parsed.ok) setCode(formatCouponCode(parsed.code))
            void add(scanned, 'camera')
          }}
        />
      )}
    </ScCard>
  )
}
