import { bringGarageCardWords, referralAmountLabel } from '@repo/core/bring-garage';
import { fill } from '@repo/core/i18n';
import { ScButton } from '@repo/native-ui/button';
import { Raised } from '@repo/native-ui/finish';
import { IconGift } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useState } from 'react';
import { View } from 'react-native';

import { RecommendSheet, useCustomerZone } from '@/components/reach/free-wash';

/**
 * BringGarageCard (apps/users/components/reach/bring-garage.tsx): "Know a good garage? Bring it
 * to Detlio", the last thing on the garage list in every area, above "Nothing here suits you?".
 * The outline button opens the Recommend sheet. In a small city it stands where the quiet
 * "Know a great garage in <City>?" row was, never beside it.
 */
export function BringGarageCard() {
  const colors = useColors();
  const styles = useStyles();
  const zone = useCustomerZone();
  const [open, setOpen] = useState(false);
  const words = bringGarageCardWords();
  return (
    <>
      <Raised radius={20} innerStyle={styles.card}>
        <View style={styles.top}>
          <View style={styles.disc}>
            <IconGift size={20} color={colors.success} />
          </View>
          <View style={styles.grow}>
            <T size={15} weight={500} lh={20} accessibilityRole="header">
              {words.title}
            </T>
            <T size={13} lh={18} color={colors.textSecondary}>
              {fill(words.body, {
                amount: (
                  <T size={13} weight={600} lh={18}>
                    {referralAmountLabel()}
                  </T>
                ),
              })}
            </T>
          </View>
        </View>
        <ScButton variant="outline" onPress={() => setOpen(true)}>
          {words.action}
        </ScButton>
      </Raised>
      <RecommendSheet open={open} onClose={() => setOpen(false)} zoneSlug={zone?.slug ?? null} />
    </>
  );
}

const useStyles = createStyles((c) => ({
  card: { gap: 16, padding: 16 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  disc: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: c.disc },
  grow: { flex: 1, minWidth: 0, gap: 2 },
}));
