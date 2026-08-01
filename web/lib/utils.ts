import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * The timezone the app operates in. The server anchors all slot times to
 * IST (+05:30), so every client-side date/time formatter must render in the
 * same zone — otherwise a customer on a non-IST device sees shifted times.
 */
export const APP_TIMEZONE = 'Asia/Kolkata'
