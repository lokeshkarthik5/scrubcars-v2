'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'
import { useQueryClient } from '@tanstack/react-query'
import { IconLoader2 } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@/components/ui/card'
import { useHeroShine } from '@repo/ui/sc/hero-shine'
import { Chip } from '@repo/ui/sc/chip'
import { SkeletonCard } from '@repo/ui/sc/empty-state'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { TopBar } from '@repo/ui/sc/top-bar'
import { ApiError } from '@repo/core/api/client'
import {
  buyGift,
  makeGiftLink,
  verifyGiftPayment,
  type GiftLink,
  type SentGift,
} from '@repo/core/api/gifts'
import {
  giftsEnabled,
  invalidateGiftData,
  useGiftsConfig,
} from '@repo/core/api/hooks/use-gifts'
import {
  openRazorpayCheckout,
  RazorpayReportedError,
} from '@repo/core/razorpay'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { useUserStore } from '@repo/core/stores/user-store'
import { CustomerShell } from '@/components/customer-shell'
import { GiftShare } from '@/components/gifts/gift-share'
import { GiftsUnavailable } from '@/components/gifts/gifts-unavailable'
import { PremiumCard } from '@/components/premium-card/premium-card'
import { isHomeHubEnabled } from '@/lib/home-hub'
import {
  GIFT_ART_LABELS,
  GIFT_ARTS,
  giftAmountProblem,
  giftRupees,
  parseGiftAmount,
  type GiftArt,
} from '@/lib/gifts'
import { giftCardSpec } from '@/lib/premium-card'
import { fill, useT } from '@repo/core/i18n'

const NAME_MAX = 60
const MESSAGE_MAX = 200

/**
 * Where the purchase is: filling the form; paid and being confirmed; done,
 * with the link to share; or paid but not confirmed here (the answer was
 * lost, or the link could not be made), in which case Gifts you sent shows
 * the gift once the payment lands, with Get the link.
 */
type Phase =
  | { kind: 'form' }
  | { kind: 'confirming' }
  | { kind: 'shared'; gift: SentGift; link: GiftLink }
  | { kind: 'unconfirmed'; paid: boolean }

/**
 * Profile → Gifts you sent → Gift a wash (0049): an amount, who it is for,
 * an optional message and a card, then Razorpay. Once the payment is
 * verified, one link is made for the buyer to share (each new link ends the
 * one before, so it is made once here and never again on its own).
 */
export default function NewGiftPage() {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const ready = useAuthStore((s) => s.isSessionReady)
  const profile = useUserStore((s) => s.profile)
  const config = useGiftsConfig()

  const [preset, setPreset] = useState<number | 'other'>(1000)
  const [otherAmount, setOtherAmount] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [message, setMessage] = useState('')
  const [art, setArt] = useState<GiftArt>('shine')
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'form' })
  // Pay is the screen's one red action: Home's gradient pill, its shine run
  // once per visit however often the button turns disabled and back.
  const { attach: attachPayShine, className: payShineClass } =
    useHeroShine<HTMLButtonElement>()

  const title = phase.kind === 'shared' ? t('Share your gift') : t('Gift a wash')
  const header = (
    <TopBar
      title={title}
      showBack
      backHref="/profile/gifts"
      large={isHomeHubEnabled()}
    />
  )

  if (ready && !user) {
    return (
      <CustomerShell showNav showBrand className="gap-4 py-4">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-t3 font-semibold text-text-primary">
            {t('Sign in to gift a wash')}
          </p>
          <ScButton
            variant="main"
            className="mt-2 w-auto px-8"
            onClick={() =>
              router.push(
                `/login?next=${encodeURIComponent('/profile/gifts/new')}`
              )
            }
          >
            {t('Sign in')}
          </ScButton>
        </div>
      </CustomerShell>
    )
  }

  if (!ready || config.isPending) {
    return (
      <CustomerShell showNav showBrand className="gap-4 py-4">
        {header}
        <div className="flex flex-col gap-3" aria-busy="true">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </CustomerShell>
    )
  }

  if (!giftsEnabled(config.data)) {
    return (
      <CustomerShell showNav showBrand className="gap-4 py-4">
        {header}
        <GiftsUnavailable />
      </CustomerShell>
    )
  }

  const limits = config.data
  // Every card the server offers (all six today), in the app's order.
  const arts = GIFT_ARTS.filter((value) => limits.designs.includes(value))
  const amount = preset === 'other' ? parseGiftAmount(otherAmount) : preset
  const amountProblem = giftAmountProblem(amount, limits)
  const name = recipientName.trim()
  const canPay = !amountProblem && name.length > 0 && !paying

  const pay = async () => {
    if (!canPay || amount === null) return
    setPaying(true)
    setError(null)
    try {
      const order = await buyGift({
        amount,
        recipientName: name,
        message: message.trim() || undefined,
        design: art,
      })
      await openRazorpayCheckout({
        order,
        description: t('Detlio gift for {name}', { name }),
        customer: { name: profile?.name, phone: profile?.phone },
        onSuccess: async (response) => {
          setPhase({ kind: 'confirming' })
          let gift: SentGift
          try {
            gift = (
              await verifyGiftPayment(order.giftId, {
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              })
            ).gift
          } catch {
            // Razorpay took the money; its webhook marks the gift paid on
            // its own, and Gifts you sent offers the link from then on.
            void invalidateGiftData(queryClient)
            setPhase({ kind: 'unconfirmed', paid: false })
            return
          }
          void invalidateGiftData(queryClient)
          try {
            // Once, here: a second call would end this link.
            const link = await makeGiftLink(gift.id)
            setPhase({
              kind: 'shared',
              gift: { ...gift, linkMade: true },
              link,
            })
          } catch {
            setPhase({ kind: 'unconfirmed', paid: true })
          }
        },
        onDismiss: () => {
          toast.info(t('Payment cancelled. Nothing was charged.'))
        },
        onFailure: (failure) => {
          toast.error(failure)
        },
      })
    } catch (err) {
      // GIFT_DAILY_LIMIT and the rest come with a sentence for the customer.
      // What the payment sheet reported has been shown once already.
      if (err instanceof ApiError) setError(err.message)
      else if (!(err instanceof RazorpayReportedError) && err instanceof Error)
        setError(err.message)
    } finally {
      setPaying(false)
    }
  }

  if (phase.kind === 'shared') {
    return (
      <CustomerShell showNav showBrand className="gap-4 py-4">
        {header}
        <GiftShare gift={phase.gift} link={phase.link} />
        <Link
          href="/profile/gifts"
          className="flex min-h-11 items-center justify-center text-t4 font-medium text-text-secondary hover:text-text-primary"
        >
          {t('Done')}
        </Link>
      </CustomerShell>
    )
  }

  if (phase.kind === 'confirming' || phase.kind === 'unconfirmed') {
    return (
      <CustomerShell showNav showBrand className="gap-4 py-4">
        {header}
        {phase.kind === 'confirming' ? (
          <p
            role="status"
            className="flex items-center gap-2 py-8 text-t4 text-text-secondary"
          >
            <IconLoader2
              size={16}
              className="shrink-0 animate-spin"
              aria-hidden="true"
            />
            {t('Payment received. Getting your gift ready…')}
          </p>
        ) : (
          <ScCard className="flex flex-col gap-3">
            <p role="status" className="text-t4 text-text-primary">
              {phase.paid
                ? t("Your gift is paid, but we couldn't make its link just now.")
                : t("Payment received. We couldn't confirm it here yet.")}
            </p>
            <p className="text-t5 text-text-secondary">
              {t("Your gift shows in Gifts you sent once the payment is confirmed, usually within a few minutes. Tap Get the link there to share it. You won't be charged again.")}
            </p>
            <ScButton
              variant="secondary"
              className="min-h-11"
              onClick={() => router.push('/profile/gifts')}
            >
              {t('Go to Gifts you sent')}
            </ScButton>
          </ScCard>
        )}
      </CustomerShell>
    )
  }

  return (
    <CustomerShell showNav showBrand className="gap-4 py-4">
      {header}

      {/* The card as it will look, a little smaller than on the share screen so the form stays near. */}
      <PremiumCard
        key={art}
        spec={giftCardSpec({
          design: art,
          amount,
          recipientName: name,
          validMonths: limits.validMonths,
        })}
        className="mx-auto max-w-[300px]"
      />

      <section aria-labelledby="gift-design" className="flex flex-col gap-2">
        <h2
          id="gift-design"
          className="text-sm font-semibold text-text-primary"
        >
          {t('Card')}
        </h2>
        <div
          role="radiogroup"
          aria-labelledby="gift-design"
          className="grid grid-cols-3 gap-x-2.5 gap-y-3"
        >
          {arts.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={art === value}
              onClick={() => setArt(value)}
              className="gift-swatch flex flex-col gap-1.5 rounded-[12px] text-left focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              <PremiumCard
                spec={giftCardSpec({
                  design: value,
                  amount,
                  validMonths: limits.validMonths,
                })}
                size="mini"
                animate={false}
              />
              <span
                className={
                  art === value
                    ? 'text-t5 font-semibold text-text-primary'
                    : 'text-t5 text-text-secondary'
                }
              >
                {t(GIFT_ART_LABELS[value])}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="gift-amount" className="flex flex-col gap-2">
        <h2
          id="gift-amount"
          className="text-sm font-semibold text-text-primary"
        >
          {t('Amount')}
        </h2>
        <div className="flex flex-wrap gap-2">
          {limits.presets.map((value) => (
            <Chip
              key={value}
              label={giftRupees(value)}
              selected={preset === value}
              onClick={() => setPreset(value)}
              className="font-numeric"
            />
          ))}
          <Chip
            label={t('Other amount')}
            selected={preset === 'other'}
            onClick={() => setPreset('other')}
          />
        </div>
        {preset === 'other' && (
          <div className="flex flex-col gap-1">
            <ScInput
              data-clarity-mask="true"
              label={t('Amount ({giftRupees} to {giftRupees2})', { giftRupees: giftRupees(limits.min), giftRupees2: giftRupees(limits.max) })}
              inputMode="numeric"
              placeholder={String(limits.min)}
              value={otherAmount}
              onChange={(e) =>
                setOtherAmount(e.target.value.replace(/[^\d]/g, '').slice(0, 5))
              }
              className="font-numeric"
            />
            {otherAmount && amountProblem && (
              <p className="text-t5 text-error">{amountProblem}</p>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="gift-for" className="flex flex-col gap-3">
        <h2 id="gift-for" className="text-sm font-semibold text-text-primary">
          {t("Who it's for")}
        </h2>
        <ScInput
          data-clarity-mask="true"
          label={t('Their name')}
          autoComplete="off"
          maxLength={NAME_MAX}
          value={recipientName}
          onChange={(e) => setRecipientName(e.target.value)}
        />
        <div className="flex flex-col gap-1">
          <ScTextarea
            data-clarity-mask="true"
            label={t('Message (optional)')}
            rows={3}
            maxLength={MESSAGE_MAX}
            value={message}
            onChange={(e) =>
              setMessage(e.target.value.replace(/[\r\n]+/g, ' '))
            }
          />
          <p className="text-right text-t5 text-text-muted">
            <span className="font-numeric">{message.length}</span>/
            <span className="font-numeric">{MESSAGE_MAX}</span>
          </p>
        </div>
      </section>

      <p className="text-t5 text-text-secondary">
        {fill(t('They can use it on any booking on Detlio for {validMonths} months from today. You get a link to send them after paying. Up to {giftRupees} of gifts a day.'), { validMonths: <span className="font-numeric">{limits.validMonths}</span>, giftRupees: <span className="font-numeric">{giftRupees(limits.dailyLimit)}</span> })}
      </p>

      {error && (
        <p role="alert" className="text-t5 text-error">
          {error}
        </p>
      )}

      <ScButton
        ref={attachPayShine}
        variant="hero"
        onClick={() => void pay()}
        disabled={!canPay}
        className={payShineClass}
      >
        {/* The label sits above the band of light only as an element of its own. */}
        <span>
          {paying ? (
            t('Opening payment…')
          ) : amount !== null && !amountProblem ? (
            <>
              {fill(t('Pay {giftRupees}'), { giftRupees: <span className="font-numeric font-bold">
                {giftRupees(amount)}
              </span> })}
            </>
          ) : (
            t('Pay')
          )}
        </span>
      </ScButton>
    </CustomerShell>
  )
}
