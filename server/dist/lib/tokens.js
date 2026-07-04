import { createHash, randomBytes } from 'node:crypto';
import { env } from './env.js';
export function generateRefreshToken() {
    return randomBytes(32).toString('hex');
}
export function hashRefreshToken(token) {
    return createHash('sha256').update(token).digest('hex');
}
export function getRefreshTokenExpiryDate() {
    return new Date(Date.now() + env.refreshTokenExpiresDays * 24 * 60 * 60 * 1000);
}
