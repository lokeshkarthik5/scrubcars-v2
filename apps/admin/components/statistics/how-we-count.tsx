import { IconInfoCircle } from '@tabler/icons-react'

/**
 * "How we count": the definitions behind the tab's figures, in plain words,
 * under them. The rules themselves live in apps/server/src/lib/stats.ts and
 * lib/commission.ts; keep these lines saying what those do.
 */
export function HowWeCount({ lines }: { lines: string[] }) {
  return (
    <section
      aria-labelledby="how-we-count"
      className="flex items-start gap-2.5 rounded-[14px] border border-border bg-surface px-3.5 py-3"
    >
      <IconInfoCircle size={18} aria-hidden="true" className="mt-px shrink-0 text-text-secondary" />
      <div className="min-w-0">
        <h2 id="how-we-count" className="text-[13px] font-medium text-text-primary">
          How we count
        </h2>
        <ul className="mt-1.5 flex flex-col gap-1">
          {lines.map((line) => (
            <li key={line} className="flex gap-2 text-[12px] leading-[1.45] text-text-secondary">
              <span aria-hidden="true" className="mt-2 size-[3px] shrink-0 rounded-full bg-text-muted" />
              {line}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
