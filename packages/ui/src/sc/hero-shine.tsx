'use client'

import { useEffect, useRef, useState } from 'react'

/** The hero's shine, as globals.css names it. */
export const HERO_SHINE = 'cta-shine-intro'

/**
 * Keeps a hero button's shine (ScButton "hero") to one run per visit.
 *
 * The band of light is a ::after animation, and CSS starts it over whenever
 * the band comes back. A disabled hero hides it, so without this Pay would
 * sweep twice more each time it is enabled again — after every Razorpay sheet
 * the customer closes without paying — and so would Save car each time the
 * form turns valid again, or checkout's Pay each time it steps back to "Pick
 * a time" and returns. Two sweeps per visit (plan D4) is what the owner
 * approved and what makes the motion acceptable under WCAG 2.2.2, so once the
 * run has ended, or tries to start over, the button is marked rested and
 * `.cta-hero-rested` keeps the band off it until the screen is opened again
 * (a new <button>).
 *
 * Listened for on the element itself (animation events for a ::after fire on
 * its button), so the hook needs only the ref and a caller's own handlers
 * are left alone. The run counts as spent when it ends, or when the band
 * starts a second time — the restart the CSS would otherwise play out in
 * full. (Cut short by `display: none`, a run ends with an animationcancel
 * that React does not expose and not every browser sends, so the restart is
 * the signal that does not depend on it.) A restart is caught as its sweep
 * begins, after the 0.6s delay in which the band is parked off the button's
 * left edge, so the customer never sees it.
 *
 * The spent shine belongs to that one <button>: a sheet that closes and opens
 * again draws a new one, and that is a new visit with its own shine.
 * `enabled` false attaches nothing, so a button drawn without the hero look
 * behaves as it always has.
 */
export function useHeroShine<T extends HTMLElement>(enabled = true) {
  // State, not a ref, so a new element (the sheet opened again) re-runs the
  // effect and starts unspent.
  const [button, setButton] = useState<T | null>(null)
  const [restedOn, setRestedOn] = useState<T | null>(null)
  // The button whose band has already started once.
  const startedOn = useRef<T | null>(null)
  const rested = button !== null && restedOn === button

  useEffect(() => {
    if (!enabled || !button || rested) return
    const started = (event: AnimationEvent) => {
      if (event.animationName !== HERO_SHINE) return
      if (startedOn.current === button) setRestedOn(button)
      else startedOn.current = button
    }
    const ended = (event: AnimationEvent) => {
      if (event.animationName === HERO_SHINE) setRestedOn(button)
    }
    button.addEventListener('animationstart', started)
    button.addEventListener('animationend', ended)
    return () => {
      button.removeEventListener('animationstart', started)
      button.removeEventListener('animationend', ended)
    }
  }, [enabled, button, rested])

  // `attach` goes on the button as its ref; a plain state setter, read by
  // nothing during render.
  return { attach: setButton, className: rested ? 'cta-hero-rested' : undefined }
}
