import { Skeleton } from '@repo/ui/sc/skeleton'

/**
 * The garage page while its code and its garage are on the way (speed fix 2,
 * customer UI round, Nov 2026): the page's own shape in the finish — the
 * tall photo, the name, the facts, the mode switch, the tabs and three
 * services — so the tap lands on the page at once and fills in, rather than
 * on a blank screen. Most opens skip it entirely: a card's press already
 * started the garage's read, and the list's copy of the garage paints the
 * top of the page straight away (useGarage's placeholder). When a card is
 * growing into the page (lib/view-transition.ts), this is what is drawn
 * inside the growing box at first (layout.tsx), so the morph never waits on
 * the garage.
 */
export default function GarageLoading() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[428px] flex-col bg-brand-black">
      <main role="status" aria-busy="true" className="flex flex-1 flex-col">
        <span className="sr-only">Loading</span>
        <Skeleton className="h-[340px] w-full rounded-none" />
        <div className="flex flex-col gap-2 px-4 pt-4">
          <Skeleton className="h-7 w-2/3 rounded-[10px]" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
        <div className="px-4 pt-6">
          <Skeleton className="h-14 w-full rounded-[18px]" />
        </div>
        <div className="flex gap-6 px-4 pt-6">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="flex flex-col gap-2 px-4 pt-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-[22px]" />
          ))}
        </div>
      </main>
    </div>
  )
}
