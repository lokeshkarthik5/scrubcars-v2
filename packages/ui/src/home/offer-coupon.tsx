'use client'

import {
  Children,
  useCallback,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import {
  IconArrowUpRight,
  IconBuildingStore,
  IconSparkles,
  IconX,
} from '@tabler/icons-react'
import {
  formatOfferFigure,
  stripOfferCode,
  type OfferFigure,
} from '@repo/core/offer-figure'
import { cn } from '@repo/core/utils'

export type { OfferFigure } from '@repo/core/offer-figure'

export interface OfferCouponEyebrow {
  /** 'garage' shows a store icon, 'detlio' (a platform-wide offer) a sparkle. */
  kind: 'garage' | 'detlio'
  /** The garage's name, or "Detlio". Shown as "<label> · Offer". */
  label: string
}

export interface OfferCouponProps {
  eyebrow: OfferCouponEyebrow
  /** Up to 40 characters; wraps to two lines at most and the ticket grows. */
  title: string
  /**
   * One or two lines under the title, e.g. ['Up to ₹300', 'Till Sun 18 Oct'].
   * If a line still contains the code (the admin typed it into the
   * description), that part is dropped — the stub shows the code once.
   */
  metaLines?: string[]
  /** The stub's big figure: 20%, ₹100 / ₹1,000, or FREE. */
  figure: OfferFigure
  /** From the discount's Code field; shown in caps under the figure. */
  code: string
  /** The whole ticket is one target. Called on tap, with or without href. */
  onSelect?: () => void
  /** Renders the ticket as a link instead of a button. */
  href?: string
  /** Renders the × (40px hit area) on the stub. */
  onDismiss?: () => void
  /** Bill due: the bill above carries the one filled red button, so this steps back. */
  muted?: boolean
  className?: string
}

/**
 * The V2 "Coupon" offer tile: a pearl-white ticket on the dark Home, with a
 * fixed 104px stub on the right behind semicircle notches and a perforation.
 * The stub says the discount before a word is read; the code sits under it.
 *
 * Presentational only — the customer's Home and the admin's discount form
 * ("Preview on Home") both feed it, so the two can never drift. Styles live
 * under "Offer coupon (V2)" in packages/ui/styles/globals.css.
 */
export function OfferCoupon({
  eyebrow,
  title,
  metaLines = [],
  figure,
  code,
  onSelect,
  href,
  onDismiss,
  muted = false,
  className,
}: OfferCouponProps) {
  const fig = formatOfferFigure(figure)
  const trimmedCode = code.trim()
  const meta = metaLines
    .map((line) => stripOfferCode(line, trimmedCode))
    .filter(Boolean)
  const EyebrowIcon =
    eyebrow.kind === 'detlio' ? IconSparkles : IconBuildingStore

  // One name for the one target: what it is, where, the code, and when it ends.
  const label = [
    `${title} at ${eyebrow.label}`,
    trimmedCode && `code ${trimmedCode}`,
    ...meta,
    'use offer',
  ]
    .filter(Boolean)
    .join(', ')

  const body = (
    <>
      <span className="offer-coupon__main">
        <span className="offer-coupon__eyebrow">
          <EyebrowIcon
            size={15}
            stroke={1.5}
            aria-hidden
            className="shrink-0"
          />
          <span>{eyebrow.label} · Offer</span>
        </span>
        <span className="offer-coupon__title">{title}</span>
        {meta.length > 0 && (
          <span className="offer-coupon__meta">
            {meta.map((line, i) => (
              <span key={i}>{line}</span>
            ))}
          </span>
        )}
      </span>
      <span className="offer-coupon__stub">
        <span className="offer-coupon__figure" data-size={fig.size}>
          {fig.prefix && <small>{fig.prefix}</small>}
          {fig.value}
          {fig.suffix && <small>{fig.suffix}</small>}
        </span>
        {trimmedCode && (
          <span className="offer-coupon__code">
            <span>{trimmedCode}</span>
            <IconArrowUpRight size={14} stroke={1.8} aria-hidden />
          </span>
        )}
      </span>
    </>
  )

  return (
    <div className={cn('offer-coupon', className)} data-muted={muted}>
      <div className="offer-coupon__ticket">
        {href ? (
          <Link
            href={href}
            onClick={onSelect}
            aria-label={label}
            className="offer-coupon__hit"
          >
            {body}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onSelect}
            aria-label={label}
            className="offer-coupon__hit"
          >
            {body}
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Hide offer"
            className="offer-coupon__dismiss"
          >
            <IconX size={18} stroke={1.5} aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}

export interface OfferCarouselProps {
  /** One <OfferCoupon> per offer. One child renders alone: no peek, no dots. */
  children: ReactNode
  /** Names the carousel for screen readers. */
  label?: string
  className?: string
}

const SLIDE_GAP = 8

/**
 * The offers row on Home and in the admin preview: swipe between tickets,
 * the next one peeking 8px into the screen gutter at 58% opacity, and dots
 * under it. It never scrolls on its own.
 *
 * Its track runs 16px past the column on the right (into the page gutter),
 * so place it in a column with a 16px gutter, as Home is.
 */
export function OfferCarousel({
  children,
  label = 'Offers',
  className,
}: OfferCarouselProps) {
  const slides = Children.toArray(children)
  const trackRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  const slideStep = useCallback(() => {
    const first = trackRef.current?.firstElementChild as HTMLElement | null
    return first ? first.offsetWidth + SLIDE_GAP : 0
  }, [])

  const onScroll = useCallback(() => {
    const track = trackRef.current
    const step = slideStep()
    if (!track || !step) return
    const index = Math.min(
      slides.length - 1,
      Math.max(0, Math.round(track.scrollLeft / step))
    )
    setActive((prev) => (prev === index ? prev : index))
  }, [slideStep, slides.length])

  // A tap on the dimmed peek brings that offer in rather than using it.
  const onSlideClickCapture = (index: number) => (e: MouseEvent) => {
    if (index === active) return
    e.preventDefault()
    e.stopPropagation()
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    trackRef.current?.scrollTo({
      left: index * slideStep(),
      behavior: reduce ? 'auto' : 'smooth',
    })
  }

  if (slides.length === 0) return null
  if (slides.length === 1) return <div className={className}>{slides[0]}</div>

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      className={className}
    >
      <div ref={trackRef} onScroll={onScroll} className="offer-carousel__track">
        {slides.map((slide, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`Offer ${i + 1} of ${slides.length}`}
            data-active={i === active}
            onClickCapture={onSlideClickCapture(i)}
            className="offer-carousel__slide"
          >
            {slide}
          </div>
        ))}
      </div>
      <div className="offer-carousel__dots" aria-hidden>
        {slides.map((_, i) => (
          <i key={i} data-on={i === active} />
        ))}
      </div>
    </div>
  )
}
