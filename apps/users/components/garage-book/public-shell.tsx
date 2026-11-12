import Link from 'next/link'
import { IconLinkOff } from '@tabler/icons-react'

/**
 * The frame of Garage Book's two public pages (a garage's booking page and
 * a bill): a phone-width column on the app's dark canvas, white paper when
 * printed. English: these are the garage's customers, who may not use
 * Detlio at all.
 */
export const PUBLIC_PRINT_CSS = `
@media print {
  @page { size: A4; margin: 14mm; }
  html, body { background: #fff !important; }
  .gbp-noprint { display: none !important; }
  .gbp-shell { background: #fff !important; padding: 0 !important; max-width: none !important; }
}
`

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="gbp-shell mx-auto flex min-h-dvh w-full max-w-[440px] flex-col gap-4 bg-brand-black px-4 pt-5 pb-10">
      <style>{PUBLIC_PRINT_CSS}</style>
      {children}
    </main>
  )
}

/** A page that can't be shown just now (too many tries, the API not answering). */
export function PublicMessage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <PublicShell>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <IconLinkOff size={32} stroke={1.5} aria-hidden="true" className="text-text-secondary" />
        <h1 className="text-t2 font-semibold text-text-primary">{title}</h1>
        <div className="max-w-[340px] text-t4 text-text-secondary">{children}</div>
        <Link href="/" className="mt-2 flex min-h-11 items-center justify-center rounded-[10px] border border-border px-5 text-sm font-semibold text-text-primary">
          Go to Detlio
        </Link>
      </div>
    </PublicShell>
  )
}
