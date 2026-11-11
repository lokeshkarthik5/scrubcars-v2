import { LANGUAGE_NAMES, LANGUAGE_OPTIONS, useLang, useT } from '@repo/core/i18n';
import { IconLanguage } from '@repo/native-ui/icons';
import { LanguageSheet } from '@repo/native-ui/language-sheet';
import { useState } from 'react';

import { LinkRow } from '@/components/rows';

/**
 * apps/vendors/components/language-row.tsx: English or தமிழ் (Tamil) on this phone, a
 * LinkRow with the choice under the title in its own language. On Settings → Account
 * and on Your account (every seat's, so an operator can choose too).
 */
export function LanguageRow() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const [open, setOpen] = useState(false);
  return (
    <>
      <LinkRow icon={<IconLanguage size={18} />} title={t('Language')} description={LANGUAGE_NAMES[lang]} onPress={() => setOpen(true)} />
      <LanguageSheet open={open} onClose={() => setOpen(false)} options={LANGUAGE_OPTIONS} value={lang} onChange={setLang} />
    </>
  );
}
