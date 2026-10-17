/**
 * "Skip to content", the first thing Tab reaches on the long reading pages
 * (the homepage, the legal pages), so a keyboard user does not tab through
 * the header's links on every visit. Hidden until focused, then drawn over
 * the top-left corner. The target is the page's <main id="main">.
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:flex focus:min-h-11 focus:items-center focus:rounded-[10px] focus:bg-brand-white focus:px-4 focus:text-[14px] focus:font-semibold focus:text-brand-black"
    >
      Skip to content
    </a>
  )
}
