import { Fragment } from 'react'

/**
 * A label whose figures — "₹599", "₹399–₹7999", "45" — set in the brand's
 * numeric face while its words stay in Inter. The guideline keeps Space
 * Grotesk to numbers, and price labels mix the two: "from ₹599",
 * "₹500 inspection", "Price on request".
 */
const FIGURES = /(₹?\d[\d,.]*(?:\s?[–-]\s?₹?\d[\d,.]*)?)/

export function Figures({ text }: { text: string }) {
  return text.split(FIGURES).map((part, index) =>
    // split() with a capture group puts the matches at the odd indices.
    index % 2 === 1 ? (
      <span key={index} className="font-numeric">
        {part}
      </span>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    )
  )
}
