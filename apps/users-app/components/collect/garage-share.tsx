import type { GarageOwnedCar } from '@repo/core/api/garage';
import { Label, ScButton } from '@repo/native-ui/button';
import { ScCheckbox } from '@repo/native-ui/chip';
import { IconBrandInstagram } from '@repo/native-ui/icons';
import { Spinner } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useState } from 'react';
import { View } from 'react-native';

import { sharePicture } from '@/components/share-host';
import { SHARE_FORMATS, type ShareFormat } from '@/lib/premium-card';

import { GarageSharePicture } from './garage-card';

/** GarageShare: the card as a Story or Post. The first name goes on only when ticked. */
export function GarageShare({ car, firstName = null }: { car: GarageOwnedCar; firstName?: string | null }) {
  const colors = useColors();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [showName, setShowName] = useState(false);
  const [busy, setBusy] = useState<ShareFormat | null>(null);
  const share = async (format: ShareFormat) => {
    if (busy) return;
    setBusy(format);
    const { width, height } = SHARE_FORMATS[format];
    await sharePicture(<GarageSharePicture car={car} format={format} firstName={showName ? firstName : null} />, { width, height }, 'Detlio Garage');
    setBusy(null);
  };
  return (
    <View style={styles.column}>
      <ScButton variant="outline" onPress={() => setOpen((on) => !on)}>
        <IconBrandInstagram size={18} color={colors.textPrimary} />
        <Label>Share</Label>
      </ScButton>
      {open ? (
        <View style={styles.box}>
          <T size={12} lh={16} color={colors.textSecondary}>
            Your card as a picture for your story or feed, with “Collected on Detlio”.
          </T>
          {firstName ? <ScCheckbox label={`Show “${firstName}’s Garage” on the picture`} checked={showName} onChange={setShowName} /> : null}
          <View style={styles.pair}>
            {(Object.keys(SHARE_FORMATS) as ShareFormat[]).map((format) => (
              <View key={format} style={styles.half}>
                <ScButton variant="outline" disabled={busy !== null} onPress={() => void share(format)}>
                  {busy === format ? <Spinner size={14} /> : null}
                  <Label>{`${SHARE_FORMATS[format].label} ${format === 'story' ? '9:16' : '4:5'}`}</Label>
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
  box: { gap: 10, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 12 },
  pair: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
}));
