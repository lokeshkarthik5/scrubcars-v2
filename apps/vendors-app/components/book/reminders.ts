import { ApiError } from '@repo/core/api/client';
import type { useSendReminder } from '@repo/core/api/hooks/use-garage-book';
import { t } from '@repo/core/i18n';

import { toast } from '@repo/native-ui/toast';

import { openLink } from '@/lib/open-link';

/** Sends one reminder (the web's components/book/reminders.ts): WhatsApp opens for an own customer; Detlio pushes for a Detlio one. */
export function sendReminder(send: ReturnType<typeof useSendReminder>, customerId: string, name: string) {
  send.mutate(customerId, {
    onSuccess: (sent) => {
      if (sent.channel === 'whatsapp') openLink(sent.url);
      else toast.success(t('Detlio will remind {name} in the Detlio app.', { name: name.split(' ')[0] ?? '' }));
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError && error.code === 'REMINDER_TOO_SOON'
          ? t('Detlio reminded them this week already. One a week at most.')
          : error instanceof Error
            ? error.message
            : t("Couldn't send that. Try again.")
      ),
  });
}
