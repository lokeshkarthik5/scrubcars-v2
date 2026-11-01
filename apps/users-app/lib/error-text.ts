/**
 * What to say when something failed. The API's and the app's own messages are
 * written for people; what fetch throws when the phone can't reach anything
 * ("fetch failed: Could not connect to the server") is not.
 */
const NETWORK = /fetch failed|network request failed|could not connect|timed out|internet connection/i;

export function errorText(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || error instanceof TypeError || NETWORK.test(error.message)) return fallback;
  return error.message;
}
