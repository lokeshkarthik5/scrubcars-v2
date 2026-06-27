import { createHash, randomBytes } from 'node:crypto'
import { env } from './env.js'

export function generateRefreshToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function getRefreshTokenExpiryDate(): Date {
  return new Date(
    Date.now() + env.refreshTokenExpiresDays * 24 * 60 * 60 * 1000
  )
}
