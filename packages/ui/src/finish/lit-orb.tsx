import type { ComponentType } from 'react'

/**
 * The lit tab's orb of the bottom bar (F, the red-glow mockup, as approved):
 * a graphite well with a thin ring of light that turns, the red spectrum one
 * way and a white light the other, with a soft bloom that turns with it. It
 * pops in when its tab is reached and then turns for as long as the tab is
 * lit; under reduced motion it is simply there, still. Only the lit tab
 * renders one, so one orb at most is ever moving. Used by the customer app's
 * HubNav, the garage portal's bar and Garage Book's bar; CSS in
 * packages/ui/styles/finish.css (.hub-orb).
 */
export function LitOrb({ icon: Icon }: { icon: ComponentType<{ size?: number; className?: string }> }) {
  return (
    <span aria-hidden="true" className="hub-orb fx-pop">
      <span className="hub-orb__bloom hub-orb__bloom--far">
        <i className="hub-orb__spec" />
        <i className="hub-orb__hot" />
      </span>
      <span className="hub-orb__bloom">
        <i className="hub-orb__spec" />
        <i className="hub-orb__hot" />
      </span>
      <span className="hub-orb__well" />
      <Icon size={17} className="relative" />
      <span className="hub-orb__ring hub-orb__spec" />
      <span className="hub-orb__ring hub-orb__hot" />
      <span className="hub-orb__glare" />
      <span className="hub-orb__glare hub-orb__glare--two" />
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
