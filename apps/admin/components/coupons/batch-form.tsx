'use client'

import { useMemo, useState } from 'react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScCheckbox } from '@repo/ui/sc/checkbox'
import { ScInput } from '@repo/ui/sc/input'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { ScSelect } from '@repo/ui/sc/select'
import type {
  AdminCouponConfig,
  CreateCouponBatchPayload,
} from '@repo/core/api/coupons'
import { useDiscountVendorOptions } from '@repo/core/api/hooks/use-discounts'
import { CATEGORY_LABELS } from '@repo/core/categories'
import type { CouponKind, CouponOffer, CouponReward } from '@repo/core/coupons'
import type { ServiceCategory } from '@repo/core/types'
import { rememberName, rememberedName } from '@/lib/actor-name'
import { todayIst } from '@/lib/bookings'
import { wholeOrNull } from '@/lib/coupons'
import { CouponPreview } from '@/components/coupons/coupon-preview'

const REWARD_LABELS: Record<CouponReward, string> = {
  amount: '₹ off',
  percent: '% off, with a cap',
  free_wash: 'A free car wash, up to ₹',
  stamps: 'Bonus Shine stamps',
}

const CATEGORIES: ServiceCategory[] = [
  'car_wash',
  'detailing',
  'coating',
  'scratch_removal',
  'others',
  'package',
]

function plusDays(dateKey: string, days: number): string {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

/**
 * A new batch of printed coupons. Defaults: 100 unique codes, ₹100 off a
 * booking of ₹499 or more, at any garage, from today for 60 days. Bonus
 * stamps are offered only while Detlio Rewards is live. The server checks
 * the whole batch again and answers every problem in words.
 */
export function BatchForm({
  config,
  isPending,
  error,
  onSubmit,
  onCancel,
}: {
  config: AdminCouponConfig
  isPending: boolean
  error: string | null
  onSubmit: (payload: CreateCouponBatchPayload) => void
  onCancel: () => void
}) {
  const vendors = useDiscountVendorOptions()
  const today = todayIst()
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [kind, setKind] = useState<CouponKind>('unique')
  const [count, setCount] = useState('100')
  const [cap, setCap] = useState('')
  const [reward, setReward] = useState<CouponReward>('amount')
  const [amount, setAmount] = useState('100')
  const [percent, setPercent] = useState('20')
  const [maxDiscount, setMaxDiscount] = useState('200')
  const [stamps, setStamps] = useState('1')
  const [minOrder, setMinOrder] = useState('499')
  const [vendorId, setVendorId] = useState('')
  const [category, setCategory] = useState<ServiceCategory | ''>('')
  const [newOnly, setNewOnly] = useState(false)
  const [validFrom, setValidFrom] = useState(today)
  const [validTo, setValidTo] = useState(plusDays(today, 60))
  const [actorName, setActorName] = useState(rememberedName)

  const isStamps = reward === 'stamps'
  const vendorName =
    vendors.data?.find((v) => v.id === vendorId)?.businessName ?? null

  const offer: CouponOffer = useMemo(
    () => ({
      reward,
      amountOff:
        reward === 'amount' || reward === 'free_wash'
          ? wholeOrNull(amount)
          : null,
      percentOff: reward === 'percent' ? wholeOrNull(percent) : null,
      maxDiscount: reward === 'percent' ? wholeOrNull(maxDiscount) : null,
      stamps: isStamps ? wholeOrNull(stamps) : null,
      minOrder: isStamps ? null : wholeOrNull(minOrder),
      serviceCategory:
        reward === 'free_wash'
          ? 'car_wash'
          : isStamps
            ? null
            : category || null,
      vendorName: isStamps ? null : vendorName,
      newCustomersOnly: newOnly,
    }),
    [
      reward,
      amount,
      percent,
      maxDiscount,
      stamps,
      minOrder,
      category,
      vendorName,
      newOnly,
      isStamps,
    ]
  )

  const canSubmit =
    name.trim().length >= 3 &&
    location.trim().length >= 3 &&
    actorName.trim().length >= 2 &&
    !isPending

  const submit = () => {
    if (!canSubmit) return
    rememberName(actorName.trim())
    onSubmit({
      name: name.trim(),
      location: location.trim(),
      kind,
      count: kind === 'unique' ? (wholeOrNull(count) ?? 0) : 1,
      maxRedemptions: kind === 'shared' ? wholeOrNull(cap) : null,
      reward,
      amountOff: offer.amountOff,
      percentOff: offer.percentOff,
      maxDiscount: offer.maxDiscount,
      stamps: offer.stamps,
      minOrder: offer.minOrder,
      serviceCategory:
        reward === 'free_wash' || isStamps ? null : category || null,
      vendorId: isStamps ? null : vendorId || null,
      newCustomersOnly: newOnly,
      validFrom,
      validTo,
      actorName: actorName.trim(),
    })
  }

  const rewards = (Object.keys(REWARD_LABELS) as CouponReward[]).filter(
    (r) => r !== 'stamps' || config.rewardsLive
  )

  return (
    <form
      className="grid w-full gap-4 md:grid-cols-[minmax(0,1fr)_320px] md:items-start"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="flex min-w-0 flex-col gap-4">
        <ScCard className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-text-primary">
            Campaign
          </h2>
          <ScInput
            id="coupon-name"
            label="Name"
            placeholder="Diwali flyers"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <ScInput
            id="coupon-location"
            label="Where it is given out"
            placeholder="Anna Nagar flyer, Garage counter — Marina Auto Spa"
            maxLength={120}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <p className="text-[12px] text-text-muted">
            Only the team sees these. Every coupon added is counted against this
            place.
          </p>
        </ScCard>

        <ScCard className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-text-primary">Codes</h2>
          <ScSegmented<CouponKind>
            aria-label="Kind of codes"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'unique', label: 'Unique codes' },
              { value: 'shared', label: 'One shared code' },
            ]}
          />
          {kind === 'unique' ? (
            <>
              <ScInput
                id="coupon-count"
                label={`How many (up to ${config.limits.maxCodes.toLocaleString('en-IN')})`}
                inputMode="numeric"
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
              <p className="text-[12px] text-text-muted">
                Each card or flyer gets its own QR, used once.
              </p>
            </>
          ) : (
            <>
              <ScInput
                id="coupon-cap"
                label="Most customers who can add it (optional)"
                inputMode="numeric"
                placeholder="No limit"
                value={cap}
                onChange={(e) => setCap(e.target.value)}
              />
              <p className="text-[12px] text-text-muted">
                For a poster or standee: one QR, once per customer.
              </p>
            </>
          )}
        </ScCard>

        <ScCard className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-text-primary">
            Reward
          </h2>
          <ScSelect
            id="coupon-reward"
            label="What it gives"
            value={reward}
            onChange={(e) => setReward(e.target.value as CouponReward)}
          >
            {rewards.map((r) => (
              <option key={r} value={r}>
                {REWARD_LABELS[r]}
              </option>
            ))}
          </ScSelect>
          {!config.rewardsLive && (
            <p className="text-[12px] text-text-muted">
              Bonus stamps can be offered while Detlio Rewards is on.
            </p>
          )}
          {(reward === 'amount' || reward === 'free_wash') && (
            <ScInput
              id="coupon-amount"
              label={
                reward === 'free_wash' ? 'The wash is free up to ₹' : '₹ off'
              }
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
          {reward === 'percent' && (
            <div className="grid grid-cols-2 gap-3">
              <ScInput
                id="coupon-percent"
                label="% off"
                inputMode="numeric"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
              />
              <ScInput
                id="coupon-max"
                label="Up to ₹"
                inputMode="numeric"
                value={maxDiscount}
                onChange={(e) => setMaxDiscount(e.target.value)}
              />
            </div>
          )}
          {isStamps && (
            <ScInput
              id="coupon-stamps"
              label={`Stamps (1–${config.limits.maxStamps})`}
              inputMode="numeric"
              value={stamps}
              onChange={(e) => setStamps(e.target.value)}
            />
          )}
          {!isStamps && (
            <>
              <ScInput
                id="coupon-min"
                label="Minimum booking ₹ (optional)"
                inputMode="numeric"
                placeholder="No minimum"
                value={minOrder}
                onChange={(e) => setMinOrder(e.target.value)}
              />
              <ScSelect
                id="coupon-vendor"
                label="Garage"
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
              >
                <option value="">Any garage</option>
                {(vendors.data ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.businessName}
                  </option>
                ))}
              </ScSelect>
              {reward !== 'free_wash' && (
                <ScSelect
                  id="coupon-category"
                  label="Service type"
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as ServiceCategory | '')
                  }
                >
                  <option value="">Any service</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </ScSelect>
              )}
            </>
          )}
          <ScCheckbox
            label="New customers only (no paid booking yet)"
            checked={newOnly}
            onChange={setNewOnly}
          />
        </ScCard>

        <ScCard className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-text-primary">Dates</h2>
          <div className="grid grid-cols-2 gap-3">
            <ScInput
              id="coupon-from"
              type="date"
              label="First day"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
            />
            <ScInput
              id="coupon-to"
              type="date"
              label="Last day"
              min={today}
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
            />
          </div>
          <p className="text-[12px] text-text-muted">
            Customers can add it and use it from the first day to the end of the
            last (Chennai time). A coupon added on the last day still has to be
            used that day.
          </p>
        </ScCard>

        <ScCard className="flex flex-col gap-3">
          <ScInput
            id="coupon-actor"
            label="Your name"
            autoComplete="name"
            maxLength={100}
            value={actorName}
            onChange={(e) => setActorName(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-[12px] text-error">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <ScButton
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={isPending}
              className="min-h-11"
            >
              Cancel
            </ScButton>
            <ScButton type="submit" disabled={!canSubmit} className="min-h-11">
              {isPending ? 'Creating…' : 'Create batch'}
            </ScButton>
          </div>
        </ScCard>
      </div>

      <div className="flex flex-col gap-3 md:sticky md:top-20">
        <CouponPreview offer={offer} validTo={validTo} />
        <p className="text-[12px] text-text-muted">
          Detlio pays for every coupon: the garage is paid its full price.{' '}
          {kind === 'unique' && (offer.amountOff ?? offer.maxDiscount)
            ? `If every code is used, it costs up to ₹${((wholeOrNull(count) ?? 0) * (offer.amountOff ?? offer.maxDiscount ?? 0)).toLocaleString('en-IN')}.`
            : ''}
        </p>
      </div>
    </form>
  )
}
