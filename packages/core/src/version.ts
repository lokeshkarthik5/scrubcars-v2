/**
 * This build's version, inlined at build time from web/package.json by
 * next.config.ts. The API is versioned separately — see web/CHANGELOG.md for
 * what each web version contains.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown'
