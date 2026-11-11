import { useState } from 'react';

import { toast } from '@repo/native-ui/toast';
import { errorText } from '@/lib/error-text';
import { msg, t } from '@repo/core/i18n/translate';

/**
 * The web settings page's runAction: one thing saving at a time, a "Saved successfully"
 * toast, or the server's words on a failure. `done` is English, said in the language in use.
 */
export function useSaving() {
  const [saving, setSaving] = useState<string | null>(null);
  const run = async (key: string, action: () => Promise<void>, done = msg('Saved successfully')) => {
    setSaving(key);
    try {
      await action();
      toast.success(t(done));
    } catch (err) {
      toast.error(errorText(err, t('Something went wrong')));
    } finally {
      setSaving(null);
    }
  };
  return { saving, run };
}
