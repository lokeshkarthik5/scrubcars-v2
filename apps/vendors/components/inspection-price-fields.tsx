'use client'

import { useT } from '@repo/core/i18n'
import { ScInput } from '@repo/ui/sc/input'
import { approxInvalid } from '@/lib/inspection-price'

/**
 * The price boxes of an On inspection service (0073): the inspection fee,
 * optional (empty is a free inspection), a small approx price, also
 * optional, and one line saying what each means. The garage app draws the
 * same boxes and words (apps/vendors-app/components/services/pricing-block.tsx).
 */
export function InspectionPriceFields({
  fee,
  approx,
  onFee,
  onApprox,
  idPrefix,
}: {
  fee: string
  approx: string
  onFee: (value: string) => void
  onApprox: (value: string) => void
  /** Keeps the ids unique when two forms are on one page. */
  idPrefix: string
}) {
  const t = useT()
  const invalid = approxInvalid(approx)
  return (
    <div className="flex flex-col gap-2">
      <ScInput
        id={`${idPrefix}-inspection-fee`}
        label={t('Inspection fee (optional)')}
        type="number"
        inputMode="decimal"
        min={0}
        className="font-numeric"
        value={fee}
        onChange={(e) => onFee(e.target.value)}
      />
      <ScInput
        id={`${idPrefix}-approx-price`}
        label={t('Approx price (optional)')}
        type="number"
        inputMode="decimal"
        min={0}
        className="font-numeric"
        value={approx}
        aria-invalid={invalid || undefined}
        aria-describedby={`${idPrefix}-approx-hint`}
        onChange={(e) => onApprox(e.target.value)}
      />
      {invalid ? (
        <p id={`${idPrefix}-approx-hint`} role="alert" className="text-[11px] text-error">
          {t('Enter an approx price above ₹0, or leave it empty.')}
        </p>
      ) : (
        <p id={`${idPrefix}-approx-hint`} className="text-[11px] text-text-muted">
          {t('Leave the fee empty for a free inspection. The approx price is only a guide; you send the final bill after seeing the car.')}
        </p>
      )}
    </div>
  )
}
