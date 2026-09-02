/**
 * Runs once before the suite.
 *
 * Resets the database and mints a storageState per role. The reset is skipped
 * when E2E_SKIP_RESET=1, which is what makes a tight edit-run loop bearable
 * locally — but it is never skipped in CI, where a run must not inherit
 * anything from the one before it.
 */
import { config as loadEnv } from 'dotenv'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AUTH_DIR, saveAdminState, saveState } from './support/auth'
import { closeDb } from './support/db'
import { CUSTOMERS, STAFF } from './support/seed-ids'

const dir = path.dirname(fileURLToPath(import.meta.url))
loadEnv({ path: path.join(dir, '.env.e2e') })

async function globalSetup() {
  const skipReset = process.env.E2E_SKIP_RESET === '1' && !process.env.CI

  if (skipReset) {
    console.log('[e2e] E2E_SKIP_RESET=1 — reusing the existing database')
  } else {
    console.log('[e2e] resetting database…')
    execFileSync(
      path.join(dir, 'node_modules/.bin/tsx'),
      [path.join(dir, 'scripts/reset-db.ts')],
      { stdio: 'inherit', env: process.env }
    )
  }

  // Stale cookies would survive a reseed and point at users that no longer
  // exist, so the states are always reminted.
  fs.rmSync(AUTH_DIR, { recursive: true, force: true })
  fs.mkdirSync(AUTH_DIR, { recursive: true })

  console.log('[e2e] minting sessions…')

  // Sequential on purpose: the auth routes are rate limited per IP, and every
  // one of these is the same IP.
  for (const [role, customer] of Object.entries(CUSTOMERS)) {
    await saveState(`customer-${role}`, customer.phone, 'customer')
  }

  await saveState('vendor-owner', STAFF.owner.phone, 'vendor')
  await saveState('vendor-operator', STAFF.operator.phone, 'vendor')
  await saveState('super-admin', STAFF.superAdmin.phone, 'vendor')
  await saveAdminState('admin')

  await closeDb()
  console.log('[e2e] ready.')
}

export default globalSetup
