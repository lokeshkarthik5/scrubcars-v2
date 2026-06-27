import { createMiddleware } from "hono/factory";
import { AppError } from "../lib/errors.js";
import { verifyAccessToken, } from "../lib/jwt.js";
function extractBearerToken(authorization) {
    if (!authorization?.startsWith("Bearer ")) {
        return null;
    }
    return authorization.slice("Bearer ".length).trim() || null;
}
export const authMiddleware = createMiddleware(async (c, next) => {
    const token = extractBearerToken(c.req.header("Authorization"));
    if (!token) {
        throw new AppError(401, "Authentication required", "UNAUTHORIZED");
    }
    try {
        const payload = await verifyAccessToken(token);
        c.set("auth", payload);
        await next();
    }
    catch {
        throw new AppError(401, "Invalid or expired access token", "INVALID_TOKEN");
    }
});
export const requireVendor = createMiddleware(async (c, next) => {
    const auth = c.get("auth");
    if (!auth.isVendorOwner) {
        throw new AppError(403, "Vendor access required", "VENDOR_REQUIRED");
    }
    await next();
});
export const requireCustomer = createMiddleware(async (c, next) => {
    const auth = c.get("auth");
    if (!auth.isCustomer) {
        throw new AppError(403, "Customer access required", "CUSTOMER_REQUIRED");
    }
    await next();
});
