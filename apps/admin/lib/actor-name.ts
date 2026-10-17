// The name typed last time in a "Your name" field (the Bin's dialogs,
// logging a complaint), for the next one: a convenience on this device only,
// never a record (the server keeps that). Storage can be missing or refuse,
// in which case the field starts empty.
const NAME_KEY = 'detlio.admin.actorName'

export function rememberedName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function rememberName(name: string) {
  try {
    window.localStorage.setItem(NAME_KEY, name)
  } catch {
    // Private mode or blocked storage: the next dialog asks again.
  }
}
