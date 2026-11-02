/**
 * Goes up whenever the garage or the person changes. A jobs read started before
 * that belongs to the last garage, and core's bookings store writes whatever comes
 * back, so a read that lands late is undone here.
 */
let epoch = 0;

export const currentEpoch = () => epoch;

export function bumpEpoch() {
  epoch += 1;
}

/** Runs `read`; if the epoch moved meanwhile, calls `onStale` and answers null. A failure then is no one's news. */
export async function readGuarded<T>(read: () => Promise<T>, onStale: () => void): Promise<T | null> {
  const started = epoch;
  try {
    const result = await read();
    if (started !== epoch) {
      onStale();
      return null;
    }
    return result;
  } catch (error) {
    if (started !== epoch) return null;
    throw error;
  }
}
