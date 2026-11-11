import { useT } from '@repo/core/i18n';
import { IconBrandInstagram } from '@repo/native-ui/icons';
import { ScCheckbox } from '@repo/native-ui/chip';
import { Label, ScButton } from '@repo/native-ui/button';
import { Spinner } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { sharePicture } from '@/components/share-host';
import { SHARE_FORMATS, type PremiumCardSpec, type ShareFormat } from '@/lib/premium-card';

import { PremiumSharePicture } from './premium-card';

/**
 * ShareCardImage (apps/users/components/premium-card/share-card-image.tsx): the card as a
 * picture, for a story or feed. Never a gift code, a link or a voucher code. A first name
 * stays off unless the sharer turns it on.
 */
export function ShareCardImage({ spec, firstName = null, compact = false }: { spec: (showName: boolean) => PremiumCardSpec; firstName?: string | null; compact?: boolean }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [showName, setShowName] = useState(false);
  const [busy, setBusy] = useState<ShareFormat | null>(null);

  const share = async (format: ShareFormat) => {
    if (busy) return;
    setBusy(format);
    const { width, height } = SHARE_FORMATS[format];
    await sharePicture(<PremiumSharePicture spec={spec(showName)} format={format} />, { width, height }, 'Detlio');
    setBusy(null);
  };

  return (
    <View style={styles.column}>
      {compact ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((on) => !on)} style={styles.link}>
          <IconBrandInstagram size={16} color={colors.textPrimary} />
          <T size={12} weight={500} lh={16} style={styles.underline}>
            {t('Share')}
          </T>
        </Pressable>
      ) : (
        <ScButton variant="outline" onPress={() => setOpen((on) => !on)}>
          <IconBrandInstagram size={18} color={colors.textPrimary} />
          <Label>{t('Share to Instagram')}</Label>
        </ScButton>
      )}
      {open ? (
        <View style={styles.box}>
          <T size={12} lh={16} color={colors.textSecondary}>
            {t('The card as a picture, for your story or feed. No codes or links go in it.')}
          </T>
          {firstName ? (
            <ScCheckbox label={t('Show “{name}” on the picture', { name: firstName })} checked={showName} onChange={setShowName} />
          ) : null}
          <View style={styles.pair}>
            {(Object.keys(SHARE_FORMATS) as ShareFormat[]).map((format) => (
              <View key={format} style={styles.half}>
                <ScButton variant="outline" disabled={busy !== null} onPress={() => void share(format)}>
                  {busy === format ? <Spinner size={14} /> : null}
                  <Label>{`${t(SHARE_FORMATS[format].label)} ${format === 'story' ? '9:16' : '4:5'}`}</Label>
                </ScButton>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  column: { gap: 8 },
  link: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6 },
  underline: { textDecorationLine: 'underline' },
  box: { gap: 10, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 12 },
  pair: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
}));
