import { cleanPath, type ClientEventName, EVENT_PROPS, type EventProps } from '@repo/core/analytics-events';
import { apiClient } from '@repo/core/api/client';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

import { devicePrefs } from '../device-prefs';

/**
 * In place of packages/core/src/analytics.ts (metro.config.js), which needs sessionStorage and
 * the browser's beacon: the same first-party POST /events, same names and allow-listed props.
 * No third party, no ad tracking, ever. Off unless EXPO_PUBLIC_ANALYTICS=on, as the web's flag.
 *
 * The server has no field for which app sent it, so `appVersion` says it ("ios-1.0.0"), which
 * its pattern allows. `device` is always phone.
 */
const FLUSH_MS = 5000;
const MAX_BATCH = 20;
const VISIT_KEY = 'detlio.visit';
const VISIT_IDLE_MS = 30 * 60 * 1000;

const on = () => process.env.EXPO_PUBLIC_ANALYTICS === 'on';
const appVersion = () => `${Platform.OS === 'android' ? 'android' : 'ios'}-${Constants.expoConfig?.version ?? '0'}`.slice(0, 32);

function newId(): string {
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

/** A visit ends after half an hour's quiet, as the web's. */
function visitId(now = Date.now()): { id: string; isNew: boolean } {
  try {
    const stored = devicePrefs.getItem(VISIT_KEY);
    const parsed = stored ? (JSON.parse(stored) as { id: string; at: number }) : null;
    if (parsed && now - parsed.at < VISIT_IDLE_MS) {
      devicePrefs.setItem(VISIT_KEY, JSON.stringify({ id: parsed.id, at: now }));
      return { id: parsed.id, isNew: false };
    }
  } catch {
    // A new visit, then.
  }
  const id = newId();
  devicePrefs.setItem(VISIT_KEY, JSON.stringify({ id, at: now }));
  return { id, isNew: true };
}

/** Only the keys the event may carry, and only strings and numbers (core's analytics.ts). */
function allowedProps(name: ClientEventName, props: object | undefined): Record<string, string | number> | undefined {
  if (!props) return undefined;
  const out: Record<string, string | number> = {};
  for (const key of EVENT_PROPS[name] as readonly string[]) {
    const value = (props as Record<string, unknown>)[key];
    if (typeof value === 'string' || typeof value === 'number') out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

let queue: { name: string; path: string; props?: unknown }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let path = '/';

export const setAnalyticsPath = (pathname: string) => {
  path = pathname;
};

function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (queue.length === 0) return;
  const events = queue.slice(0, MAX_BATCH);
  queue = queue.slice(MAX_BATCH);
  // Lost events are a gap in a chart, nothing more.
  void apiClient('/events', { method: 'POST', body: JSON.stringify({ visitId: visitId().id, device: 'phone', appVersion: appVersion(), events }) }).catch(() => undefined);
  if (queue.length > 0) flush();
}

export function track<N extends ClientEventName>(name: N, props?: EventProps[N]): void {
  try {
    if (!on()) return;
    const kept = allowedProps(name, props);
    queue.push({ name, path: cleanPath(path), ...(kept ? { props: kept } : {}) });
    if (queue.length >= MAX_BATCH) flush();
    else if (timer === null) timer = setTimeout(flush, FLUSH_MS);
  } catch {
    // Never let a measurement break a screen.
  }
}

export function currentVisitId(): string | null {
  return null;
}

/** One app_open a visit, and whatever's queued goes before the phone sleeps. */
export function startAnalytics() {
  if (!on()) return () => undefined;
  if (visitId().isNew) track('app_open');
  const subscription = AppState.addEventListener('change', (state) => {
    if (state !== 'active') flush();
    else if (visitId().isNew) track('app_open');
  });
  return () => subscription.remove();
}
