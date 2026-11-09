import type { ComponentType } from 'react'

/**
 * The lit tab's orb of the bottom bar (F, the red-glow mockup, held still):
 * a graphite well with a thin ring of light. It pops in once when its tab
 * is reached and never turns (one-shot motion only). Used by the customer
 * app's HubNav and Garage Book's bar in the garage portal; CSS in
 * packages/ui/styles/finish.css (.hub-orb).
 */
export function LitOrb({ icon: Icon }: { icon: ComponentType<{ size?: number; className?: string }> }) {
  return (
    <span aria-hidden="true" className="hub-orb fx-pop">
      <span className="hub-orb__bloom" />
      <span className="hub-orb__well" />
      <span className="hub-orb__ring" />
      <Icon size={17} className="relative" />
    </span>
  )
}

/** The brushed metal every silver tab icon is stroked with (`.hub-tab svg`). Once per page. */
export function MetalGradient() {
  return (
    <svg width="0" height="0" aria-hidden="true" className="absolute">
      <defs>
        <linearGradient id="hub-metal" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="24">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".55" stopColor="#d9d9de" />
          <stop offset="1" stopColor="#9c9ca6" />
        </linearGradient>
      </defs>
    </svg>
  )
}
