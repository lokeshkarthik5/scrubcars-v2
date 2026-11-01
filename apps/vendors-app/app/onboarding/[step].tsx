import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthHeading, AuthStage } from '@/components/auth-stage';
import { ScButton } from '@/components/button';
import { T } from '@/components/text';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

/** A number with no garage yet. The set-up wizard is v1.1; until then, the website has it. */
export default function OnboardingScreen() {
  const signOut = useAuth((s) => s.signOut);
  const [busy, setBusy] = useState(false);
  return (
    <AuthStage>
      <AuthHeading title="Set up your garage" subtitle="Coming in the next version." />
      <View style={styles.body}>
        <T size={13} lh={20} color={colors.textSecondary} align="center">
          For now, set up your garage at vendor.detlio.com with this number.
        </T>
        <ScButton
          variant="outline"
          disabled={busy}
          onPress={() => {
            setBusy(true);
            void signOut().finally(() => setBusy(false));
          }}
        >
          Sign out
        </ScButton>
      </View>
    </AuthStage>
  );
}

const styles = StyleSheet.create({ body: { marginTop: 24, gap: 16 } });
