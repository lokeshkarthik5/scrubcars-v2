import { ApiError } from '@repo/core/api/client';
import { useSavedGarages, useToggleSavedGarage } from '@repo/core/api/hooks/use-favourites';
import { useT } from '@repo/core/i18n';
import type { Vendor } from '@repo/core/types';
import { ScButton } from '@repo/native-ui/button';
import { Glass } from '@repo/native-ui/finish';
import { IconHeart, IconHeartFilled } from '@repo/native-ui/icons';
import { PressRow } from '@repo/native-ui/primitives';
import { AFTER_SHEET_MS, ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/lib/auth';

/** Where sign-in returns to: the garage, asking for the heart to be saved. */
export const saveGarageReturnPath = (vendorId: string) => `/garage/${vendorId}?save=1`;

/**
 * SaveGarageButton: a dark disc on the photo in both themes, white when saved. It changes at
 * once and goes back if the server says no. Signed out, it asks to sign in first.
 */
export function SaveGarageButton({ vendor, glass = false }: { vendor: Vendor; glass?: boolean }) {
  const t = useT();
  const colors = useColors();
  const user = useAuth((s) => s.user);
  const saved = useSavedGarages({ enabled: !!user });
  const toggle = useToggleSavedGarage();
  const [askSignIn, setAskSignIn] = useState(false);
  const isSaved = !!user && (saved.data?.vendors.some((v) => v.id === vendor.id) ?? false);

  const press = () => {
    if (!user) {
      setAskSignIn(true);
      return;
    }
    if (!saved.data) return;
    const save = !isSaved;
    toggle.mutate(
      { vendor, save },
      {
        onError: (err) => {
          toast.error(
            err instanceof ApiError && err.code === 'FAVOURITES_LIMIT'
              ? err.message
              : save
                ? t("Couldn't save this garage. Try again.")
                : t("Couldn't remove this garage. Try again.")
          );
        },
      }
    );
  };

  return (
    <>
      <PressRow
        accessibilityLabel={isSaved ? t('Remove {name} from saved garages', { name: vendor.name }) : t('Save {name}', { name: vendor.name })}
        // Signed in, until the saved list is in: a press then could undo a save it can't see.
        disabled={!!user && !saved.data}
        onPress={press}
        style={glass ? styles.glassDisc : styles.disc}
      >
        {/* On glass over a photo (the finish's cards and the garage page's top bar). */}
        {glass ? <Glass pointerEvents="none" radius={22} base="rgba(18,18,22,0.5)" style={StyleSheet.absoluteFill} /> : null}
        {isSaved ? <IconHeartFilled size={20} color="#FAFAFA" /> : <IconHeart size={20} stroke={2} color="#FAFAFA" />}
      </PressRow>

      <ScSheet open={askSignIn} onClose={() => setAskSignIn(false)} accessibilityLabel={t('Sign in to save garages')} horizontalPadding={16}>
        <View style={styles.sheet}>
          <View>
            <T size={16} weight={600}>
              {t('Sign in to save garages')}
            </T>
            <T size={13} color={colors.textSecondary} style={styles.line}>
              {t('Saved garages are kept on your account, under Profile. Signing in brings you back to {name} with it saved.', { name: vendor.name })}
            </T>
          </View>
          <ScButton
            variant="main"
            onPress={() => {
              setAskSignIn(false);
              // After the sheet has gone, or the sign-in's box loses its focus to it.
              setTimeout(() => router.push(`/login?next=${encodeURIComponent(saveGarageReturnPath(vendor.id))}` as Href), AFTER_SHEET_MS);
            }}
          >
            {t('Sign in')}
          </ScButton>
          <Pressable accessibilityRole="button" onPress={() => setAskSignIn(false)} style={styles.notNow}>
            <T size={13} weight={500} color={colors.textSecondary}>
              {t('Not now')}
            </T>
          </Pressable>
        </View>
      </ScSheet>
    </>
  );
}

const styles = StyleSheet.create({
  disc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  glassDisc: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sheet: { gap: 16 },
  line: { marginTop: 4 },
  notNow: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
