'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@repo/ui/sc/page-header'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import {
  PICKUP_FEE_PREVIEW_KM,
  detlioPlan,
  feeAtRoadKm,
  pickupFeeSettingsProblems,
  type PickupFeeSettings,
} from '@repo/core/pickup-fee-maths'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { useAdminPickupFeeSettings, useSaveAdminPickupFeeSettings } from '@repo/core/api/hooks/use-pickup-fee'
import { SavedNote, type SavedState } from '@/components/save-bar'
import { FeeInput, FeeRow, parseBox, rupeesCell } from '@/components/pickup-fee/fee-box'

/** The page's boxes as typed, keyed by where each number lives in the settings. */
type Boxes = Record<BoxKey, string>
type BoxKey =
  | 'freeKm'
  | 'perKm'
  | 'minCharge'
  | 'maxCharge'
  | 'roundTo'
  | 'roadFactor'
  | 'limFreeKmMin'
  | 'limFreeKmMax'
  | 'limPerKmMin'
  | 'limPerKmMax'
  | 'limMinMin'
  | 'limMinMax'
  | 'limMaxCharge'
  | 'limFixedMax'
  | 'askRaisePct'
  | 'changeEveryDays'
  | 'convenienceFee'

function boxesOf(s: PickupFeeSettings): Boxes {
  return {
    freeKm: String(s.suggested.freeKm),
    perKm: String(s.suggested.perKm),
    minCharge: String(s.suggested.minCharge),
    maxCharge: String(s.suggested.maxCharge),
    roundTo: String(s.suggested.roundTo),
    roadFactor: String(s.suggested.roadFactor),
    limFreeKmMin: String(s.limits.freeKm.min),
    limFreeKmMax: String(s.limits.freeKm.max),
    limPerKmMin: String(s.limits.perKm.min),
    limPerKmMax: String(s.limits.perKm.max),
    limMinMin: String(s.limits.minCharge.min),
    limMinMax: String(s.limits.minCharge.max),
    limMaxCharge: String(s.limits.maxCharge),
    limFixedMax: String(s.limits.fixedMax),
    askRaisePct: String(s.limits.askRaisePct),
    changeEveryDays: String(s.limits.changeEveryDays),
    convenienceFee: String(s.convenienceFee),
  }
}

/** The boxes as settings, or null while one isn't a number. */
function settingsOf(b: Boxes): PickupFeeSettings | null {
  const n = (key: BoxKey) => parseBox(b[key])
  const values = Object.fromEntries((Object.keys(b) as BoxKey[]).map((key) => [key, n(key)])) as Record<BoxKey, number | null>
  if (Object.values(values).some((value) => value === null)) return null
  const v = values as Record<BoxKey, number>
  return {
    suggested: {
      freeKm: v.freeKm,
      perKm: v.perKm,
      minCharge: v.minCharge,
      maxCharge: v.maxCharge,
      roundTo: v.roundTo,
      roadFactor: v.roadFactor,
    },
    limits: {
      freeKm: { min: v.limFreeKmMin, max: v.limFreeKmMax },
      perKm: { min: v.limPerKmMin, max: v.limPerKmMax },
      minCharge: { min: v.limMinMin, max: v.limMinMax },
      maxCharge: v.limMaxCharge,
      fixedMax: v.limFixedMax,
      askRaisePct: v.askRaisePct,
      changeEveryDays: v.changeEveryDays,
    },
    convenienceFee: v.convenienceFee,
  }
}

function Card({
  title,
  aside,
  intro,
  children,
}: {
  title: string
  aside: ReactNode
  intro?: string
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-[16px] border border-border bg-surface">
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-medium tracking-[-0.01em] text-text-primary">{title}</h2>
          {aside}
        </div>
        {intro && <p className="mt-1.5 text-[13px] text-text-secondary">{intro}</p>}
      </div>
      {children}
    </section>
  )
}

/**
 * Settings → Pickup fee (0079, admin mockup 2): Detlio's suggested fee, the
 * limits garages can set and Detlio's convenience fee (₹0, off). Every box
 * saves when it is left, with one small "Saved"; the server refuses anything
 * outside the hard caps and says why.
 */
export default function PickupFeeSettingsPage() {
  const router = useRouter()
  const { data, isPending, error, refetch } = useAdminPickupFeeSettings()
  const save = useSaveAdminPickupFeeSettings()
  const [boxes, setBoxes] = useState<Boxes | null>(null)
  const [saveState, setSaveState] = useState<SavedState>('idle')
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])
  useEffect(() => {
    if (data && !boxes) setBoxes(boxesOf(data))
  }, [data, boxes])

  if (isPending || (!boxes && !error)) return <SkeletonList count={3} itemClassName="h-48" />
  if (error || !boxes || !data) {
    return <ErrorState message={errorMessage(error, 'Failed to load the pickup fee settings')} onRetry={() => void refetch()} />
  }

  const set = (key: BoxKey) => (value: string) => setBoxes((b) => (b ? { ...b, [key]: value } : b))
  const typed = settingsOf(boxes)
  const commit = () => {
    if (!typed) {
      setProblem('Type a number in every box.')
      return
    }
    const problems = pickupFeeSettingsProblems(typed)
    if (problems.length > 0) {
      setProblem(problems[0]!)
      return
    }
    setProblem(null)
    if (JSON.stringify(typed) === JSON.stringify(data)) return
    setSaveState('saving')
    save.mutate(typed, {
      onSuccess: (saved) => {
        setBoxes(boxesOf(saved))
        setSaveState('saved')
        setTimeout(() => setSaveState((state) => (state === 'saved' ? 'idle' : state)), 2500)
      },
      onError: (err) => {
        setSaveState('idle')
        setProblem(errorMessage(err, 'Couldn’t save that. Check the connection and try again.'))
      },
    })
  }
  const box = (key: BoxKey, label: string, opts: { prefix?: string; suffix?: string } = {}) => (
    <FeeInput value={boxes[key]} onChange={set(key)} onCommit={commit} label={label} {...opts} />
  )
  const to = <span className="text-[13px] text-text-muted">to</span>
  const upTo = <span className="text-[13px] text-text-muted">up to</span>
  const plan = typed ? detlioPlan(typed) : detlioPlan(data)
  const saved = <SavedNote state={saveState} idleText="Saves on tap" />
  const convenienceOn = (parseBox(boxes.convenienceFee) ?? 0) > 0

  return (
    <>
      <PageHeader
        title="Pickup fee"
        subtitle="The fee garages charge for pickup & drop. Garages keep the whole pickup fee; Detlio takes no commission on it."
        backHref="/settings"
      />
      {problem && (
        <p role="alert" className="text-[13px] text-error">
          {problem}
        </p>
      )}
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Card title="Detlio’s suggested fee" aside={saved} intro="What “By distance” starts on, and what every Ask for pickup suggests.">
            <FeeRow label="Free up to" hint="No fee this close.">
              {() => box('freeKm', 'Free up to, km', { suffix: 'km' })}
            </FeeRow>
            <FeeRow label="Then per km" hint="For each road km after the free part.">
              {() => box('perKm', 'Then per km, rupees', { prefix: '₹' })}
            </FeeRow>
            <FeeRow label="Lowest charge" hint="When a fee is charged at all.">
              {() => box('minCharge', 'Lowest charge, rupees', { prefix: '₹' })}
            </FeeRow>
            <FeeRow label="Highest charge" hint="However far.">
              {() => box('maxCharge', 'Highest charge, rupees', { prefix: '₹' })}
            </FeeRow>
            <FeeRow label="Round to the nearest" hint="So fees look like ₹110, not ₹107.">
              {() => box('roundTo', 'Round to the nearest, rupees', { prefix: '₹' })}
            </FeeRow>
            <FeeRow label="Road factor" hint="Straight line from the garage’s pin × this = road km. Instant, free, same every time.">
              {() => box('roadFactor', 'Road factor', { suffix: '×' })}
            </FeeRow>
          </Card>

          <Card title="What customers pay" aside={<span className="text-[12.5px] text-text-secondary">Detlio’s fee</span>}>
            <div className="mx-4 mb-4 rounded-[12px] bg-white/[0.03] px-4 py-2">
              <table className="w-full text-[13px]">
                <caption className="sr-only">What customers pay with Detlio’s fee</caption>
                <thead>
                  <tr className="text-left text-[12px] text-text-muted">
                    <th scope="col" className="py-1.5 font-normal">
                      Road km
                    </th>
                    <th scope="col" className="py-1.5 text-right font-normal">
                      <span className="sr-only">Fee</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {PICKUP_FEE_PREVIEW_KM.map((km) => {
                    const fee = feeAtRoadKm(plan, km)
                    return (
                      <tr key={km} className="border-t border-border">
                        <td className="py-2 text-text-secondary">
                          <span className="font-numeric">{km}</span> km by road
                        </td>
                        <td className="py-2 text-right font-numeric text-text-primary">
                          {rupeesCell(fee, fee >= plan.maxCharge)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <Card
            title="Limits garages can set"
            aside={saved}
            intro="The server refuses anything outside these. Garages see “Up to ₹…” under each box."
          >
            <FeeRow label="Free up to" hint="By distance">
              {() => (
                <>
                  {box('limFreeKmMin', 'Free up to, lowest, km', { suffix: 'km' })}
                  {to}
                  {box('limFreeKmMax', 'Free up to, highest, km', { suffix: 'km' })}
                </>
              )}
            </FeeRow>
            <FeeRow label="Per km" hint="By distance">
              {() => (
                <>
                  {box('limPerKmMin', 'Per km, lowest, rupees', { prefix: '₹' })}
                  {to}
                  {box('limPerKmMax', 'Per km, highest, rupees', { prefix: '₹' })}
                </>
              )}
            </FeeRow>
            <FeeRow label="Lowest charge" hint="By distance">
              {() => (
                <>
                  {box('limMinMin', 'Lowest charge, lowest, rupees', { prefix: '₹' })}
                  {to}
                  {box('limMinMax', 'Lowest charge, highest, rupees', { prefix: '₹' })}
                </>
              )}
            </FeeRow>
            <FeeRow label="Highest charge" hint="By distance">
              {() => (
                <>
                  {upTo}
                  {box('limMaxCharge', 'Highest charge limit, rupees', { prefix: '₹' })}
                </>
              )}
            </FeeRow>
            <FeeRow label="Fixed fee" hint="One fee for any pickup">
              {() => (
                <>
                  {upTo}
                  {box('limFixedMax', 'Fixed fee limit, rupees', { prefix: '₹' })}
                </>
              )}
            </FeeRow>
            <FeeRow label="Ask for pickup" hint="How much the garage can raise the suggestion">
              {() => (
                <>
                  {upTo}
                  {box('askRaisePct', 'Ask for pickup, percent', { suffix: '%' })}
                </>
              )}
            </FeeRow>
            <FeeRow label="Fee changes" hint="How often a garage can change its fee">
              {() => (
                <>
                  <span className="text-[13px] text-text-muted">up to 1 /</span>
                  {box('changeEveryDays', 'Fee changes, once in this many days', { suffix: 'd' })}
                </>
              )}
            </FeeRow>
            <p className="border-t border-border px-4 py-3 text-[12.5px] leading-relaxed text-text-muted">
              Always: never more than the booking’s service price. A fee above Detlio’s suggestion waits for a check in{' '}
              <Link href="/pickup-fees" className="text-text-primary underline-offset-2 hover:underline">
                Issues → Pickup fees
              </Link>
              ; customers see Detlio’s fee until then. A booked fee never changes.
            </p>
          </Card>

          <Card
            title="Detlio convenience fee"
            aside={<span className="text-[12.5px] text-text-secondary">{convenienceOn ? 'On' : 'Off'}</span>}
            intro="Detlio’s own fee on each booking, never the garage’s. At checkout it is its own line, “Detlio convenience fee”."
          >
            <FeeRow label="Fee per booking" hint="₹0 means off. Customers see nothing.">
              {() => box('convenienceFee', 'Convenience fee per booking, rupees', { prefix: '₹' })}
            </FeeRow>
          </Card>
        </div>
      </div>
    </>
  )
}
