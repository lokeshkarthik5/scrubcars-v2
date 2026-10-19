'use client'

import { useSyncExternalStore } from 'react'
import { toast } from 'react-toastify'
import { showUndoToast } from '@repo/ui/sc/undo-toast'
import { useBookingsStore } from '@repo/core/stores/bookings-store'

/**
 * Start job and Complete job with a 5-second Undo (UX audit, garage finding
 * 5). A wet thumb on the wrong button used to close a job early, and the
 * server has no step back: a started job has told the customer, a completed
 * one has sent its push and opened the review. So the step waits here for
 * five seconds behind an "Undo" toast, and only then goes to the server.
 *
 * The wait lives in this module, not in a component, so leaving the job page
 * doesn't lose it: the step still goes through on time. Hiding the tab or
 * leaving the site sends it at once, before the page can be frozen.
 */

export const UNDO_MS = 5_000

export type DeferredStatus = 'in_progress' | 'completed'

const MESSAGES: Record<DeferredStatus, string> = {
  in_progress: 'Job started',
  completed: 'Job completed',
}

const waiting = new Map<
  string,
  { status: DeferredStatus; timer: ReturnType<typeof setTimeout> }
>()
const listeners = new Set<() => void>()
let snapshot: ReadonlyMap<string, DeferredStatus> = new Map()

function changed() {
  snapshot = new Map([...waiting].map(([id, entry]) => [id, entry.status]))
  for (const listener of listeners) listener()
}

async function send(id: string) {
  const entry = waiting.get(id)
  if (!entry) return
  clearTimeout(entry.timer)
  waiting.delete(id)
  changed()
  const store = useBookingsStore.getState()
  try {
    await store.updateStatus(id, entry.status)
  } catch (error) {
    // Refused (photos removed meanwhile, extra work asked): say why, and
    // re-read so the job shows what the server holds.
    toast.error(
      error instanceof Error ? error.message : 'Could not update this job'
    )
    void store.fetchVendorBookings().catch(() => undefined)
  }
}

function sendAll() {
  for (const id of [...waiting.keys()]) void send(id)
}

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendAll()
  })
  window.addEventListener('pagehide', sendAll)
}

/** Start or complete a job in five seconds, unless Undo is pressed first. */
export function changeStatusWithUndo(id: string, status: DeferredStatus) {
  if (waiting.has(id)) return
  const timer = setTimeout(() => void send(id), UNDO_MS)
  waiting.set(id, { status, timer })
  changed()
  showUndoToast(MESSAGES[status], {
    durationMs: UNDO_MS,
    onUndo: () => {
      const entry = waiting.get(id)
      if (!entry) {
        toast.info('Already saved: it can no longer be undone.')
        return
      }
      clearTimeout(entry.timer)
      waiting.delete(id)
      changed()
    },
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const EMPTY: ReadonlyMap<string, DeferredStatus> = new Map()

/** The step a job is waiting to send, if any: the screen shows it as done-but-undoable. */
export function useDeferredStatus(id: string): DeferredStatus | undefined {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.get(id),
    () => EMPTY.get(id)
  )
}
