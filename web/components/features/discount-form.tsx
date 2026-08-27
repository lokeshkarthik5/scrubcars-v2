'use client'

import { useState } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { ScCheckbox } from '@/components/sc/checkbox'
import { ScField, ScTextarea } from '@/components/sc/input'
import { ScSelect } from '@/components/sc/select'
import { useDiscountVendorOptions } from '@/lib/api/hooks/use-discounts'
import type {
  AdminDiscount,
  DiscountFundedBy,
  DiscountInput,
  DiscountType,
} from '@/lib/api/admin'

// Every field is a controlled string, matching the vendor forms. Conversion to
// the wire shape happens once, on submit — the API only ever sees numbers and
// nulls, never the empty strings the inputs produce.
interface FormState {
  code: string
  description: string
  discountType: DiscountType
  percentOff: string
  amountOff: string
  maxDiscountAmount: string
  minOrderAmount: string
  perUserLimit: string
  totalUsageLimit: string
  vendorId: string
  fundedBy: DiscountFundedBy
  startsAt: string
  endsAt: string
  isActive: boolean
}

const EMPTY: FormState = {
  code: '',
  description: '',
  discountType: 'percentage',
  percentOff: '',
  amountOff: '',
  maxDiscountAmount: '',
  minOrderAmount: '',
  perUserLimit: '',
  totalUsageLimit: '',
  vendorId: '',
  fundedBy: 'platform',
  startsAt: '',
  endsAt: '',
  isActive: true,
}

/** `2026-08-27T10:30:00.000Z` → `2026-08-27T16:00`, what the input wants. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}

/** Blank means "unlimited"/"none", which is null on the wire — not 0. */
function optionalNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function toFormState(discount: AdminDiscount): FormState {
  return {
    code: discount.code,
    description: discount.description ?? '',
    discountType: discount.discountType,
    percentOff: discount.percentOff ? String(Number(discount.percentOff)) : '',
    amountOff: discount.amountOff ? String(Number(discount.amountOff)) : '',
    maxDiscountAmount: discount.maxDiscountAmount
      ? String(Number(discount.maxDiscountAmount))
      : '',
    minOrderAmount: discount.minOrderAmount
      ? String(Number(discount.minOrderAmount))
      : '',
    perUserLimit: discount.perUserLimit ? String(discount.perUserLimit) : '',
    totalUsageLimit: discount.totalUsageLimit
      ? String(discount.totalUsageLimit)
      : '',
    vendorId: discount.vendorId ?? '',
    fundedBy: discount.fundedBy,
    startsAt: toLocalInput(discount.startsAt),
    endsAt: toLocalInput(discount.endsAt),
    isActive: discount.isActive,
  }
}

interface DiscountFormProps {
  /** Absent = create. Present = edit that discount. */
  discount?: AdminDiscount
  /** The page owns the mutation; this form only shapes and hands over input. */
  onSubmit: (input: DiscountInput) => void
  isPending: boolean
  /** Message from the failed mutation, if any. */
  error?: string
  onCancel: () => void
}

export function DiscountForm({
  discount,
  onSubmit,
  isPending,
  error,
  onCancel,
}: DiscountFormProps) {
  const [form, setForm] = useState<FormState>(
    discount ? toFormState(discount) : EMPTY
  )
  const { data: vendors = [] } = useDiscountVendorOptions()

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const isPercentage = form.discountType === 'percentage'
  const percentValue = Number(form.percentOff)

  const isValid =
    form.code.trim().length >= 3 &&
    (isPercentage
      ? percentValue > 0 && percentValue <= 99
      : Number(form.amountOff) > 0)

  // A code that takes most of the price off, with nothing bounding how often it
  // can be used, is the expensive mistake here. Nudge rather than block — an
  // uncapped launch offer is a legitimate thing to want.
  const showLimitWarning =
    (isPercentage ? percentValue >= 90 : !form.minOrderAmount.trim()) &&
    !form.perUserLimit.trim() &&
    !form.totalUsageLimit.trim()

  const handleSubmit = () => {
    if (!isValid || isPending) return
    onSubmit({
      code: form.code.trim().toUpperCase(),
      description: form.description.trim() || null,
      discountType: form.discountType,
      // Only the effect that applies is sent; the server clears the other.
      ...(isPercentage
        ? {
            percentOff: Number(form.percentOff),
            maxDiscountAmount: optionalNumber(form.maxDiscountAmount),
          }
        : { amountOff: Number(form.amountOff) }),
      minOrderAmount: optionalNumber(form.minOrderAmount),
      perUserLimit: optionalNumber(form.perUserLimit),
      totalUsageLimit: optionalNumber(form.totalUsageLimit),
      vendorId: form.vendorId || null,
      fundedBy: form.fundedBy,
      startsAt: fromLocalInput(form.startsAt),
      endsAt: fromLocalInput(form.endsAt),
      isActive: form.isActive,
    })
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <ScCard className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold text-text-primary">Code</h2>
        <ScField
          id="code"
          label="Code the customer types"
          placeholder="DIWALI20"
          value={form.code}
          onChange={(value) => set('code', value.toUpperCase())}
          className="uppercase"
        />
        <ScTextarea
          id="description"
          label="Internal note (optional)"
          rows={2}
          placeholder="Diwali launch offer"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </ScCard>

      <ScCard className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold text-text-primary">Discount</h2>
        <ScSelect
          id="discountType"
          label="Type"
          value={form.discountType}
          onChange={(e) => set('discountType', e.target.value as DiscountType)}
        >
          <option value="percentage">Percentage off</option>
          <option value="fixed">Flat amount off</option>
        </ScSelect>

        {isPercentage ? (
          <>
            <ScField
              id="percentOff"
              label="Percent off (max 99)"
              type="number"
              inputMode="decimal"
              placeholder="20"
              value={form.percentOff}
              onChange={(value) => set('percentOff', value)}
            />
            <ScField
              id="maxDiscountAmount"
              label="Maximum discount in ₹ (optional)"
              type="number"
              inputMode="numeric"
              placeholder="No cap"
              value={form.maxDiscountAmount}
              onChange={(value) => set('maxDiscountAmount', value)}
            />
            <p className="text-[11px] text-text-muted">
              Capped at 99% — every booking must leave at least ₹1 to charge.
            </p>
          </>
        ) : (
          <ScField
            id="amountOff"
            label="Amount off in ₹"
            type="number"
            inputMode="numeric"
            placeholder="200"
            value={form.amountOff}
            onChange={(value) => set('amountOff', value)}
          />
        )}
      </ScCard>

      <ScCard className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold text-text-primary">
          Conditions
        </h2>
        <ScField
          id="minOrderAmount"
          label="Minimum booking amount in ₹ (optional)"
          type="number"
          inputMode="numeric"
          placeholder="No minimum"
          value={form.minOrderAmount}
          onChange={(value) => set('minOrderAmount', value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <ScField
            id="perUserLimit"
            label="Uses per customer"
            type="number"
            inputMode="numeric"
            placeholder="Unlimited"
            value={form.perUserLimit}
            onChange={(value) => set('perUserLimit', value)}
          />
          <ScField
            id="totalUsageLimit"
            label="Total uses"
            type="number"
            inputMode="numeric"
            placeholder="Unlimited"
            value={form.totalUsageLimit}
            onChange={(value) => set('totalUsageLimit', value)}
          />
        </div>
        <ScSelect
          id="vendorId"
          label="Garage"
          value={form.vendorId}
          onChange={(e) => set('vendorId', e.target.value)}
        >
          <option value="">All garages</option>
          {vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.businessName}
            </option>
          ))}
        </ScSelect>
        <div className="grid grid-cols-2 gap-3">
          <ScField
            id="startsAt"
            label="Starts (optional)"
            type="datetime-local"
            value={form.startsAt}
            onChange={(value) => set('startsAt', value)}
          />
          <ScField
            id="endsAt"
            label="Ends (optional)"
            type="datetime-local"
            value={form.endsAt}
            onChange={(value) => set('endsAt', value)}
          />
        </div>

        {showLimitWarning && (
          <p className="flex items-start gap-1.5 rounded-[10px] bg-warning-muted/20 p-2.5 text-[11px] text-warning">
            <IconAlertTriangle size={14} className="mt-px shrink-0" />
            This code has no usage limits. One customer could redeem it
            repeatedly — consider setting uses per customer or a total.
          </p>
        )}
      </ScCard>

      <ScCard className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold text-text-primary">Funding</h2>
        <ScSelect
          id="fundedBy"
          label="Who absorbs this discount"
          value={form.fundedBy}
          onChange={(e) => set('fundedBy', e.target.value as DiscountFundedBy)}
        >
          <option value="platform">
            Detlio absorbs it — garage paid in full
          </option>
          <option value="vendor">Garage absorbs it</option>
        </ScSelect>
        <p className="text-[11px] text-text-muted">
          {form.fundedBy === 'platform'
            ? "The garage's earnings show the full pre-discount price; the difference is Detlio's marketing spend."
            : "The garage's earnings show the discounted amount."}
        </p>
        <ScCheckbox
          label="Active"
          checked={form.isActive}
          onChange={(checked) => set('isActive', checked)}
        />
      </ScCard>

      {error && <p className="text-[12px] text-brand-red">{error}</p>}

      <div className="flex items-center gap-2">
        <ScButton disabled={!isValid || isPending} onClick={handleSubmit}>
          {isPending ? 'Saving…' : discount ? 'Save changes' : 'Create discount'}
        </ScButton>
        <ScButton
          variant="secondary"
          fullWidth={false}
          disabled={isPending}
          onClick={onCancel}
          className="px-4"
        >
          Cancel
        </ScButton>
      </div>
    </div>
  )
}
