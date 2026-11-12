import { useT } from '@repo/core/i18n';
import { IconArrowRight, IconX } from '@repo/native-ui/icons';
import { HubCard } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { type BookingDraft, clearBookingDraft, draftResumePath, readBookingDraft } from '@/lib/booking-draft';

/** ContinueBookingCard (apps/users/components/checkout/continue-booking.tsx). */
export function ContinueBookingCard() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [draft, setDraft] = useState<BookingDraft | null>(() => readBookingDraft());
  // Read again on return: checkout may just have written or cleared it.
  useFocusEffect(useCallback(() => setDraft(readBookingDraft()), []));
  if (!draft) return null;
  return (
    <HubCard style={styles.card} accessibilityLabel={t('Continue your booking')}>
      <Pressable accessibilityRole="link" onPress={() => router.push(draftResumePath(draft) as Href)} style={styles.link}>
        <View style={styles.grow}>
          <T size={12} lh={16} color={colors.textMuted}>
            {t('You started a booking')}
          </T>
          <T size={15} lh={20} numberOfLines={1}>
            {t('Continue your booking at {name}', { name: draft.vendorName })}
          </T>
        </View>
        <IconArrowRight size={18} color={colors.textSecondary} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Forget this booking')}
        onPress={() => {
          clearBookingDraft();
          setDraft(null);
        }}
        style={styles.forget}
      >
        <IconX size={16} color={colors.textMuted} />
      </Pressable>
    </HubCard>
  );
}

const useStyles = createStyles(() => ({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 16, paddingRight: 8 },
  link: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  forget: { height: 44, width: 44, alignItems: 'center', justifyContent: 'center' },
}));
