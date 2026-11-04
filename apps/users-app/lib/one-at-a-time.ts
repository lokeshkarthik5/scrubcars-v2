/**
 * One job at a time, for the shared-picture host: a second asks while the first runs is told
 * no at once, so its button comes back, and the first still finishes. Pure and tested.
 */
export function oneAtATime<J>(read: () => J | null, write: (job: J) => void) {
  return (job: J): boolean => {
    if (read() !== null) return false;
    write(job);
    return true;
  };
}
