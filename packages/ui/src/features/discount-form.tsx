'use client'

import { useState } from 'react'
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScCheckbox } from '@repo/ui/sc/checkbox'
import { ScField, ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { ScSelect } from '@repo/ui/sc/select'
import { ScSwitch } from '@repo/ui/sc/switch'
import { ApiError } from '@repo/core/api/client'
import {
  errorMessage,
  useAdminDiscounts,
  useDiscountHomeConfig,
  useDiscountHomeReach,
  useDiscountVendorOptions,
} from '@repo/core/api/hooks/use-discounts'
import type {
  AdminDiscount,
  DiscountFundedBy,
  DiscountInput,
  DiscountType,
  HomeAudience,
  HomeCarType,
  HomePriority,
  HomeReachParams,
} from '@repo/core/api/admin'
import { bannedPhraseIn } from '@repo/core/copy-rules'
import { useDebounced } from '@repo/core/hooks/use-debounced'
import { useNow } from '@repo/core/hooks/use-now'
import {
  audienceOptions,
  audienceProblem,
  CAR_TYPE_OPTIONS,
  homeErrorPlacement,
  homeFieldError,
  homeTitleForSave,
} from '@repo/core/home-offer-form'
import { fromIstInput, istWindowLabel, toIstInput } from '@repo/core/ist-input'
import {
  HOME_PRIORITY_LABELS,
  homeOrder,
  offerCardPreview,
  rankLiveOffers,
  tapOpensLabel,
} from '@repo/core/offer-preview'
import { cn } from '@repo/core/utils'
import {
  DiscountHomePreview,
  type PreviewCard,
} from '@repo/ui/features/discount-home-preview'

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
  /** India time, as the datetime-local input holds it (see ist-input.ts). */
  startsAt: string
  endsAt: string
  isActive: boolean
  showOnHome: boolean
  homeTitle: string
  homePriority: HomePriority
  homeAudience: HomeAudience
  homeAudienceRadiusKm: string
  homeAudienceVehicleTypes: HomeCarType[]
}

/** Matches the server's DEFAULT_NEAR_RADIUS_KM until home-config says otherwise. */
const DEFAULT_RADIUS_KM = 10
const MAX_RADIUS_KM = 50

/** The column's limit: 0031's varchar(40), what the coupon card shows on two lines. */
const HOME_TITLE_MAX = 40

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
  showOnHome: false,
  homeTitle: '',
  homePriority: 0,
  homeAudience: 'everyone',
  homeAudienceRadiusKm: String(DEFAULT_RADIUS_KM),
  homeAudienceVehicleTypes: [],
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
    startsAt: toIstInput(discount.startsAt),
    endsAt: toIstInput(discount.endsAt),
    isActive: discount.isActive,
    showOnHome: discount.showOnHome,
    homeTitle: discount.homeTitle ?? '',
    homePriority: discount.homePriority,
    homeAudience: discount.homeAudience,
    homeAudienceRadiusKm: String(discount.homeAudienceRadiusKm ?? DEFAULT_RADIUS_KM),
    homeAudienceVehicleTypes: discount.homeAudienceVehicleTypes ?? [],
  }
}

interface DiscountFormProps {
  /** Absent = create. Present = edit that discount. */
  discount?: AdminDiscount
  /** The page owns the mutation; this form only shapes and hands over input. */
  onSubmit: (input: DiscountInput) => void
  isPending: boolean
  /**
   * The failed mutation's error, if any. A refusal about the Show on Home
   * settings is shown beside the field it is about; anything else by Save.
   */
  error?: unknown
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
  const { data: homeConfig } = useDiscountHomeConfig()
  // The same cached list the Discounts page shows: where this offer would
  // sit among the ones live on Home now.
  const { data: allDiscounts = [] } = useAdminDiscounts()
  const nowMs = useNow()

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const isPercentage = form.discountType === 'percentage'
  const percentValue = Number(form.percentOff)

  // ─── Show on Home ──────────────────────────────────────────────────────────
  const targetingEnabled = homeConfig?.targetingEnabled ?? false
  const maxRadiusKm = homeConfig?.maxNearRadiusKm ?? MAX_RADIUS_KM
  const storedAudience = discount?.homeAudience ?? null
  const homeTitle = form.homeTitle.trim()
  const titleBanned = bannedPhraseIn(homeTitle)
  const startsIso = fromIstInput(form.startsAt)
  const endsIso = fromIstInput(form.endsAt)
  const needsEndDate = form.showOnHome && !endsIso
  const options = homeConfig
    ? audienceOptions(homeConfig, form.vendorId)
    : audienceOptions(
        { audiences: [{ value: 'everyone', label: 'Everyone', enabled: true }] },
        form.vendorId
      )
  const audienceIssue = audienceProblem({
    audience: form.homeAudience,
    storedAudience,
    vendorId: form.vendorId,
    targetingEnabled,
    radiusKm: form.homeAudienceRadiusKm,
    maxRadiusKm,
    vehicleTypes: form.homeAudienceVehicleTypes,
  })
  // An offer saved while targeting was on keeps its audience, but Home does
  // not show it until targeting is back (lib/offers.ts). Not said until the
  // settings have loaded, so it never flashes up on a targeted offer.
  const hiddenByTargeting =
    homeConfig !== undefined && !targetingEnabled && form.homeAudience !== 'everyone'

  const homeValid =
    !form.showOnHome ||
    (homeTitle.length >= 3 &&
      homeTitle.length <= HOME_TITLE_MAX &&
      !titleBanned &&
      Boolean(endsIso) &&
      !audienceIssue)

  const isValid =
    form.code.trim().length >= 3 &&
    (isPercentage
      ? percentValue > 0 && percentValue <= 99
      : Number(form.amountOff) > 0) &&
    homeValid

  // A code that takes most of the price off, with nothing bounding how often it
  // can be used, is the expensive mistake here. Nudge rather than block — an
  // uncapped launch offer is a legitimate thing to want.
  const showLimitWarning =
    (isPercentage ? percentValue >= 90 : !form.minOrderAmount.trim()) &&
    !form.perUserLimit.trim() &&
    !form.totalUsageLimit.trim()
  // On Home the code is printed where customers read it, so anyone can use
  // it; without both limits it can be used without end (plan §10). Still a
  // nudge, as above.
  const showHomeLimitWarning =
    form.showOnHome && (!form.perUserLimit.trim() || !form.totalUsageLimit.trim())

  // A refusal about the Home settings goes beside its field when that field
  // is on screen, with a pointer by Save; otherwise all of it goes by Save.
  const apiError = error instanceof ApiError ? error : null
  const placedError = apiError
    ? homeFieldError({ code: apiError.code, message: apiError.message })
    : null
  const placement = homeErrorPlacement(placedError, form.showOnHome)
  const placedHere = (target: 'title' | 'audience' | 'section') =>
    placement.inPlace === target ? placedError?.message : null
  const generalError =
    error && !placedError ? errorMessage(error, 'Failed to save the discount') : null

  // ─── The preview ───────────────────────────────────────────────────────────
  const vendorName =
    vendors.find((vendor) => vendor.id === form.vendorId)?.businessName ??
    (form.vendorId && form.vendorId === discount?.vendorId ? discount.vendorName : null)

  const draftCard = offerCardPreview({
    code: form.code,
    title: form.homeTitle,
    discountType: form.discountType,
    percentOff: optionalNumber(form.percentOff),
    amountOff: optionalNumber(form.amountOff),
    maxDiscountAmount: isPercentage ? optionalNumber(form.maxDiscountAmount) : null,
    minOrderAmount: optionalNumber(form.minOrderAmount),
    endsAt: endsIso,
    vendorName,
  })

  // Where this offer would sit among the ones live on Home now, and the
  // others Home would show beside it before targeting, at most three in all.
  const draftId = discount?.id ?? 'draft'
  const now = new Date(nowMs)
  const others = allDiscounts.filter((row) => row.id !== draftId)
  const draftRow = {
    id: draftId,
    showOnHome: form.showOnHome,
    isActive: form.isActive,
    homePriority: form.homePriority,
    startsAt: startsIso,
    endsAt: endsIso,
    createdAt: discount?.createdAt ?? now.toISOString(),
  }
  const place = homeOrder(draftRow, others, now)
  const lineUp = rankLiveOffers([draftRow, ...others], now)

  const maxOnHome = homeConfig?.maxOffersOnHome ?? 3
  const draftEntry: PreviewCard = { key: draftId, card: draftCard }
  // The card being typed always comes first, so it is the one in view: the
  // carousel opens on its first slide and the rest only peek in. Where Home
  // actually puts it is the "Order" line below.
  const cards: PreviewCard[] = !form.showOnHome
    ? []
    : place && place.position <= maxOnHome
      ? [
          draftEntry,
          ...lineUp
            .slice(0, maxOnHome)
            .filter((row) => row.id !== draftId)
            .map((row) => ({ key: row.id, card: storedCard(row as AdminDiscount) })),
        ]
      : // Not live yet, or past the three Home shows: the admin still sees
        // their own card.
        [draftEntry]

  // Estimated reach, once the settings can be counted. Debounced: the radius
  // is typed a digit at a time.
  const reachParams: HomeReachParams | null =
    form.showOnHome && !audienceIssue && !hiddenByTargeting
      ? {
          audience: form.homeAudience,
          vendorId: form.vendorId || undefined,
          radiusKm:
            form.homeAudience === 'near_this_garage'
              ? Number(form.homeAudienceRadiusKm)
              : undefined,
          vehicleTypes:
            form.homeAudience === 'car_type'
              ? form.homeAudienceVehicleTypes
              : undefined,
        }
      : null
  // Debounced as text: a fresh object every render would restart the timer
  // after every settle, and re-render the form for ever.
  const reachParamsKey = reachParams ? JSON.stringify(reachParams) : null
  const reachKey = useDebounced(reachParamsKey, 300)
  const reachQuery = useDiscountHomeReach(
    form.showOnHome && reachKey ? (JSON.parse(reachKey) as HomeReachParams) : null
  )
  // A count belongs to the settings on screen only once the debounce has
  // caught up and the number is not the previous audience's kept in place;
  // until then it reads "counting…", never one audience's number under
  // another's description.
  const reachCurrent =
    reachKey === reachParamsKey && !reachQuery.isPlaceholderData
  const reachData = reachCurrent ? reachQuery.data : undefined
  const reachError = reachCurrent ? reachQuery.error : null

  const priorityLabel = HOME_PRIORITY_LABELS[form.homePriority]
  const reach = !form.showOnHome
    ? null
    : hiddenByTargeting
      ? {
          headline: 'Not on Home for now',
          detail: 'Targeted offers are switched off, so Home shows this to nobody until they are on.',
          tone: 'warning' as const,
        }
      : audienceIssue
        ? { headline: 'Estimated reach', detail: audienceIssue, tone: 'warning' as const }
        : reachError
          ? {
              headline: 'Estimated reach',
              detail: errorMessage(reachError, "Couldn't count the customers just now."),
              tone: 'warning' as const,
            }
          : reachData?.garagePublic === false
            ? {
                headline: (
                  <>
                    Estimated reach: <span className="font-numeric">0</span> customers
                  </>
                ),
                detail:
                  "This garage isn't live for customers (paused, not verified, not on the map or not active), so its offer shows to nobody.",
                tone: 'warning' as const,
              }
            : {
                headline: reachData ? (
                  <>
                    Estimated reach:{' '}
                    <span className="font-numeric">
                      {reachData.count.toLocaleString('en-IN')}
                    </span>{' '}
                    {reachData.count === 1 ? 'customer' : 'customers'}
                  </>
                ) : (
                  'Estimated reach: counting…'
                ),
                detail: reachDetail(form, maxRadiusKm),
              }

  const facts = form.showOnHome
    ? [
        {
          label: 'On Home',
          value: endsIso ? (
            <span className="font-numeric">{istWindowLabel(startsIso, endsIso)}</span>
          ) : (
            <span className="text-warning">Needs an end date</span>
          ),
        },
        { label: 'Tap opens', value: tapOpensLabel(vendorName) },
        {
          label: 'Order',
          value: place ? (
            <>
              {priorityLabel},{' '}
              <span className="font-numeric">
                {place.position} of {place.total}
              </span>{' '}
              live {place.total === 1 ? 'offer' : 'offers'}
              {place.position > maxOnHome && ` · Home shows the first ${maxOnHome}`}
            </>
          ) : !form.isActive ? (
            `${priorityLabel} · the code is switched off`
          ) : startsIso && Date.parse(startsIso) > nowMs ? (
            `${priorityLabel} · not live yet`
          ) : (
            priorityLabel
          ),
        },
      ]
    : []

  const handleSubmit = () => {
    if (!isValid || isPending) return
    // With Show on Home off the audience is still stored; one that cannot be
    // saved as it stands (a garage audience with the garage cleared) goes
    // back to Everyone rather than blocking a save about something else.
    const audience: HomeAudience =
      !form.showOnHome && audienceIssue ? 'everyone' : form.homeAudience
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
      startsAt: startsIso,
      endsAt: endsIso,
      isActive: form.isActive,
      showOnHome: form.showOnHome,
      // Kept while Home is off only if the server would take it, so a half
      // typed or banned one never blocks a save about something else.
      homeTitle: homeTitleForSave(form.homeTitle, form.showOnHome),
      homePriority: form.homePriority,
      homeAudience: audience,
      homeAudienceRadiusKm:
        audience === 'near_this_garage' ? Number(form.homeAudienceRadiusKm) : null,
      homeAudienceVehicleTypes:
        audience === 'car_type' ? form.homeAudienceVehicleTypes : null,
    })
  }

  const toggleCarType = (type: HomeCarType) =>
    set(
      'homeAudienceVehicleTypes',
      form.homeAudienceVehicleTypes.includes(type)
        ? form.homeAudienceVehicleTypes.filter((t) => t !== type)
        : CAR_TYPE_OPTIONS.map((o) => o.value).filter(
            (t) => t === type || form.homeAudienceVehicleTypes.includes(t)
          )
    )

  return (
    <div className="grid gap-4 pb-8 lg:grid-cols-[minmax(0,1fr)_424px] lg:items-start lg:gap-6">
      <div className="flex min-w-0 flex-col gap-4">
        <ScCard className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-text-primary">Code</h2>
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
          <h2 className="text-[15px] font-semibold text-text-primary">Discount</h2>
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
          <h2 className="text-[15px] font-semibold text-text-primary">
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
          {/* India time whatever this computer's clock is set to: Detlio runs
              in Chennai, and a laptop on another zone used to shift the
              window by hours. */}
          <div className="grid grid-cols-2 gap-3">
            <ScField
              id="startsAt"
              label="Starts, IST (optional)"
              type="datetime-local"
              value={form.startsAt}
              onChange={(value) => set('startsAt', value)}
            />
            <ScField
              id="endsAt"
              label={form.showOnHome ? 'Ends, IST (needed for Home)' : 'Ends, IST (optional)'}
              type="datetime-local"
              value={form.endsAt}
              aria-invalid={needsEndDate || undefined}
              aria-describedby={needsEndDate ? 'endsAt-needed' : undefined}
              onChange={(value) => set('endsAt', value)}
            />
          </div>
          <p className="text-[11px] text-text-muted">
            Times are India time (IST). A code that ends at 12:00 AM reads
            &ldquo;Till&rdquo; the day before on Home.
          </p>
          {needsEndDate && (
            <p id="endsAt-needed" className="text-[11px] text-warning">
              An offer on Home needs an end date, so the card can say when it ends.
            </p>
          )}

          {showHomeLimitWarning ? (
            <p className="flex items-start gap-1.5 rounded-[10px] bg-warning-muted/20 p-2.5 text-[11px] text-warning">
              <IconAlertTriangle size={14} className="mt-px shrink-0" />
              This code will be on customers&apos; Home, where anyone can read
              it. Set uses per customer and a total so it can&apos;t be used
              without limit.
            </p>
          ) : (
            showLimitWarning && (
              <p className="flex items-start gap-1.5 rounded-[10px] bg-warning-muted/20 p-2.5 text-[11px] text-warning">
                <IconAlertTriangle size={14} className="mt-px shrink-0" />
                This code has no usage limits. One customer could redeem it
                repeatedly — consider setting uses per customer or a total.
              </p>
            )
          )}
        </ScCard>

        <ScCard className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-text-primary">Funding</h2>
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

        <ScCard className="flex flex-col gap-0 px-0 py-0">
          <div className="flex flex-col gap-2 px-3.5 py-3">
            <h2 className="text-[15px] font-semibold text-text-primary">Show on Home</h2>
            <div className="flex items-start gap-2">
              <ScSwitch
                checked={form.showOnHome}
                onChange={(checked) => set('showOnHome', checked)}
                label="Show this offer on Home"
                className="-ml-1.5"
              />
              <div className="min-w-0 pt-1.5">
                <p className="text-[13px] text-text-primary">Show this offer on Home</p>
                <p className="text-[11px] text-text-secondary">
                  A card near the top of the customer&apos;s Home while the code
                  is live. Tapping it takes them to book with the code applied.
                </p>
              </div>
            </div>
          </div>

          {form.showOnHome && (
            <>
              <div className="flex flex-col gap-3 border-t border-border px-3.5 py-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <label
                        htmlFor="homeTitle"
                        className="text-[11px] font-medium text-text-secondary"
                      >
                        Title
                      </label>
                      <span
                        aria-hidden="true"
                        className="font-numeric text-[11px] text-text-muted"
                      >
                        {form.homeTitle.length} / {HOME_TITLE_MAX}
                      </span>
                    </div>
                    <ScInput
                      id="homeTitle"
                      placeholder="20% off any service"
                      maxLength={HOME_TITLE_MAX}
                      value={form.homeTitle}
                      aria-invalid={Boolean(titleBanned || placedHere('title')) || undefined}
                      aria-describedby="homeTitle-help"
                      onChange={(e) => set('homeTitle', e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span
                      id="homePriority-label"
                      className="text-[11px] font-medium text-text-secondary"
                    >
                      Priority
                    </span>
                    <ScSegmented
                      aria-label="Priority"
                      value={String(form.homePriority) as '0' | '1' | '2'}
                      onChange={(value) =>
                        set('homePriority', Number(value) as HomePriority)
                      }
                      options={HOME_PRIORITY_LABELS.map((label, value) => ({
                        value: String(value) as '0' | '1' | '2',
                        label,
                      }))}
                      className="min-h-11"
                    />
                  </div>
                </div>
                <div id="homeTitle-help" className="flex flex-col gap-1">
                  {titleBanned ? (
                    <p className="text-[11px] text-warning">
                      Offer titles can&apos;t say &ldquo;{titleBanned}&rdquo;.
                      Describe what the code gives, plainly.
                    </p>
                  ) : placedHere('title') ? (
                    <p role="alert" className="text-[11px] text-warning">
                      {placedHere('title')}
                    </p>
                  ) : homeTitle.length > 0 && homeTitle.length < 3 ? (
                    <p className="text-[11px] text-warning">
                      At least 3 characters.
                    </p>
                  ) : null}
                  <p className="text-[11px] text-text-muted">
                    The small print under the title is written from the code
                    itself: the cap, the minimum, the code and the end date
                    (&ldquo;Ends Sun&rdquo; in its last 3 days). A title takes two
                    lines at most on Home, which is why it stops at{' '}
                    {HOME_TITLE_MAX} characters. Top shows
                    first, then High, then Normal; at the same priority, the
                    one ending soonest, then the newest. Up to {maxOnHome}{' '}
                    offers show on Home.
                  </p>
                </div>
              </div>

              <fieldset className="flex flex-col gap-2 border-t border-border px-3.5 py-3">
                <legend className="mb-1 pt-3 text-[11px] font-medium text-text-secondary">
                  Who sees it
                </legend>
                <div className="flex flex-col overflow-hidden rounded-[12px] border border-border">
                  {options.map((option, index) => {
                    const checked = form.homeAudience === option.value
                    const inputId = `homeAudience-${option.value}`
                    return (
                      <div
                        key={option.value}
                        className={cn(
                          'flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2',
                          index > 0 && 'border-t border-border',
                          checked && 'bg-surface-elevated/50'
                        )}
                      >
                        <label
                          htmlFor={inputId}
                          className={cn(
                            'flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3',
                            option.disabled && !checked && 'cursor-not-allowed opacity-50'
                          )}
                        >
                          <input
                            id={inputId}
                            type="radio"
                            name="homeAudience"
                            value={option.value}
                            checked={checked}
                            // A saved audience stays chosen even while it
                            // cannot be picked anew.
                            disabled={option.disabled && !checked}
                            onChange={() => set('homeAudience', option.value)}
                            className="size-4 shrink-0 accent-brand-white"
                          />
                          <span className="min-w-0">
                            <span className="block text-[13px] text-text-primary">
                              {option.label}
                            </span>
                            {option.hint && (
                              <span className="block text-[11px] text-text-secondary">
                                {option.hint}
                              </span>
                            )}
                          </span>
                        </label>

                        {option.value === 'everyone' && (
                          <span className="text-[11px] text-text-muted">Default</span>
                        )}

                        {option.value === 'near_this_garage' && (
                          <span className="flex items-center gap-2 text-[11px] text-text-muted">
                            <label htmlFor="homeAudienceRadiusKm">within</label>
                            <ScInput
                              id="homeAudienceRadiusKm"
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={maxRadiusKm}
                              aria-label="Distance from the garage, in km"
                              disabled={!checked}
                              value={form.homeAudienceRadiusKm}
                              onChange={(e) => set('homeAudienceRadiusKm', e.target.value)}
                              className="min-h-11 w-[72px] font-numeric"
                            />
                            km
                          </span>
                        )}

                        {option.value === 'car_type' && (
                          <span
                            role="group"
                            aria-label="Car types"
                            className="flex flex-wrap gap-1.5"
                          >
                            {CAR_TYPE_OPTIONS.map((type) => {
                              const on = form.homeAudienceVehicleTypes.includes(type.value)
                              return (
                                <button
                                  key={type.value}
                                  type="button"
                                  aria-pressed={on}
                                  disabled={!checked}
                                  onClick={() => toggleCarType(type.value)}
                                  className={cn(
                                    'min-h-11 rounded-full border px-3 text-[12px] transition-colors disabled:opacity-40',
                                    on
                                      ? 'border-brand-white bg-brand-white text-brand-black'
                                      : 'border-border text-text-secondary'
                                  )}
                                >
                                  {type.label}
                                </button>
                              )
                            })}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>

                {homeConfig?.targetingNote && (
                  <p className="flex items-start gap-2 rounded-[12px] border border-border bg-brand-black/40 p-3 text-[12px] text-text-secondary">
                    <IconInfoCircle size={16} aria-hidden="true" className="mt-px shrink-0" />
                    {homeConfig.targetingNote}
                  </p>
                )}
                {hiddenByTargeting && (
                  <p className="text-[11px] text-warning">
                    Saved while targeted offers were on. Home doesn&apos;t show
                    it while they are off; choose Everyone to show it now.
                  </p>
                )}
                {audienceIssue && !hiddenByTargeting && (
                  <p className="text-[11px] text-warning">{audienceIssue}</p>
                )}
                {placedHere('audience') && (
                  <p role="alert" className="text-[11px] text-warning">
                    {placedHere('audience')}
                  </p>
                )}
                <p className="text-[11px] text-text-muted">
                  This only decides who sees the card on Home. Anyone who has
                  the code can still use it at checkout.
                </p>
              </fieldset>
            </>
          )}

          {placedHere('section') && (
            <p role="alert" className="border-t border-border px-3.5 py-3 text-[12px] text-warning">
              {placedHere('section')}
            </p>
          )}
        </ScCard>
      </div>

      <DiscountHomePreview
        cards={cards}
        facts={facts}
        reach={reach}
        className="lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1"
      />

      <div className="flex flex-col gap-2 lg:col-start-1">
        {generalError && <p role="alert" className="text-[12px] text-error">{generalError}</p>}
        {/* A Home refusal: the pointer when it is shown up in the section
            (that slot is the alert), or the whole of it when that slot is
            folded away. */}
        {placement.bySave && (
          <p
            role={placement.inPlace ? undefined : 'alert'}
            className="text-[12px] text-error"
          >
            {placement.bySave}
          </p>
        )}

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
    </div>
  )
}

/** Another live offer's card, as Home draws it from its stored columns. */
function storedCard(row: AdminDiscount) {
  return offerCardPreview({
    code: row.code,
    title: row.homeTitle ?? '',
    discountType: row.discountType,
    percentOff: row.percentOff ? Number(row.percentOff) : null,
    amountOff: row.amountOff ? Number(row.amountOff) : null,
    maxDiscountAmount: row.maxDiscountAmount ? Number(row.maxDiscountAmount) : null,
    minOrderAmount: row.minOrderAmount ? Number(row.minOrderAmount) : null,
    endsAt: row.endsAt,
    vendorName: row.vendorName,
  })
}

/** The line under "Estimated reach": who was counted, and how. */
function reachDetail(form: FormState, maxRadiusKm: number): string {
  switch (form.homeAudience) {
    case 'everyone':
      return form.vendorId
        ? 'Signed-in customers with a car saved, counted now'
        : 'Everyone signed in, counted now'
    case 'new_customers':
      return 'Customers with no paid booking yet, counted now'
    case 'booked_this_garage':
      return 'Customers with a paid booking at this garage, counted now'
    case 'near_this_garage': {
      const km = Math.min(Number(form.homeAudienceRadiusKm) || 0, maxRadiusKm)
      return `Customers with a saved address within ${km} km. Home measures from where they are when they open it, so this is a guide.`
    }
    case 'wash_due':
      return 'Customers with a car due or overdue a wash today'
    case 'car_type':
      return `Customers with a ${form.homeAudienceVehicleTypes
        .map((type) => CAR_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type)
        .join(' or ')} saved, counted now`
  }
}
