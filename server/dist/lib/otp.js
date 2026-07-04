import { randomInt } from 'node:crypto';
export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MINUTES = 3;
export const MAX_OTP_VERIFY_ATTEMPTS = 3;
export const OTP_VERIFY_WINDOW_MINUTES = 5;
export const OTP_EXPIRY_SECONDS = OTP_EXPIRY_MINUTES * 60;
export function generateOtpCode() {
    return randomInt(0, 10 ** OTP_LENGTH)
        .toString()
        .padStart(OTP_LENGTH, '0');
}
export function getOtpExpiryDate() {
    return new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);
}
export function getOtpVerifyWindowStart() {
    return new Date(Date.now() - OTP_VERIFY_WINDOW_MINUTES * 60 * 1000);
}
