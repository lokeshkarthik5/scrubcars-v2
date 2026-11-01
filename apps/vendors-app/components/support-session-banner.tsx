import { subscribeToSupportSession } from '@repo/core/api/client';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { createStyles } from '@repo/native-ui/theme';

import { IconShieldLock } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';

export function useSupportSession(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => subscribeToSupportSession(setActive), []);
  return active;
}

/** SupportSessionBanner: said on every screen while Detlio staff act inside a garage. */
export function SupportSessionBanner() {
  const styles = useStyles();
  const active = useSupportSession();
  const vendor = useAuth((s) => s.vendor);
  if (!active) return null;
  return (
    <View accessibilityRole="alert" style={styles.banner}>
      <IconShieldLock size={16} stroke={1.5} />
      <T size={12} style={styles.text}>
        {`Detlio support session${vendor?.businessName ? ` on ${vendor.businessName}` : ''}. Actions here are recorded.`}
      </T>
    </View>
  );
}

const useStyles = createStyles((colors) => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    backgroundColor: colors.warningWash,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  text: { flex: 1 },
}));
