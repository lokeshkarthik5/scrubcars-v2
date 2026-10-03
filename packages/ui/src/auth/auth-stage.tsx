import Image from 'next/image'
import { TopBar } from '@repo/ui/sc/top-bar'

interface AuthStageProps {
  /** Photo under the card — the customer app uses the brand's spotlit car. */
  backdrop: string
  showBack?: boolean
  backHref?: string
  /** The card's content. */
  children: React.ReactNode
  /** Pinned under the card, e.g. the terms line. */
  footer?: React.ReactNode
}

/**
 * Staging for the sign-in screens: the photo full-width at the bottom, its
 * overhead light rising behind a frosted-glass card, under a dark wash with a
 * low red glow. Spans the whole viewport, so on a laptop the scene fills the
 * window while the card keeps the app's phone-width column.
 */
export function AuthStage({
  backdrop,
  showBack,
  backHref,
  children,
  footer,
}: AuthStageProps) {
  return (
    <div className="relative isolate min-h-dvh overflow-hidden bg-brand-black">
      <div
        aria-hidden
        // Wider than a phone screen, so the car has presence there; sized to
        // the viewport from sm up.
        className="absolute bottom-0 left-1/2 -z-20 aspect-[1170/910] w-[130%] max-w-[960px] -translate-x-1/2 sm:w-full"
      >
        <Image
          src={backdrop}
          alt=""
          fill
          priority
          sizes="(min-width: 960px) 960px, 130vw"
          className="object-cover object-bottom"
        />
      </div>
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,#0a0a0b_0%,rgb(10_10_11/0.55)_45%,rgb(10_10_11/0.15)_75%,rgb(10_10_11/0.7)_100%)]"
      />
      <div
        aria-hidden
        className="absolute -right-32 top-10 -z-10 size-[440px] rounded-full bg-[radial-gradient(closest-side,rgb(239_50_64/0.28),transparent)]"
      />
      <div
        aria-hidden
        className="absolute -left-40 bottom-48 -z-10 size-[380px] rounded-full bg-[radial-gradient(closest-side,rgb(239_50_64/0.14),transparent)]"
      />

      <div className="mx-auto flex min-h-dvh w-full max-w-[428px] flex-col px-4 py-4">
        <TopBar showBack={showBack} backHref={backHref} />
        <div className="flex flex-1 flex-col justify-center py-6">
          <div className="relative rounded-[20px] border border-white/[0.12] bg-[rgb(20_20_22/0.55)] px-6 pb-7 pt-8 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.9)] backdrop-blur-xl">
            {/* A fine highlight along the top edge, where light would catch
                the glass. */}
            <span
              aria-hidden
              className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"
            />
            {children}
          </div>
        </div>
        {footer}
      </div>
    </div>
  )
}
