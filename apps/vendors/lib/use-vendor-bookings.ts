'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import { resumeWaitingSteps } from '@/lib/deferred-status'

/** How often the job lists re-read: the same on Home, Bookings and a job's page. */
export const POLL_MS = 10_000

/**
 * ONE poller for the garage's jobs, shared by every screen that shows them
 * (Home, Bookings, a job's page): it runs while at least one is mounted,
 * reads every 10 seconds while the tab is visible, and once more as soon as
 * it is visible again (UX audit, garage finding 1: Home used to read once
 * and never again). Its state is per garage: a switch starts it afresh.
 */
type PollState = {
  vendorId: string | null
  loaded: boolean
  failed: boolean
  retrying: boolean
}

let state: PollState = {
  vendorId: null,
  loaded: false,
  failed: false,
  retrying: false,
}
const listeners = new Set<() => void>()
let users = 0
let timer: ReturnType<typeof setInterval> | null = null
let inFlight: { vendorId: string | null; promise: Promise<void> } | null = null

function update(patch: Partial<PollState>) {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

function read(): Promise<void> {
  // One read at a time, per garage: a switch doesn't wait on the old one.
  if (inFlight && inFlight.vendorId === state.vendorId) return inFlight.promise
  const vendorId = state.vendorId
  const promise: Promise<void> = useBookingsStore
    .getState()
    .fetchVendorBookings()
    .then((jobs) => {
      if (vendorId !== state.vendorId) return
      update({ failed: false, loaded: true })
      // Steps a reload left behind go now, if their job hasn't moved on.
      resumeWaitingSteps(jobs, vendorId)
    })
    .catch(() => {
      if (vendorId === state.vendorId) update({ failed: true, loaded: true })
    })
    .finally(() => {
      if (inFlight?.promise === promise) inFlight = null
    })
  inFlight = { vendorId, promise }
  return promise
}

const visible = () =>
  typeof document === 'undefined' || document.visibilityState === 'visible'

function onVisibility() {
  if (visible()) void read()
}

function start(vendorId: string) {
  users++
  if (vendorId !== state.vendorId) {
    update({ vendorId, loaded: false, failed: false })
    void read()
  } else if (users === 1) {
    void read()
  }
  if (!timer) {
    timer = setInterval(() => {
      if (visible()) void read()
    }, POLL_MS)
    document.addEventListener('visibilitychange', onVisibility)
  }
}

function stop() {
  users--
  if (users > 0 || !timer) return
  clearInterval(timer)
  timer = null
  document.removeEventListener('visibilitychange', onVisibility)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Retry after a failed read. */
function retry() {
  update({ retrying: true })
  void read().finally(() => update({ retrying: false }))
}

/**
 * The garage's jobs, read now and every 10 seconds while the screen is open.
 *
 * `loaded` is false only until the first read for this garage settles, so
 * the list never blinks on a poll. `failed` says the last read failed; with
 * no earlier list that is "Couldn't load", never an empty list or a 0.
 */
export function useVendorBookings() {
  const vendorId = useAuthStore((s) => s.vendor?.id ?? null)
  const bookings = useBookingsStore((s) => s.vendorBookings)
  const poll = useSyncExternalStore(
    subscribe,
    () => state,
    () => state
  )

  useEffect(() => {
    if (!vendorId) return
    start(vendorId)
    return stop
  }, [vendorId])

  const current = poll.vendorId === vendorId
  return {
    bookings,
    loaded: current && poll.loaded,
    failed: current && poll.failed,
    retrying: poll.retrying,
    reload: retry,
  }
}
