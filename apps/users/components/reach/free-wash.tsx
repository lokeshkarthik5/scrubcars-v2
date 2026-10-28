'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { IconCheck, IconCircleCheck, IconGift, IconX } from '@tabler/icons-react'
import { ScSheet } from '@repo/ui/sc/modal'
import { ScButton } from '@repo/ui/sc/button'
import { Chip } from '@repo/ui/sc/chip'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScSwitch } from '@repo/ui/sc/switch'
import { track } from '@repo/core/analytics'
import { ApiError } from '@repo/core/api/client'
import { getPushConfig, savePushSubscription } from '@repo/core/api/push'
import { useAreaStatus, useRecommendGarage, useSignUpForArea } from '@repo/core/api/hooks/use-area'
import { useZones } from '@repo/core/api/hooks/use-zones'
import {
  FREE_WASH_RULES,
  REFERRAL_CREDIT,
  cardClosesKey,
  closeOnce,
  freeWashCardTitle,
  freeWashCardVisible,
  freeWashesGone,
  parseCardCloses,
  recommendAsk,
  waitingLine,
} from '@repo/core/area-signups'
import { subscribeThisBrowser } from '@repo/core/push'
import { useNow } from '@repo/core/hooks/use-now'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { isCitywide, useHydratedLocation } from '@repo/core/stores/location-store'
import { zoneFor, type Zone } from '@repo/core/zones'
import { cn } from '@repo/core/utils'
import { CheckoutSignInCard, useCheckoutSignIn } from '@/components/checkout/checkout-sign-in'

/**
 * "Not in your area yet" (customer reach, part 2, 0062; mockups
 * no-bounce-funnel.png frames 5–6 and stay-journey.png, with the free wash
 * in place of the ₹150 offer): when the customer's area has no live garage,
 * a slim card offers a free wash for the day Detlio arrives there. One piece
 * at a time: the card, or, once on the list, one slim line.
 */

/**
 * The customer's area: the chip they picked, or the zone a phone fix falls
 * in. Null without a location, "All of Chennai", or outside every zone.
 */
export function useCustomerZone(): Zone | null {
  const location = useHydratedLocation()
  const zones = useZones()
  return useMemo(() => {
    if (!location || isCitywide(location)) return null
    if (location.source === 'area' && location.zone) return zones.find((z) => z.slug === location.zone) ?? null
    return zoneFor(location, zones)
  }, [location, zones])
}

/** An area with no live garage, as only the API knows it (the seeded copy says nothing). */
function noGarageYet(zone: Zone | null): zone is Zone {
  return zone !== null && zone.hasGarage === false
}

/** The phone's record of closes for an area's card. */
function readCloses(slug: string) {
  try {
    return parseCardCloses(window.localStorage.getItem(cardClosesKey(slug)))
  } catch {
    return null
  }
}

/**
 * The free-wash piece for the garage list: the card ("Free wash when we
 * reach <Area>", Claim, ×) or, once the customer is on the area's list, the
 * slim line. Nothing when their area has a garage, or when they closed the
 * card (back after 7 days, at most 3 times).
 */
export function FreeWashPiece({ placement }: { placement: 'top' | 'bottom' }) {
  const zone = useCustomerZone()
  const user = useAuthStore((s) => s.user)
  const status = useAreaStatus({ enabled: !!user })
  const [sheetOpen, setSheetOpen] = useState(false)
  const [recommendOpen, setRecommendOpen] = useState(false)
  // Bumped by ×, so the phone's record is read again.
  const [closes, setCloses] = useState(0)
  const now = useNow(60_000)
  const shown = useRef<string | null>(null)

  const signedUp = zone ? status.data?.signups.find((s) => s.zone.slug === zone.slug) : undefined
  // Read from the phone (the zone is only known once hydrated, so never on the server).
  const hidden = useMemo(
    () => (zone ? closes >= 0 && !freeWashCardVisible(readCloses(zone.slug), now) : true),
    [zone, closes, now]
  )

  const showCard = noGarageYet(zone) && !signedUp && !hidden
  useEffect(() => {
    if (showCard && zone && shown.current !== zone.slug) {
      shown.current = zone.slug
      track('banner_view', { banner: 'free-wash' })
    }
  }, [showCard, zone])

  if (!noGarageYet(zone)) return null

  if (signedUp) {
    return (
      <>
        <OnTheListLine area={zone.name} onRecommend={() => setRecommendOpen(true)} />
        <RecommendSheet open={recommendOpen} onClose={() => setRecommendOpen(false)} zoneSlug={zone.slug} />
      </>
    )
  }
  if (!showCard) return null

  const close = () => {
    try {
      window.localStorage.setItem(cardClosesKey(zone.slug), JSON.stringify(closeOnce(readCloses(zone.slug), Date.now())))
    } catch {
      // Storage off: closed for this visit only.
    }
    setCloses((n) => n + 1)
    track('banner_close', { banner: 'free-wash' })
  }

  return (
    <>
      <section
        aria-labelledby={`free-wash-${placement}`}
        data-free-wash-card=""
        className="flex items-center gap-3 rounded-[18px] border border-[#1F5A3A] bg-[#0E2418] p-4"
      >
        <div className="min-w-0 flex-1">
          <h2 id={`free-wash-${placement}`} className="text-[15px] font-medium text-text-primary">
            {freeWashCardTitle(zone.name)}
          </h2>
          <p className="text-[12px] text-text-secondary">
            No garage in your area yet · {waitingLine(zone.name, zone.waiting)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="press flex min-h-11 shrink-0 items-center rounded-full bg-brand-white px-4 text-[14px] font-medium text-brand-black"
        >
          Claim
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="Close the free wash card"
          className="-mr-2 grid size-11 shrink-0 place-items-center text-text-secondary"
        >
          <IconX size={18} aria-hidden />
        </button>
      </section>
      <FreeWashSheet open={sheetOpen} onClose={() => setSheetOpen(false)} initialZone={zone} />
    </>
  )
}

/** "✓ On the list for <Area> · Recommend": the one slim line once signed up. */
export function OnTheListLine({ area, onRecommend }: { area: string; onRecommend: () => void }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-[14px] border border-border px-4" data-on-the-list="">
      <p className="flex items-center gap-1.5 text-[13px] text-text-primary">
        <IconCheck size={15} className="text-success" aria-hidden />
        On the list for {area}
      </p>
      <button type="button" onClick={onRecommend} className="min-h-11 text-[13px] text-text-primary underline underline-offset-2">
        Recommend
      </button>
    </div>
  )
}

/** Turns on browser notifications for this phone after the sign-up; never blocks it. */
async function turnOnPush() {
  try {
    const config = await getPushConfig('customer')
    if (!config.enabled || !config.publicKey) return
    const subscription = await subscribeThisBrowser(config.publicKey)
    await savePushSubscription('customer', subscription)
  } catch {
    toast.info("We couldn't turn on notifications on this phone. You can from Profile → Notifications.")
  }
}

/**
 * "Which area are you in?": the area (pre-filled), the free wash (or "Notify
 * me" once the area's 50 are taken), the two switches, and "Save my free
 * wash". A guest signs in on the in-page card first: it is what stops one
 * person claiming fifty. Then, once, "Know a good garage here?".
 */
export function FreeWashSheet({
  open,
  onClose,
  initialZone,
}: {
  open: boolean
  onClose: () => void
  initialZone: Zone | null
}) {
  const user = useAuthStore((s) => s.user)
  const zones = useZones()
  const signUp = useSignUpForArea()
  const signIn = useCheckoutSignIn()
  const [pickedSlug, setZoneSlug] = useState<string | null>(null)
  // Pre-filled from where they are; a chip or "Other…" changes it.
  const zoneSlug = pickedSlug ?? initialZone?.slug ?? null
  const [otherOpen, setOtherOpen] = useState(false)
  const [push, setPush] = useState(true)
  const [whatsapp, setWhatsapp] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<{ area: string; freeWash: boolean; slug: string } | null>(null)
  const [recommending, setRecommending] = useState(false)

  // The areas a sign-up can be for: only those with no live garage.
  const waitingZones = zones.filter((z) => z.hasGarage === false)
  const chips = [
    ...(initialZone ? [initialZone] : []),
    ...waitingZones.filter((z) => z.slug !== initialZone?.slug).slice(0, 3),
  ]
  const zone = zones.find((z) => z.slug === zoneSlug) ?? null
  const gone = freeWashesGone(zone?.freeWashesLeft)

  const save = async () => {
    if (!zone) return
    setError('')
    setSaving(true)
    try {
      const result = await signUp.mutateAsync({ zoneSlug: zone.slug, pushOptIn: push, whatsappOptIn: whatsapp })
      if (result.freeWash) track('free_wash_claim')
      if (push) void turnOnPush()
      setDone({ area: result.zone.name, freeWash: result.freeWash, slug: result.zone.slug })
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Couldn't save it. Try again.")
    } finally {
      setSaving(false)
    }
  }

  const verifyAndSave = async () => {
    if (await signIn.verify()) await save()
  }

  const close = () => {
    onClose()
    setDone(null)
    setRecommending(false)
  }

  return (
    <ScSheet
      open={open}
      onClose={close}
      aria-label={recommending ? 'Recommend a garage' : done ? "You're on the list" : 'Which area are you in?'}
    >
      <div className="flex flex-col gap-5 px-5 pt-2 pb-2" data-free-wash-sheet="">
        {done && recommending ? (
          <RecommendForm zoneSlug={done.slug} onDone={close} />
        ) : done ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <IconCircleCheck size={44} className="text-success" aria-hidden />
            <h2 className="text-[20px] font-medium text-text-primary">You&apos;re on the list</h2>
            <p className="text-[15px] text-text-secondary">
              We&apos;ll tell you the day Detlio opens in {done.area}.
              {done.freeWash ? ' Your free wash is saved.' : ''}
            </p>
            <div className="flex w-full items-start gap-3 rounded-[16px] border border-[#1F5A3A] bg-[#0E2418] p-4 text-left">
              <IconGift size={20} className="mt-0.5 shrink-0 text-success" aria-hidden />
              <p className="text-[14px] text-text-primary">{recommendAsk()}</p>
            </div>
            <ScButton variant="outline" onClick={() => setRecommending(true)}>
              Recommend a garage
            </ScButton>
            <ScButton variant="text" onClick={close}>
              Not now
            </ScButton>
          </div>
        ) : (
          <>
            <div>
              <h2 className="text-[20px] font-medium text-text-primary">Which area are you in?</h2>
              <p className="text-[13px] text-text-secondary">
                We&apos;re not in your area yet. Tell us, and {gone ? 'we’ll tell you' : 'your first wash is on us'} when we
                arrive.
              </p>
            </div>
            <div role="group" aria-label="Your area" className="flex flex-wrap gap-2">
              {chips.map((z) => (
                <Chip key={z.slug} label={z.name} selected={zoneSlug === z.slug} onClick={() => setZoneSlug(z.slug)} />
              ))}
              <Chip label="Other…" selected={otherOpen} onClick={() => setOtherOpen((v) => !v)} />
            </div>
            {otherOpen && (
              <label className="flex flex-col gap-1.5 text-[11px] font-medium text-text-secondary">
                Another area
                <select
                  value={zoneSlug ?? ''}
                  onChange={(e) => setZoneSlug(e.target.value || null)}
                  className="min-h-11 rounded-[10px] border border-border bg-surface px-3 text-[13px] text-text-primary"
                >
                  <option value="">Pick your area</option>
                  {waitingZones.map((z) => (
                    <option key={z.slug} value={z.slug}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {zone && (
              <section
                aria-labelledby="free-wash-offer"
                className={cn(
                  'flex flex-col gap-1 rounded-[16px] border p-4',
                  gone ? 'border-border' : 'border-[#1F5A3A] bg-[#0E2418]'
                )}
              >
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-success">
                  {gone ? 'Notify me' : 'Free wash'}
                </p>
                <h3 id="free-wash-offer" className="text-[17px] font-medium text-text-primary">
                  {gone ? `Be told when we reach ${zone.name}` : 'Your first car wash, free'}
                </h3>
                <p className="text-[13px] text-text-secondary">
                  {gone
                    ? `The ${FREE_WASH_RULES.perZone} free washes for ${zone.name} are taken. We'll still tell you the day we open.`
                    : `Up to ₹${FREE_WASH_RULES.maxRupees}, the day Detlio opens in ${zone.name}, for ${FREE_WASH_RULES.validDays} days. Saved to your account; we'll tell you.`}
                </p>
                <p className="text-[12px] text-text-muted">{waitingLine(zone.name, zone.waiting)}</p>
              </section>
            )}

            <div className="flex flex-col divide-y divide-line">
              <div className="flex min-h-14 items-center justify-between gap-3">
                <span className="text-[15px] text-text-primary">App notification</span>
                <ScSwitch label="App notification" checked={push} onChange={setPush} />
              </div>
              <div className="flex min-h-14 items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-[15px] text-text-primary">WhatsApp</span>
                  <span className="block text-[12px] text-text-muted">Saved for later; we don&apos;t send WhatsApp messages yet.</span>
                </span>
                <ScSwitch label="WhatsApp" checked={whatsapp} onChange={setWhatsapp} />
              </div>
            </div>

            {error && (
              <p role="alert" className="text-[13px] text-error">
                {error}
              </p>
            )}

            {!zone ? (
              <p className="text-[13px] text-text-secondary">Pick your area.</p>
            ) : user ? (
              <ScButton variant="main" size="lg" disabled={saving} onClick={() => void save()}>
                {saving ? 'Saving…' : gone ? 'Notify me' : 'Save my free wash'}
              </ScButton>
            ) : (
              <CheckoutSignInCard
                signIn={signIn}
                verifyLabel={gone ? 'Verify and notify me' : 'Verify and save my free wash'}
                onVerify={() => void verifyAndSave()}
                busy={saving}
              />
            )}
          </>
        )}
      </div>
    </ScSheet>
  )
}

/**
 * "Recommend a garage": its name, a Google Maps link or its phone, and why
 * (optional). A lead for the team; ₹100 of credit if it joins and the
 * customer books it there (placeholder amounts, owner to confirm). The
 * link, phone and note are masked for Clarity.
 */
export function RecommendForm({ zoneSlug, onDone }: { zoneSlug: string | null; onDone: () => void }) {
  const recommend = useRecommendGarage()
  const [name, setName] = useState('')
  const [mapsLink, setMapsLink] = useState('')
  const [phone, setPhone] = useState('')
  const [why, setWhy] = useState('')
  const [error, setError] = useState('')

  const ready = name.trim().length >= 2 && (mapsLink.trim().length > 0 || phone.trim().length > 0)

  const submit = async () => {
    setError('')
    try {
      await recommend.mutateAsync({
        zoneSlug: zoneSlug ?? undefined,
        name: name.trim(),
        mapsLink: mapsLink.trim() || undefined,
        phone: phone.trim() || undefined,
        why: why.trim() || undefined,
      })
      toast.success('Thanks! We’ll get in touch with them.')
      setName('')
      setMapsLink('')
      setPhone('')
      setWhy('')
      onDone()
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Couldn't send it. Try again.")
    }
  }

  return (
    <div className="flex flex-col gap-4" data-recommend-form="">
      <div>
        <h2 className="text-[20px] font-medium text-text-primary">Recommend a garage</h2>
        <p className="text-[13px] text-text-secondary">
          ₹{REFERRAL_CREDIT.perGarageRupees} Detlio credit if they join and you book them (up to ₹
          {REFERRAL_CREDIT.maxPerCustomerRupees}).
        </p>
      </div>
      <ScInput label="Garage name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      <ScInput
        data-clarity-mask="true"
        label="Google Maps link"
        inputMode="url"
        placeholder="https://maps.app.goo.gl/…"
        maxLength={500}
        value={mapsLink}
        onChange={(e) => setMapsLink(e.target.value)}
      />
      <ScInput
        data-clarity-mask="true"
        label="Or their phone"
        inputMode="tel"
        placeholder="10-digit mobile"
        maxLength={14}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <ScTextarea
        data-clarity-mask="true"
        label="Why they're good (optional)"
        maxLength={500}
        rows={3}
        value={why}
        onChange={(e) => setWhy(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-[13px] text-error">
          {error}
        </p>
      )}
      <ScButton variant="main" disabled={!ready || recommend.isPending} onClick={() => void submit()}>
        {recommend.isPending ? 'Sending…' : 'Send recommendation'}
      </ScButton>
    </div>
  )
}

/** The small "Recommend" link's sheet. */
export function RecommendSheet({ open, onClose, zoneSlug }: { open: boolean; onClose: () => void; zoneSlug: string | null }) {
  return (
    <ScSheet open={open} onClose={onClose} aria-label="Recommend a garage">
      <div className="px-5 pt-2 pb-2">{open && <RecommendForm zoneSlug={zoneSlug} onDone={onClose} />}</div>
    </ScSheet>
  )
}
