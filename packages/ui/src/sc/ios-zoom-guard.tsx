'use client'

import { useEffect } from 'react'

/**
 * Pinch-zoom for everyone, without iOS zooming into every form field.
 *
 * The layouts used to set `maximum-scale=1` for all browsers. On iOS that
 * only stops Safari zooming into a focused field drawn under 16px (most of
 * ours are 13px) — iOS ignores it for pinch-zoom since iOS 10 — but Android's
 * Chrome obeys it, so nobody on Android could zoom at all (WCAG 1.4.4). The
 * layouts now leave zoom alone, and this adds the cap back on iOS only, where
 * it does nothing but stop that jump.
 *
 * Watched rather than set once: Next rewrites the viewport tag when a route
 * declares its own (the homepage allows zoom to 5x, and keeps its value — it
 * has no fields), which would drop the cap on the next screen.
 */
export function IosZoomGuard() {
  useEffect(() => {
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      // iPadOS asks for desktop pages and calls itself a Mac.
      (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
    if (!ios) return

    const apply = () => {
      const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
      if (meta && !meta.content.includes('maximum-scale')) {
        meta.content = `${meta.content}, maximum-scale=1`
      }
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['content'],
    })
    return () => observer.disconnect()
  }, [])

  return null
}
