'use client'

import { useEffect, useRef } from 'react'

const LEAVE_MESSAGE = 'Leave without saving? Your unsaved changes will be lost.'

/**
 * Asks before the page is left while `dirty`: the browser's own prompt for a
 * reload, a closed tab or a typed address; a confirm for the panel's own
 * links (the back arrow, the menu), which the App Router gives no way to
 * block; and a confirm for Back — the browser's button, Android's back and
 * the iPhone's edge swipe, which is how the owner usually leaves a page.
 *
 * Links: listens in the capture phase on window, so it is asked before the
 * link's own click handler runs and can stop it.
 *
 * Back: the App Router handles Back on the client, so `beforeunload` never
 * fires for it. While dirty, one extra history entry with this page's own
 * address sits on top (the guard), so Back first lands on this page's real
 * entry and the page is still here to ask. Staying steps forward onto the
 * guard again; leaving takes the step Back meant. The guard is taken off as
 * soon as the page is clean, so a clean page needs one Back, as before.
 * popstate is heard in the capture phase, which on window runs before the
 * App Router's own listener, so the router can be kept out of a step that
 * only moves between this page and its guard.
 */
export function useWarnBeforeLeaving(dirty: boolean) {
  // Set while the page is going away, so the guard is not "taken off" by
  // stepping Back over a navigation that has already happened. Declared
  // before the effect below so React runs its cleanup first.
  const unmounting = useRef(false)
  useEffect(() => {
    unmounting.current = false
    return () => {
      unmounting.current = true
    }
  }, [])

  useEffect(() => {
    if (!dirty) return

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Older browsers show the prompt only when this is set.
      event.returnValue = ''
    }

    const onClick = (event: MouseEvent) => {
      // A modified click opens a new tab and leaves this one as it is.
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element | null)?.closest?.('a[href]')
      if (!(link instanceof HTMLAnchorElement)) return
      if (link.target && link.target !== '_self') return
      if (link.hasAttribute('download')) return

      const url = new URL(link.href, window.location.href)
      // Only links that leave this page in this tab: tel:, WhatsApp and the
      // like open elsewhere, and a #hash stays put.
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return

      if (!window.confirm(LEAVE_MESSAGE)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    // ─── Back ────────────────────────────────────────────────────────────────
    const pagePath = window.location.pathname
    // The guard: this page's address and the router's own state for it, so
    // the router reads it as this page if it ever does see it.
    const guardState: unknown = window.history.state
    const guardHref = window.location.href
    window.history.pushState(guardState, '', guardHref)
    let onGuard = true
    // The next popstate is our own step forward onto the guard.
    let returning = false

    const onPopState = (event: PopStateEvent) => {
      if (returning) {
        returning = false
        onGuard = true
        event.stopImmediatePropagation()
        return
      }
      if (!onGuard) return
      onGuard = false
      // One step back from the guard is this same page; a long-press on Back
      // can jump further, to another page.
      const samePage = window.location.pathname === pagePath

      if (window.confirm(LEAVE_MESSAGE)) {
        stopListening()
        if (samePage) {
          // Only the guard was stepped over: take the step Back meant.
          event.stopImmediatePropagation()
          window.history.back()
        }
        // Another page: the router's own listener, next, goes there.
        return
      }

      event.stopImmediatePropagation()
      if (samePage) {
        // Forward onto the guard, which still has the open tab's address.
        returning = true
        window.history.forward()
      } else {
        window.history.pushState(guardState, '', guardHref)
        onGuard = true
      }
    }

    const stopListening = () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('popstate', onPopState, true)
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('click', onClick, true)
    window.addEventListener('popstate', onPopState, true)
    return () => {
      stopListening()
      if (!onGuard || unmounting.current) return
      // Clean again (saved, discarded, typed back): step off the guard so
      // Back means Back again, keeping the address the guard had by then (a
      // tab opened since), and without the router re-rendering the page.
      const href = window.location.href
      const settle = (event: PopStateEvent) => {
        window.removeEventListener('popstate', settle, true)
        event.stopImmediatePropagation()
        window.history.replaceState(window.history.state, '', href)
      }
      window.addEventListener('popstate', settle, true)
      window.history.back()
    }
  }, [dirty])
}
