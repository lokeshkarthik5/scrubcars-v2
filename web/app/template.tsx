/**
 * Page transition.
 *
 * A `template` rather than a layout on purpose: React remounts a template on
 * every navigation, so the enter animation replays per route with no router
 * subscription, no transition library and no state of its own. A layout would
 * mount once and the animation would only ever play on first load.
 *
 * Exit animations are deliberately absent — Next.js unmounts the old route
 * before the new one commits, so holding the outgoing page on screen would
 * mean intercepting navigation and delaying every tap.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>
}
