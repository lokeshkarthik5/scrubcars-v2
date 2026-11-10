/**
 * The one box a garage card grows into (lib/view-transition.ts), around both
 * the garage page and its loading shape (loading.tsx). It has to be the same
 * element from the first frame of the morph to the last: the morph usually
 * starts on the loading shape and the garage arrives part-way through, and a
 * shared element that is swapped for another mid-morph ends it on the spot.
 * Around both, the box stays and its picture simply fills in.
 */
export default function GarageLayout({ children }: { children: React.ReactNode }) {
  return <div data-vt-garage="">{children}</div>
}
