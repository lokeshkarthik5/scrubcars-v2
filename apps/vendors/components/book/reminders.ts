'use client'

import { toast } from 'react-toastify'
import { ApiError } from '@repo/core/api/client'
import type { useSendReminder } from '@repo/core/api/hooks/use-garage-book'
import { t } from '@repo/core/i18n'

/**
 * Sends one reminder. An own customer: WhatsApp opens on this device with
 * the message typed in (the garage presses Send), and it is logged as sent.
 * A Detlio customer: Detlio sends a free app notification (one a week).
 */
export function openReminder(send: ReturnType<typeof useSendReminder>, customerId: string, name: string) {
  // Opened before the request answers, so the browser counts it as the tap's
  // own window and doesn't block it; it is pointed at WhatsApp when the link arrives.
  const tab = customerId.startsWith('own:') ? window.open('', '_blank') : null
  send.mutate(customerId, {
    onSuccess: (sent) => {
      if (sent.channel === 'whatsapp') {
        if (tab) tab.location.href = sent.url
        else window.location.href = sent.url
      } else {
        toast.success(t('Detlio will remind {name} in the Detlio app.', { name: name.split(' ')[0] ?? '' }))
      }
    },
    onError: (error) => {
      tab?.close()
      toast.error(
        error instanceof ApiError && error.code === 'REMINDER_TOO_SOON'
          ? t('Detlio reminded them this week already. One a week at most.')
          : error instanceof Error
            ? error.message
            : t("Couldn't send that. Try again.")
      )
    },
  })
}
