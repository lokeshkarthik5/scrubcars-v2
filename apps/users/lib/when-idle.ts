/** Runs `run` once the page has loaded and the browser is idle; returns a cancel. */
export function whenIdle(run: () => void): () => void {
  let cancelled = false
  let idle: number | undefined
  let timer: number | undefined
  const go = () => {
    if (cancelled) return
    if (typeof window.requestIdleCallback === 'function') {
      idle = window.requestIdleCallback(() => {
        if (!cancelled) run()
      })
    } else {
      timer = window.setTimeout(() => {
        if (!cancelled) run()
      }, 1)
    }
  }
  if (document.readyState === 'complete') go()
  else window.addEventListener('load', go, { once: true })
  return () => {
    cancelled = true
    window.removeEventListener('load', go)
    if (idle !== undefined) window.cancelIdleCallback?.(idle)
    if (timer !== undefined) window.clearTimeout(timer)
  }
}
