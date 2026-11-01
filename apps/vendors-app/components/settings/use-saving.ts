import { useState } from 'react';

import { toast } from '@repo/native-ui/toast';
import { errorText } from '@/lib/error-text';

/**
 * The web settings page's runAction: one thing saving at a time, a "Saved successfully"
 * toast, or the server's words on a failure.
 */
export function useSaving() {
  const [saving, setSaving] = useState<string | null>(null);
  const run = async (key: string, action: () => Promise<void>, done = 'Saved successfully') => {
    setSaving(key);
    try {
      await action();
      toast.success(done);
    } catch (err) {
      toast.error(errorText(err, 'Something went wrong'));
    } finally {
      setSaving(null);
    }
  };
  return { saving, run };
}
