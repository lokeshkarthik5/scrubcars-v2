import { SUPPORT_TEL_HREF, SUPPORT_WHATSAPP_HREF } from '@repo/core/support';
import { ScButton } from '@repo/native-ui/button';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type ErrorBoundaryProps, router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { ContactButtons } from '@/components/booking/help-sheet';
import { captureError } from '@/lib/sentry';

/** CrashScreen with apps/users/app/error.tsx's words: reported, then a way out. */
export function CrashScreen({ error, retry }: ErrorBoundaryProps) {
  const colors = useColors();
  const styles = useStyles();
  useEffect(() => captureError(error), [error]);
  return (
    <View style={styles.page}>
      <T accessibilityRole="header" size={20} weight={600} lh={28} align="center">
        Something went wrong
      </T>
      <T size={15} lh={22} color={colors.textSecondary} align="center">
        This page hit a problem on our side. Try again, or start over from home.
      </T>
      <View style={styles.actions}>
        <ScButton variant="main" onPress={() => void retry()}>
          Try again
        </ScButton>
        <ScButton variant="outline" onPress={() => router.replace('/')}>
          Go to home
        </ScButton>
      </View>
      <T size={12} lh={16} color={colors.textSecondary} align="center">
        Still stuck? Our team can help.
      </T>
      <ContactButtons who="Detlio support" callHref={SUPPORT_TEL_HREF} whatsApp={SUPPORT_WHATSAPP_HREF} />
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, justifyContent: 'center', gap: 12, backgroundColor: c.canvas, paddingHorizontal: 24 },
  actions: { gap: 8, marginVertical: 8 },
}));
