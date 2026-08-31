import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

/** Shared flat config for every Next.js app in the monorepo. */
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Re-declared because extending eslint-config-next drops its own defaults.
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
])
