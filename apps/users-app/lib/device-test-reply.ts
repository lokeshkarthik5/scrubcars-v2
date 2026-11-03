import { ApiError } from '@repo/core/api/client';

/**
 * What came of "Send me a test notification". A plain 404 means the route is off on this
 * server, so the button goes; PUSH_NOT_SUBSCRIBED is a 404 with its own sentence. Pure and tested.
 */
export type DeviceTestReply =
  | { kind: 'sent'; message: string }
  | { kind: 'hide' }
  | { kind: 'expired'; message: string }
  | { kind: 'problem'; message: string };

const COULD_NOT = "Couldn't send a test notification.";

export function deviceTestReply(outcome: { result: string } | { error: unknown }): DeviceTestReply {
  if ('result' in outcome) {
    if (outcome.result === 'sent') return { kind: 'sent', message: 'Sent. It should show in a few seconds.' };
    if (outcome.result === 'expired') return { kind: 'expired', message: 'This device stopped taking notifications. Turn them on again.' };
    return { kind: 'problem', message: "The phone's push service didn't take it. Try again in a minute." };
  }
  const { error } = outcome;
  if (error instanceof ApiError) {
    if (error.status === 404 && error.code !== 'PUSH_NOT_SUBSCRIBED') return { kind: 'hide' };
    // The rate limit's and "not on for this phone" come in the server's own words.
    return { kind: 'problem', message: error.message || COULD_NOT };
  }
  return { kind: 'problem', message: COULD_NOT };
}
