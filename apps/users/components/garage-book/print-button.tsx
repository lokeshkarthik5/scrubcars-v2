'use client'

/** Print (or save as PDF): the page's print CSS leaves the paper alone on white. */
export function PrintButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      Print or save as PDF
    </button>
  )
}
