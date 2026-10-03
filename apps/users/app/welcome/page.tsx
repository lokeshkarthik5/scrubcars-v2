'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { AppShell } from '@repo/ui/sc/app-shell'
import { BrandMark } from '@repo/ui/sc/brand-mark'
import { ScButton } from '@repo/ui/sc/button'
import { cn } from '@repo/core/utils'

const SLIDES = [
  {
    title: 'Pristine Care for\nYour Machine',
    body: "Access the region's top rated, certified auto spas. On-demand reservations, real-time queues, and premium detailing.",
  },
  {
    title: 'Book a Slot in\nSeconds',
    body: 'Pick a garage, choose your services, and lock a time that fits your day. No calls, no waiting.',
  },
  {
    title: 'At the Garage or\nAt Your Door',
    body: 'Drop in to a detailing bay or have a certified detailer come to you. Track every booking end to end.',
  },
]

export default function WelcomePage() {
  const router = useRouter()
  const [slide, setSlide] = useState(0)
  const active = SLIDES[slide]
  const isLast = slide === SLIDES.length - 1

  const handleNext = () => {
    if (isLast) router.push('/home')
    else setSlide((s) => s + 1)
  }

  return (
    <AppShell className="relative overflow-hidden px-0">
      {/* Spotlit car fills the upper two-thirds and fades into the page. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[70%]">
        <Image
          src="/onboarding-car.jpg"
          alt=""
          fill
          priority
          sizes="428px"
          className="object-cover"
        />
        {/* Two passes: the first sinks the photo's own floor edge, the second
            carries it to solid black well before the box ends so there's no seam. */}
        <div className="absolute inset-0 bg-gradient-to-b from-brand-black via-brand-black/10 to-brand-black" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-brand-black" />
      </div>

      <div className="relative z-10 flex flex-1 flex-col px-6 pb-8 pt-14">
        <BrandMark height={44} priority className="mx-auto" />

        <div className="mt-auto">
          <h2 className="whitespace-pre-line text-[30px] font-bold leading-[1.15] tracking-tight text-text-primary">
            {active.title}
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">{active.body}</p>

          <div className="mt-6 flex items-center gap-1.5">
            {SLIDES.map((s, i) => (
              <button
                key={s.title}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => setSlide(i)}
                className={cn(
                  'h-1 rounded-full transition-all',
                  // White for where you are; red is the Next button's.
                  i === slide ? 'w-6 bg-brand-white' : 'w-1.5 bg-text-muted'
                )}
              />
            ))}
          </div>

          <ScButton className="mt-7 rounded-full py-4 text-[15px]" onClick={handleNext}>
            {isLast ? 'Get Started' : 'Next'}
          </ScButton>
        </div>
      </div>
    </AppShell>
  )
}
