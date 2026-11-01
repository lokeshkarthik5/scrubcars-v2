/**
 * What a crash report may say: where in the code, never who. Everything free-form
 * goes through `scrubText`, which replaces anything shaped like a phone, a token,
 * a code or an amount; request bodies, breadcrumb data, user and device names are
 * dropped whole. Pure, so it is tested.
 */
const PATTERNS: RegExp[] = [
  /ExponentPushToken\[[^\]]*\]/g,
  /Bearer\s+[\w.-]+/gi,
  /eyJ[\w-]+\.[\w-]+\.[\w-]+/g, // a JWT
  /\b[a-f0-9]{32,}\b/gi, // a refresh token, a hash
  /\+?\d[\d\s-]{8,}\d/g, // a phone number
  /\b\d{4,6}\b/g, // a pickup code, an OTP
];

export function scrubText(text: string): string {
  return PATTERNS.reduce((out, pattern) => out.replace(pattern, '[removed]'), text);
}

export interface ScrubbableEvent {
  message?: string;
  user?: unknown;
  request?: unknown;
  extra?: unknown;
  server_name?: string;
  contexts?: Record<string, unknown>;
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: { message?: string; data?: unknown; category?: string }[];
}

export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  delete event.user;
  delete event.request;
  delete event.extra;
  delete event.server_name;
  if (event.contexts) delete event.contexts.device;
  if (event.message) event.message = scrubText(event.message);
  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = scrubText(value.value);
  }
  event.breadcrumbs = (event.breadcrumbs ?? []).map(scrubBreadcrumb);
  return event;
}

/** Navigation and network paths can carry a booking id; console lines can carry anything. */
export function scrubBreadcrumb<B extends { message?: string; data?: unknown }>(crumb: B): B {
  const clean = { ...crumb };
  delete clean.data;
  if (clean.message) clean.message = scrubText(clean.message);
  return clean;
}
