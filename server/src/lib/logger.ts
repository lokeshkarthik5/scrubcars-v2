export const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
  error: (msg: string, err?: unknown) =>
    console.error(`[ERROR] ${msg}`, err instanceof Error ? err.stack : err ?? ''),
}
