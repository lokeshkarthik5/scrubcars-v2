import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { env } from "../../lib/env.js";
import { AppError } from "../../lib/errors.js";
import { authService } from "./auth.service.js";
const REFRESH_COOKIE = "refresh_token";
function setRefreshCookie(c, token) {
    setCookie(c, REFRESH_COOKIE, token, {
        httpOnly: true,
        secure: !env.isDev,
        sameSite: "Lax",
        path: "/api/v1/auth",
        maxAge: env.refreshTokenExpiresDays * 24 * 60 * 60,
    });
}
function clearRefreshCookie(c) {
    deleteCookie(c, REFRESH_COOKIE, {
        path: "/api/v1/auth",
    });
}
function sessionResponse(c, session) {
    setRefreshCookie(c, session.refreshToken);
    return c.json({
        success: true,
        data: {
            user: session.user,
            vendor: session.vendor,
            accessToken: session.accessToken,
            tokenType: "Bearer",
        },
    });
}
export async function sendOtp(c, input) {
    const data = await authService.sendOtp(input);
    return c.json({
        success: true,
        message: "OTP sent successfully",
        data,
    });
}
export async function verifyOtp(c, input) {
    const session = await authService.verifyOtp(input);
    return sessionResponse(c, session);
}
export async function refresh(c) {
    const refreshToken = getCookie(c, REFRESH_COOKIE);
    if (!refreshToken) {
        throw new AppError(401, "Refresh token missing", "REFRESH_TOKEN_MISSING");
    }
    const session = await authService.refreshSession(refreshToken);
    setRefreshCookie(c, session.refreshToken);
    return c.json({
        success: true,
        data: {
            user: session.user,
            vendor: session.vendor,
            accessToken: session.accessToken,
            tokenType: "Bearer",
        },
    });
}
export async function logout(c) {
    const refreshToken = getCookie(c, REFRESH_COOKIE);
    await authService.logout(refreshToken);
    clearRefreshCookie(c);
    return c.json({
        success: true,
        message: "Logged out successfully",
    });
}
export async function getMe(c) {
    const auth = c.get("auth");
    const data = await authService.getMe(auth.sub, auth.aud);
    return c.json({
        success: true,
        data,
    });
}
export async function getMeCustomer(c) {
    const auth = c.get("auth");
    const data = await authService.getMe(auth.sub, "customer");
    return c.json({
        success: true,
        data,
    });
}
export async function getMeVendor(c) {
    const auth = c.get("auth");
    const data = await authService.getMe(auth.sub, "vendor");
    return c.json({
        success: true,
        data,
    });
}
