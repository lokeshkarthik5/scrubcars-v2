import { sign, verify } from 'hono/jwt';
import { env } from './env.js';
function parseExpiryToSeconds(expiry) {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
        throw new Error(`Invalid JWT expiry format: ${expiry}`);
    }
    const value = Number(match[1]);
    const unit = match[2];
    switch (unit) {
        case 's':
            return value;
        case 'm':
            return value * 60;
        case 'h':
            return value * 60 * 60;
        case 'd':
            return value * 24 * 60 * 60;
        default:
            throw new Error(`Unsupported JWT expiry unit: ${unit}`);
    }
}
export async function signAccessToken(payload) {
    const exp = Math.floor(Date.now() / 1000 + parseExpiryToSeconds(env.jwtAccessExpiresIn));
    return sign({
        ...payload,
        exp,
    }, env.jwtSecret);
}
export async function verifyAccessToken(token) {
    const payload = (await verify(token, env.jwtSecret, 'HS256'));
    return {
        sub: payload.sub,
        aud: payload.aud,
        isCustomer: payload.isCustomer,
        isVendorOwner: payload.isVendorOwner,
        isAdmin: payload.isAdmin,
    };
}
