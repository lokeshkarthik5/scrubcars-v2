'use client'

import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  type ComponentProps,
} from 'react'
import { ScTextarea } from '@repo/ui/sc/input'

/**
 * A text box that grows with its text, so nothing is ever cut off behind a
 * scroll bar (owner, 28 Oct 2026: "the description box was clipped"). It
 * starts at `rows` lines and grows from there; the page scrolls, not the box.
 */
export const AutoGrowTextarea = forwardRef<
  HTMLTextAreaElement,
  ComponentProps<typeof ScTextarea>
>(function AutoGrowTextarea({ value, className, style, ...props }, ref) {
  const inner = useRef<HTMLTextAreaElement | null>(null)
  const setRefs = useCallback(
    (node: HTMLTextAreaElement | null) => {
      inner.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref]
  )

  // Measured after every change of text, and when the box's width changes
  // (a turned phone, a wider column): shrink to nothing, then take the
  // height the text needs (its border included).
  useLayoutEffect(() => {
    const box = inner.current
    if (!box) return
    const fit = () => {
      box.style.height = 'auto'
      const border = box.offsetHeight - box.clientHeight
      box.style.height = `${box.scrollHeight + border}px`
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    let width = box.clientWidth
    const observer = new ResizeObserver(() => {
      if (box.clientWidth === width) return
      width = box.clientWidth
      fit()
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [value])

  return (
    <ScTextarea
      ref={setRefs}
      value={value}
      className={['resize-none overflow-hidden', className]
        .filter(Boolean)
        .join(' ')}
      style={style}
      {...props}
    />
  )
})
