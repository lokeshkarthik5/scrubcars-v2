import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

/**
 * Password hashing for personal admin logins (0058). scrypt from node:crypto,
 * so it runs the same under Bun (tests) and Node (Vercel), with no native
 * dependency. Stored as `scrypt$N$r$p$<salt>$<hash>` (base64), so the cost can
 * go up later without breaking the hashes already stored: each is checked
 * with the parameters it was made with.
 */
const COST = 16_384
const BLOCK_SIZE = 8
const PARALLEL = 1
const KEY_LENGTH = 64
const SALT_BYTES = 16
// N × r × 128 bytes plus headroom; node's 32 MB default is only just enough.
const MAX_MEMORY = 64 * 1024 * 1024

function derive(password: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { N, r, p, maxmem: MAX_MEMORY }, (err, key) =>
      err ? reject(err) : resolve(key)
    )
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const key = await derive(password, salt, COST, BLOCK_SIZE, PARALLEL)
  return ['scrypt', COST, BLOCK_SIZE, PARALLEL, salt.toString('base64'), key.toString('base64')].join('$')
}

/** False for a wrong password and for anything that is not one of our hashes. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [N, r, p] = parts.slice(1, 4).map(Number)
  // Bounds, so a corrupt row cannot make one sign-in eat the server.
  if (!N || !r || !p || N > 1 << 17 || r > 16 || p > 4) return false
  const salt = Buffer.from(parts[4]!, 'base64')
  const expected = Buffer.from(parts[5]!, 'base64')
  if (salt.length === 0 || expected.length !== KEY_LENGTH) return false
  const key = await derive(password, salt, N, r, p)
  return timingSafeEqual(key, expected)
}

/**
 * A hash of nothing anyone knows, for an unknown username: checking it costs
 * the same as checking a real one, so the time a refusal takes does not say
 * whether the username exists.
 */
let decoy: Promise<string> | undefined
export function decoyHash(): Promise<string> {
  decoy ??= hashPassword(randomBytes(32).toString('base64'))
  return decoy
}
