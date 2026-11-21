'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { IconBrandWhatsapp, IconCheck, IconCircleCheck, IconGift, IconX } from '@tabler/icons-react'
import { ScSheet } from '@repo/ui/sc/modal'
import { ScButton, scButtonClass } from '@repo/ui/sc/button'
import { ScSegmented } from '@repo/ui/sc/segmented'
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
import { useCustomerPlace } from '@repo/core/hooks/use-customer-place'
import {
  bringGarageMessage,
  bringGarageWhatsAppHref,
  recommendCreditLine,
  recommendDoneRule,
  referralAmountLabel,
  whatsAppNumber,
  whatsAppReady,
  type RecommendChannel,
} from '@repo/core/bring-garage'
import { zoneFor, type Zone } from '@repo/core/zones'
import { cn } from '@repo/core/utils'
import { CheckoutSignInCard, useCheckoutSignIn } from '@/components/checkout/checkout-sign-in'
import { fill, useT } from '@repo/core/i18n'
import { t } from '@repo/core/i18n/translate'

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
 *
 * Only in a city the owner has marked "Growing here" (0070): the card says
 * more garages are coming, and in a city with just a partner garage nobody
 * has promised that. Chennai is growing, so nothing changes there.
 */
export function FreeWashPiece({ placement }: { placement: 'top' | 'bottom' }) {
  const { city } = useCustomerPlace()
  if (!city.growing) return null
  return <FreeWashPieceInGrowingCity placement={placement} />
}

function FreeWashPieceInGrowingCity({ placement }: { placement: 'top' | 'bottom' }) {
  const t = useT()
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

  // The sheets sit in one place whatever the piece shows: the sign-up turns
  // the card into the slim line (the area status refetches), and the sheet,
  // open on "You're on the list" and its recommend ask, must outlive that.
  const sheets = (
    <>
      <FreeWashSheet open={sheetOpen} onClose={() => setSheetOpen(false)} initialZone={zone} />
      <RecommendSheet open={recommendOpen} onClose={() => setRecommendOpen(false)} zoneSlug={zone.slug} />
    </>
  )

  if (signedUp) {
    return (
      <>
        <OnTheListLine area={zone.name} onRecommend={() => setRecommendOpen(true)} />
        {sheets}
      </>
    )
  }
  if (!showCard) return sheets

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
          <h2 id={`free-wash-${placement}`} className="text-t3 font-medium text-text-primary">
            {freeWashCardTitle(zone.name)}
          </h2>
          <p className="text-t5 text-text-secondary">
            {t('No garage in your area yet · {waitingLine}', { waitingLine: waitingLine(zone.name, zone.waiting) })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="press flex min-h-11 shrink-0 items-center rounded-full bg-brand-white px-4 text-[14px] font-medium text-brand-black"
        >
          {t('Claim')}
        </button>
        <button
          type="button"
          onClick={close}
          aria-label={t('Close the free wash card')}
          className="-mr-2 grid size-11 shrink-0 place-items-center text-text-secondary"
        >
          <IconX size={18} aria-hidden />
        </button>
      </section>
      {sheets}
    </>
  )
}

/** "✓ On the list for <Area> · Recommend": the one slim line once signed up. */
export function OnTheListLine({ area, onRecommend }: { area: string; onRecommend: () => void }) {
  const t = useT()
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-[14px] border border-border px-4" data-on-the-list="">
      <p className="flex items-center gap-1.5 text-t4 text-text-primary">
        <IconCheck size={15} className="text-success" aria-hidden />
        {t('On the list for {area}', { area })}
      </p>
      <button type="button" onClick={onRecommend} className="min-h-11 text-t4 text-text-primary underline underline-offset-2">
        {t('Recommend')}
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
    toast.info(t("We couldn't turn on notifications on this phone. You can from Profile → Notifications."))
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
  const t = useT()
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
      setError(err instanceof ApiError || err instanceof Error ? err.message : t("Couldn't save it. Try again."))
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
      aria-label={recommending ? t('Recommend a garage') : done ? t("You're on the list") : t('Which area are you in?')}
    >
      <div className="flex flex-col gap-5 px-5 pt-2 pb-2" data-free-wash-sheet="">
        {done && recommending ? (
          <RecommendForm zoneSlug={done.slug} onDone={close} />
        ) : done ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <IconCircleCheck size={44} className="text-success" aria-hidden />
            <h2 className="text-[20px] font-medium text-text-primary">{t("You're on the list")}</h2>
            <p className="text-t3 text-text-secondary">
              {t("We'll tell you the day Detlio opens in {area}.", { area: done.area })}
              {done.freeWash ? ` ${t('Your free wash is saved.')}` : ''}
            </p>
            <div className="flex w-full items-start gap-3 rounded-[16px] border border-[#1F5A3A] bg-[#0E2418] p-4 text-left">
              <IconGift size={20} className="mt-0.5 shrink-0 text-success" aria-hidden />
              <p className="text-[14px] text-text-primary">{recommendAsk()}</p>
            </div>
            <ScButton variant="outline" onClick={() => setRecommending(true)}>
              {t('Recommend a garage')}
            </ScButton>
            <ScButton variant="text" onClick={close}>
              {t('Not now')}
            </ScButton>
          </div>
        ) : (
          <>
            <div>
              <h2 className="text-[20px] font-medium text-text-primary">{t('Which area are you in?')}</h2>
              <p className="text-t4 text-text-secondary">
                {gone
                  ? t("We're not in your area yet. Tell us, and we’ll tell you when we arrive.")
                  : t("We're not in your area yet. Tell us, and your first wash is on us when we arrive.")}
              </p>
            </div>
            <div role="group" aria-label={t('Your area')} className="flex flex-wrap gap-2">
              {chips.map((z) => (
                <Chip key={z.slug} label={z.name} selected={zoneSlug === z.slug} onClick={() => setZoneSlug(z.slug)} />
              ))}
              <Chip label={t('Other…')} selected={otherOpen} onClick={() => setOtherOpen((v) => !v)} />
            </div>
            {otherOpen && (
              <label className="flex flex-col gap-1.5 text-t5 font-medium text-text-secondary">
                {t('Another area')}
                <select
                  value={zoneSlug ?? ''}
                  onChange={(e) => setZoneSlug(e.target.value || null)}
                  className="min-h-11 rounded-[10px] border border-border bg-surface px-3 text-t4 text-text-primary"
                >
                  <option value="">{t('Pick your area')}</option>
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
                <p className="text-t5 font-medium uppercase tracking-[0.12em] text-success">
                  {gone ? t('Notify me') : t('Free wash')}
                </p>
                <h3 id="free-wash-offer" className="text-t2 font-medium text-text-primary">
                  {gone ? t('Be told when we reach {name}', { name: zone.name }) : t('Your first car wash, free')}
                </h3>
                <p className="text-t4 text-text-secondary">
                  {gone
                    ? t("The {count} free washes for {name} are taken. We'll still tell you the day we open.", { count: FREE_WASH_RULES.perZone, name: zone.name })
                    : t("Up to ₹{amount}, the day Detlio opens in {name}, for {days} days. Saved to your account; we'll tell you.", { amount: FREE_WASH_RULES.maxRupees, name: zone.name, days: FREE_WASH_RULES.validDays })}
                </p>
                <p className="text-t5 text-text-muted">{waitingLine(zone.name, zone.waiting)}</p>
              </section>
            )}

            <div className="flex flex-col divide-y divide-line">
              <div className="flex min-h-14 items-center justify-between gap-3">
                <span className="text-t3 text-text-primary">{t('App notification')}</span>
                <ScSwitch label={t('App notification')} checked={push} onChange={setPush} />
              </div>
              <div className="flex min-h-14 items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-t3 text-text-primary">WhatsApp</span>
                  <span className="block text-t5 text-text-muted">{t("Saved for later; we don't send WhatsApp messages yet.")}</span>
                </span>
                <ScSwitch label="WhatsApp" checked={whatsapp} onChange={setWhatsapp} />
              </div>
            </div>

            {error && (
              <p role="alert" className="text-t4 text-error">
                {error}
              </p>
            )}

            {!zone ? (
              <p className="text-t4 text-text-secondary">{t('Pick your area.')}</p>
            ) : user ? (
              <ScButton variant="main" size="lg" disabled={saving} onClick={() => void save()}>
                {saving ? t('Saving…') : gone ? t('Notify me') : t('Save my free wash')}
              </ScButton>
            ) : (
              <CheckoutSignInCard
                signIn={signIn}
                verifyLabel={gone ? t('Verify and notify me') : t('Verify and save my free wash')}
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
 * "Recommend a garage" (Bring your garage, mockup screens 2a, 2b and 4): a
 * switch between "Send to Detlio" — its name, a Google Maps link or its
 * phone, and why (optional), a lead the team calls — and "Send on
 * WhatsApp" — its name and the owner's WhatsApp number, a ready message
 * with the garage app's sign-up link, opened in the customer's own
 * WhatsApp. Both save the recommendation (Coverage sees it; a garage that
 * signs up with that number is linked to the customer), and both end on
 * "Thanks! We'll call them" with the ₹500 rule. The link, phone, note and
 * message are masked for Clarity. A guest signs in on the in-page card
 * first: a recommendation is tied to an account, so one person cannot
 * send fifty.
 */
export function RecommendForm({ zoneSlug, onDone }: { zoneSlug: string | null; onDone: () => void }) {
  const t = useT()
  const recommend = useRecommendGarage()
  const user = useAuthStore((s) => s.user)
  const signIn = useCheckoutSignIn()
  const [channel, setChannel] = useState<RecommendChannel>('detlio')
  const [name, setName] = useState('')
  const [mapsLink, setMapsLink] = useState('')
  const [phone, setPhone] = useState('')
  const [why, setWhy] = useState('')
  const [error, setError] = useState('')
  // The garage it went to: the done screen.
  const [sent, setSent] = useState<string | null>(null)
  // One save per WhatsApp message, however often the button is pressed.
  const savedWhatsApp = useRef<string | null>(null)

  const ready = name.trim().length >= 2 && (mapsLink.trim().length > 0 || phone.trim().length > 0)
  const message = bringGarageMessage(name, user?.name)
  const waHref = whatsAppReady(name, phone) ? bringGarageWhatsAppHref(phone, message) : null

  const reset = () => {
    setName('')
    setMapsLink('')
    setPhone('')
    setWhy('')
    setError('')
    savedWhatsApp.current = null
  }

  const submit = async () => {
    setError('')
    try {
      await recommend.mutateAsync({
        zoneSlug: zoneSlug ?? undefined,
        name: name.trim(),
        mapsLink: mapsLink.trim() || undefined,
        phone: phone.trim() ? (whatsAppNumber(phone) ?? phone.trim()) : undefined,
        why: why.trim() || undefined,
      })
      setSent(name.trim())
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : t("Couldn't send it. Try again."))
    }
  }

  // The link opens WhatsApp itself (a new tab or the app); this saves it alongside.
  const saveWhatsApp = async () => {
    const number = whatsAppNumber(phone)
    if (!number) return
    const key = `${name.trim()}|${number}`
    if (savedWhatsApp.current === key) {
      setSent(name.trim())
      return
    }
    savedWhatsApp.current = key
    setError('')
    try {
      await recommend.mutateAsync({ zoneSlug: zoneSlug ?? undefined, name: name.trim(), phone: number })
      setSent(name.trim())
    } catch (err) {
      savedWhatsApp.current = null
      setError(err instanceof ApiError || err instanceof Error ? err.message : t("Couldn't send it. Try again."))
    }
  }

  if (sent !== null) {
    return (
      <RecommendDone
        garage={sent}
        onAnother={() => {
          reset()
          setSent(null)
        }}
        onDone={() => {
          reset()
          setSent(null)
          onDone()
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4" data-recommend-form="">
      <div>
        <h2 className="text-[20px] font-medium text-text-primary">{t('Recommend a garage')}</h2>
        <p className="text-t4 text-text-secondary">{recommendCreditLine()}</p>
      </div>
      <ScSegmented
        aria-label={t('How to send')}
        value={channel}
        onChange={(next) => {
          setChannel(next)
          setError('')
        }}
        options={[
          { value: 'detlio', label: t('Send to Detlio') },
          { value: 'whatsapp', label: t('Send on WhatsApp'), icon: <IconBrandWhatsapp size={16} aria-hidden /> },
        ]}
      />
      {channel === 'detlio' ? (
        <>
          <ScInput label={t('Garage name')} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          <ScInput
            data-clarity-mask="true"
            label={t('Google Maps link')}
            inputMode="url"
            placeholder="https://maps.app.goo.gl/…"
            maxLength={500}
            value={mapsLink}
            onChange={(e) => setMapsLink(e.target.value)}
          />
          <ScInput
            data-clarity-mask="true"
            label={t('Or their phone')}
            inputMode="tel"
            placeholder={t('10-digit mobile')}
            maxLength={14}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <ScTextarea
            data-clarity-mask="true"
            label={t("Why they're good (optional)")}
            maxLength={500}
            rows={3}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-t4 text-error">
              {error}
            </p>
          )}
          {user ? (
            <ScButton variant="main" disabled={!ready || recommend.isPending} onClick={() => void submit()}>
              {recommend.isPending ? t('Sending…') : t('Send recommendation')}
            </ScButton>
          ) : (
            <CheckoutSignInCard
              signIn={signIn}
              verifyLabel={t('Verify and send')}
              onVerify={() => {
                if (!ready) {
                  setError(t('Give the garage’s name, and a Google Maps link or their phone.'))
                  return
                }
                void signIn.verify().then((ok) => (ok ? submit() : undefined))
              }}
              busy={recommend.isPending}
            />
          )}
        </>
      ) : (
        <>
          <p className="text-t4 text-text-secondary">
            {t('We write the message. You send it to the garage owner from your own WhatsApp.')}
          </p>
          <ScInput label={t('Garage name')} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          <ScInput
            data-clarity-mask="true"
            label={t('Their WhatsApp number')}
            inputMode="tel"
            placeholder={t('10-digit mobile')}
            maxLength={14}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <section
            aria-labelledby="recommend-message"
            className="flex flex-col gap-1.5 rounded-[14px] border border-border bg-surface px-4 py-3.5"
          >
            <h3 id="recommend-message" className="text-t5 font-medium uppercase tracking-[0.12em] text-text-secondary">
              {t('Your message')}
            </h3>
            <p data-clarity-mask="true" className="whitespace-pre-line break-words text-t4 text-text-primary" lang="en">
              {message}
            </p>
          </section>
          {error && (
            <p role="alert" className="text-t4 text-error">
              {error}
            </p>
          )}
          {user ? (
            waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => void saveWhatsApp()}
                data-open-whatsapp=""
                className={scButtonClass({ variant: 'main' })}
              >
                <IconBrandWhatsapp size={18} aria-hidden />
                {t('Open WhatsApp')}
              </a>
            ) : (
              <ScButton
                variant="main"
                disabled
                disabledReason={t('Give the garage’s name and their 10-digit WhatsApp number.')}
              >
                <IconBrandWhatsapp size={18} aria-hidden />
                {t('Open WhatsApp')}
              </ScButton>
            )
          ) : (
            <CheckoutSignInCard
              signIn={signIn}
              verifyLabel={t('Verify and continue')}
              onVerify={() => {
                if (!whatsAppReady(name, phone)) {
                  setError(t('Give the garage’s name and their 10-digit WhatsApp number.'))
                  return
                }
                // Signed in, the button opens WhatsApp: a browser opens it only from a tap.
                void signIn.verify()
              }}
              busy={recommend.isPending}
            />
          )}
          <p className="text-center text-t5 text-text-muted">
            {t('Detlio sends nothing. You can change the words in WhatsApp before you send.')}
          </p>
        </>
      )}
    </div>
  )
}

/**
 * "Thanks! We'll call them" (mockup screen 4), after Send recommendation
 * and after Open WhatsApp: who we'll get in touch with, the ₹500 rule in
 * one line, Recommend another garage, Done.
 */
function RecommendDone({ garage, onAnother, onDone }: { garage: string; onAnother: () => void; onDone: () => void }) {
  const t = useT()
  return (
    <div className="flex flex-col items-center gap-3 text-center" data-recommend-done="">
      <IconCircleCheck size={44} className="text-success" aria-hidden />
      <h2 className="text-[20px] font-medium text-text-primary">{t('Thanks! We’ll call them')}</h2>
      <p className="text-t3 text-text-secondary">{t('We’ll get in touch with {name} and help them join.', { name: garage })}</p>
      <div className="flex w-full items-start gap-3 rounded-[16px] border border-[#1F5A3A] bg-[#0E2418] p-4 text-left">
        <IconGift size={20} className="mt-0.5 shrink-0 text-success" aria-hidden />
        <p className="text-[14px] text-text-primary">
          {fill(recommendDoneRule(), { amount: <strong className="font-semibold">{referralAmountLabel()}</strong> })}
        </p>
      </div>
      <ScButton variant="outline" onClick={onAnother}>
        {t('Recommend another garage')}
      </ScButton>
      <ScButton variant="text" onClick={onDone}>
        {t('Done')}
      </ScButton>
    </div>
  )
}

/** The small "Recommend" link's sheet. */
export function RecommendSheet({ open, onClose, zoneSlug }: { open: boolean; onClose: () => void; zoneSlug: string | null }) {
  const t = useT()
  return (
    <ScSheet open={open} onClose={onClose} aria-label={t('Recommend a garage')}>
      <div className="px-5 pt-2 pb-2">{open && <RecommendForm zoneSlug={zoneSlug} onDone={onClose} />}</div>
    </ScSheet>
  )
}
