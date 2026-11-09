import { useState } from 'react';

import { toast } from '@repo/native-ui/toast';
import { errorText } from '@/lib/error-text';
import { t } from '@repo/core/i18n/translate';

/**
 * The web's runAction (services page and packages panel): marks what is saving, runs it,
 * says "Saved successfully" or why it failed. One at a time, as the web's single `saving`
 * key allows.
 */
export function useSaver() {
  const [saving, setSaving] = useState<string | null>(null);
  const run = async (key: string, action: () => Promise<void>) => {
    setSaving(key);
    try {
      await action();
      toast.success(t('Saved successfully'));
    } catch (err) {
      toast.error(errorText(err, t('Something went wrong')));
    } finally {
      setSaving(null);
    }
  };
  return { saving, run };
}
