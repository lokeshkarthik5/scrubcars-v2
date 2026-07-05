export const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
  error: (msg: string, err?: unknown) => {
    if (!(err instanceof Error)) {
      console.error(`[ERROR] ${msg}`, err ?? '')
      return
    }
    const e = err as Error & Record<string, unknown>
    const extra: Record<string, unknown> = {}
    if (e['code']) extra['code'] = e['code']
    if (e['detail']) extra['detail'] = e['detail']
    if (e['hint']) extra['hint'] = e['hint']
    if (e['cause']) extra['cause'] = e['cause'] instanceof Error ? e['cause'].message : e['cause']
    const extraStr = Object.keys(extra).length ? ' ' + JSON.stringify(extra) : ''
    console.error(`[ERROR] ${msg}${extraStr}\n${err.stack}`)
  },
}
