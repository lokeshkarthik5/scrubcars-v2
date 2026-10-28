/**
 * Moves a prerendered (○) page to another query of its own address, in
 * place: the browser's own history call, which Next.js keeps
 * `useSearchParams` in step with. `router.replace` to the bare path (no
 * query) left the address and `useSearchParams` as they were in the
 * production build (CI E2E, 29 Oct: Add garage's "Fill in by hand", the
 * Coverage drawer's Close after opening `/coverage?zone=…`, Requests' Open
 * from `?filter=all`), so these pages change their query through this.
 */
export function replaceAddress(url: string): void {
  window.history.replaceState(null, '', url)
}
