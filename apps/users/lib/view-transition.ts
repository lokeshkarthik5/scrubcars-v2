/**
 * The container transform between screens (customer UI round, Nov 2026,
 * §5 and §6): a garage card grows into its garage page and the page folds
 * back into the card; the garage page's booking bar grows into the booking
 * page and folds back into the bar.
 *
 * Built on the browser's View Transitions API: one element carries a shared
 * `view-transition-name` on each side (the card, then the page), the browser
 * photographs the old screen, the route changes, and it morphs one into the
 * other. The look is in globals.css (`html[data-vt]`, the `vt-` rules).
 *
 * The name is put on an element only for the length of one transition and
 * taken off again, so two cards are never named at once (the browser then
 * skips the transition). Where the API is missing, or the customer asked for
 * less motion, it is an ordinary navigation: the instant switch the design
 * allows as the fallback.
 */

/** The two shared elements, one per pair of screens. */
export type MorphName = 'vt-garage' | 'vt-booking'

/**
 * How long to wait for the next screen's element before morphing without
 * it. The screen stays frozen on its old picture while the wait lasts. An
 * open goes to a page that draws its partner as soon as the route arrives
 * (garage/[id]/loading, the booking page's own box), so it can wait for the
 * route. A Back returns to a screen the router already has, so its partner
 * is drawn within a frame or two or not at all (the list scrolled or
 * re-fetched): a short wait, then it lets go.
 */
const OPEN_ARRIVAL_MS = 1500
const BACK_ARRIVAL_MS = 250

type ViewTransitionLike = { finished: Promise<void> }
type StartViewTransition = (update: () => Promise<void>) => ViewTransitionLike

/** Whether this browser can morph, and the customer has not asked for less motion. */
export function canMorph(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false
  if (!('startViewTransition' in document)) return false
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Resolves once `find` returns an element (the next screen has rendered), or after the timeout. */
function arrival(find: () => HTMLElement | null, timeoutMs: number): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const started = performance.now()
    const look = () => {
      const found = find()
      if (found || performance.now() - started > timeoutMs) resolve(found)
      else requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
  })
}

/**
 * Navigates with the container transform: `from` is the element on screen
 * now (the card, the booking bar, the page), `to` finds its partner on the
 * next screen once it has rendered. `direction` picks the open or the back
 * timing (540ms in, 420ms back). Falls back to `navigate()` alone.
 */
export function morphNavigate({
  name,
  direction,
  from,
  to,
  navigate,
}: {
  name: MorphName
  direction: 'open' | 'back'
  from: HTMLElement | null
  to: () => HTMLElement | null
  navigate: () => void
}): void {
  if (!from || !canMorph()) {
    navigate()
    return
  }
  const root = document.documentElement
  root.dataset.vt = `${name}-${direction}`
  from.style.setProperty('view-transition-name', name)
  let target: HTMLElement | null = null
  const start = (document as unknown as { startViewTransition: StartViewTransition }).startViewTransition.bind(
    document
  )
  const transition = start(async () => {
    // The old screen has been photographed: the name moves to the new one.
    from.style.removeProperty('view-transition-name')
    navigate()
    target = await arrival(to, direction === 'back' ? BACK_ARRIVAL_MS : OPEN_ARRIVAL_MS)
    target?.style.setProperty('view-transition-name', name)
  })
  transition.finished.finally(() => {
    target?.style.removeProperty('view-transition-name')
    delete root.dataset.vt
  })
}

/*
 * Which Back folds into what.
 *
 * A Back only morphs when the screen it returns to is the one it came from:
 * the garage page into the card it was opened from, the booking page into
 * the garage page whose Book now opened it. A mark that outlives that one
 * visit would morph a later, unrelated Back (into a card or bar the screen
 * does not have) or put old picks back on a later visit, so each mark is
 * tied to the history entry it belongs to: it is kept on that entry's
 * history.state, beside Next's own. A different arrival at the same page is
 * a new entry without it, the phone's own back and forward keep each entry's
 * mark with it, and nothing is left behind once the tab's history moves on.
 *
 * sessionStorage only carries a mark across the one navigation that makes
 * the new entry (the tap happens before the entry exists). The next page
 * takes it at once, and a hand-off older than a few seconds is a navigation
 * that never arrived, never a later visit.
 */

/** The key on history.state that holds this file's marks. */
const ENTRY_KEY = '__detlioVt'

/** A hand-off older than this was for a navigation that never arrived. */
const HANDOFF_FRESH_MS = 30_000

type TabStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
type EntryStore = { readonly state: unknown; replaceState(data: unknown, unused: string): void } | null

/** What one history entry remembers: the garage opened from the list, the picks Book now carried. */
type EntryMarks = { garage?: string; picks?: { vendorId: string; serviceIds: string[] } }

function browserTab(): TabStore {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

function browserEntry(): EntryStore {
  return typeof window === 'undefined' ? null : window.history
}

function readJson(tab: TabStore, key: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(tab?.getItem(key) ?? 'null') as unknown
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function remove(tab: TabStore, key: string): void {
  try {
    tab?.removeItem(key)
  } catch {
    // Private mode: nothing was kept.
  }
}

function isFresh(at: unknown, now: number): boolean {
  return typeof at === 'number' && now - at >= 0 && now - at < HANDOFF_FRESH_MS
}

function serviceIdsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
}

function readMarks(entry: EntryStore): EntryMarks {
  try {
    const marks = (entry?.state as Record<string, unknown> | null)?.[ENTRY_KEY]
    return marks && typeof marks === 'object' ? (marks as EntryMarks) : {}
  } catch {
    return {}
  }
}

/**
 * Adds to this entry's marks. Next's own fields are kept (spread from the
 * current state), and no URL is passed, so its router does not re-render.
 */
function writeMarks(entry: EntryStore, marks: EntryMarks): void {
  try {
    const state = (entry?.state as Record<string, unknown> | null) ?? {}
    entry?.replaceState({ ...state, [ENTRY_KEY]: { ...readMarks(entry), ...marks } }, '')
  } catch {
    // Without history state, Back is the plain switch.
  }
}

/**
 * For a page that changes its own URL in place with history.replaceState
 * (the garage page's mode, its save flag): pass this as the state so the
 * marks stay on the entry. Next adds its own fields to it.
 */
export function keptEntryState(entry: EntryStore = browserEntry()): Record<string, unknown> | null {
  const marks = readMarks(entry)
  return Object.keys(marks).length > 0 ? { [ENTRY_KEY]: marks } : null
}

/**
 * The garage the customer opened from the list: the garage page folds back
 * into this card on Back. Session only, never sent.
 */
export const OPENED_FROM_LIST_KEY = 'detlio:vt-garage'

/** On the card's tap: hands the garage to the page about to open. */
export function rememberOpenedFromList(
  vendorId: string,
  now: number = Date.now(),
  tab: TabStore = browserTab()
): void {
  try {
    tab?.setItem(OPENED_FROM_LIST_KEY, JSON.stringify({ vendorId, at: now }))
  } catch {
    // Private mode: Back is then the plain switch.
  }
}

/**
 * On the garage page's mount: takes the hand-off (whichever garage it names,
 * so it never waits for a later visit) and, when it is for this garage and
 * just made, marks this history entry as opened from the list.
 */
export function claimOpenedFromList(
  vendorId: string,
  now: number = Date.now(),
  tab: TabStore = browserTab(),
  entry: EntryStore = browserEntry()
): void {
  const saved = readJson(tab, OPENED_FROM_LIST_KEY)
  if (!saved) return
  remove(tab, OPENED_FROM_LIST_KEY)
  if (saved.vendorId === vendorId && isFresh(saved.at, now)) writeMarks(entry, { garage: vendorId })
}

/** Whether this visit to the garage page is the one opened from the list. */
export function openedFromList(vendorId: string, entry: EntryStore = browserEntry()): boolean {
  return readMarks(entry).garage === vendorId
}

/**
 * The services picked on a garage page when Book now was tapped, kept so the
 * booking page's Back can fold into the same booking bar (the garage page
 * reads them back once, only on that Back). Session only, never sent.
 */
export const PICKS_KEY = 'detlio:vt-picks'

/** On Book now: hands the picks to the booking page about to open. */
export function rememberPicks(
  vendorId: string,
  serviceIds: readonly string[],
  now: number = Date.now(),
  tab: TabStore = browserTab()
): void {
  try {
    tab?.setItem(PICKS_KEY, JSON.stringify({ vendorId, serviceIds, back: false, at: now }))
  } catch {
    // Without storage the bar is simply not restored.
  }
}

/**
 * On the booking page's mount: takes the hand-off and, when Book now on this
 * garage just made it, keeps the picks on this history entry. So only the
 * booking page that Book now opened (the garage page is the entry before it)
 * folds back; reaching it any other way is a plain Back.
 */
export function claimPicks(
  vendorId: string,
  now: number = Date.now(),
  tab: TabStore = browserTab(),
  entry: EntryStore = browserEntry()
): void {
  const saved = readJson(tab, PICKS_KEY)
  if (!saved || saved.back) return
  remove(tab, PICKS_KEY)
  if (saved.vendorId === vendorId && isFresh(saved.at, now)) {
    writeMarks(entry, { picks: { vendorId, serviceIds: serviceIdsOf(saved.serviceIds) } })
  }
}

/** Whether this booking page was opened by this garage's Book now (its picks are kept). */
export function picksRemembered(vendorId: string, entry: EntryStore = browserEntry()): boolean {
  return readMarks(entry).picks?.vendorId === vendorId
}

/** Marks the picks as wanted back: the booking page's Back is on its way. */
export function markPicksForBack(
  vendorId: string,
  now: number = Date.now(),
  tab: TabStore = browserTab(),
  entry: EntryStore = browserEntry()
): void {
  const picks = readMarks(entry).picks
  if (picks?.vendorId !== vendorId) return
  try {
    tab?.setItem(
      PICKS_KEY,
      JSON.stringify({ vendorId, serviceIds: serviceIdsOf(picks.serviceIds), back: true, at: now })
    )
  } catch {
    // As above.
  }
}

/**
 * The picks to put back on this garage page: only when its booking page's
 * Back brought it here, just now. Read, not taken, so a second read (React's
 * strict mode calls an initialiser twice) gives the same answer; forgetPicks
 * clears them once the page has them.
 */
export function picksForBack(
  vendorId: string,
  now: number = Date.now(),
  tab: TabStore = browserTab()
): string[] {
  const saved = readJson(tab, PICKS_KEY)
  if (!saved || saved.vendorId !== vendorId || saved.back !== true || !isFresh(saved.at, now)) return []
  return serviceIdsOf(saved.serviceIds)
}

/**
 * On the garage page's mount: clears whatever was kept. The page has read
 * its picks by then, and anything else (another garage's, a hand-off that
 * never arrived) is a visit gone by.
 */
export function forgetPicks(tab: TabStore = browserTab()): void {
  remove(tab, PICKS_KEY)
}
