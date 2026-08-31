import 'dotenv/config'
import { seedUsers } from './seed-users.js'
import { seedVendors } from './seed-vendors.js'

type SeedTarget = 'all' | 'users' | 'vendors'

function parseTarget(argv: string[]): SeedTarget {
  if (argv.includes('--users')) return 'users'
  if (argv.includes('--vendors')) return 'vendors'
  return 'all'
}

function printUsage() {
  console.log(`Usage: npm run seed [-- --users | --vendors]

Seeds development data into the database.

Options:
  --users     Seed customers and vendor-owner users only
  --vendors   Seed vendor profiles (requires user seeds)
  (default)   Seed users, then vendors

Test logins (OTP in dev server logs):
  Customers: 9876543210, 9876543211, 9876510002
  Vendors:   9876510001, 9876510003, 9876510004
`)
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage()
    return
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set')
  }

  const target = parseTarget(process.argv.slice(2))

  if (target === 'all' || target === 'users') {
    const { customers, vendorOwners } = await seedUsers()
    console.log(
      `[seed] users: ${customers.length} customers, ${vendorOwners.length} vendor owners`
    )
  }

  if (target === 'all' || target === 'vendors') {
    const vendors = await seedVendors()
    console.log(`[seed] vendors: ${vendors.length} garages`)
  }

  console.log('[seed] done')
}

main().catch((error) => {
  console.error('[seed] failed:', error)
  process.exit(1)
})
