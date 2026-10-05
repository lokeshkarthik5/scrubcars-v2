// Detlio business support contact. Single source of truth for call/WhatsApp.
export const SUPPORT_PHONE_DISPLAY = '+91 93444 34474'
const SUPPORT_PHONE_E164 = '919344434474'

export const SUPPORT_TEL_HREF = `tel:+${SUPPORT_PHONE_E164}`
export const SUPPORT_WHATSAPP_HREF = `https://wa.me/${SUPPORT_PHONE_E164}`

/** A WhatsApp chat with the team, with the customer's message typed in. */
export function supportWhatsAppHref(message: string): string {
  return `${SUPPORT_WHATSAPP_HREF}?text=${encodeURIComponent(message)}`
}
