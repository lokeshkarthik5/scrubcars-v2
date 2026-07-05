import { AppError } from './errors.js';
import { env } from './env.js';
const OTP_TEMPLATE = 'OTP1';
const TWO_FACTOR_BASE_URL = 'https://2factor.in/API/V1';
export async function sendOtpSms(phone, otp) {
    if (!env.smsApiKey) {
        if (env.isDev) {
            console.log(`[SMS] OTP for +91${phone}: ${otp}`);
            return;
        }
        throw new AppError(500, 'SMS provider is not configured', 'SMS_NOT_CONFIGURED');
    }
    const url = `${TWO_FACTOR_BASE_URL}/${env.smsApiKey}/SMS/${phone}/${otp}/${OTP_TEMPLATE}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
        throw new AppError(502, 'Failed to send OTP SMS', 'SMS_SEND_FAILED');
    }
    const body = (await response.json());
    if (body.Status !== 'Success') {
        throw new AppError(502, body.Details || 'Failed to send OTP SMS', 'SMS_SEND_FAILED');
    }
}
