import { firstNameOf, initialOf } from '@repo/core/home-display';
import { useUserStore } from '@repo/core/stores/user-store';
import { ScButton } from '@repo/native-ui/button';
import { IconChevronRight } from '@repo/native-ui/icons';
import { getPushConfig } from '@repo/core/api/push';
import { HubCard, PressRow, ScSegmented } from '@repo/native-ui/primitives';
import { useQuery } from '@tanstack/react-query';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors, useTheme } from '@repo/native-ui/theme';
import type { Appearance } from '@repo/native-ui/tokens';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router } from 'expo-router';
import { useEffect } from 'react';
import { Image, View } from 'react-native';

import { CustomerShell } from '@/components/screen';
import { useAuth } from '@/lib/auth';

const OPTIONS: { value: Appearance; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Native only (the owner's frame L): how the app looks on this phone. */
function AppearanceCard() {
  const colors = useColors();
  const styles = useStyles();
  const { appearance, setAppearance } = useTheme();
  return (
    <HubCard radius={22} style={styles.card}>
      <T size={15}>Appearance</T>
      <T size={13} lh={18} color={colors.textSecondary}>
        How the app looks on this phone. System follows your phone&apos;s setting.
      </T>
      <View style={styles.segment}>
        <ScSegmented accessibilityLabel="Appearance" value={appearance} onChange={setAppearance} options={OPTIONS} minHeight={44} trackColor={colors.canvas} />
      </View>
    </HubCard>
  );
}

function Row({ label, href }: { label: string; href: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <PressRow onPress={() => router.navigate(href as Href)}>
      <HubCard radius={22} style={styles.row}>
        <T size={15} style={styles.flex}>
          {label}
        </T>
        <IconChevronRight size={18} color={colors.textMuted} />
      </HubCard>
    </PressRow>
  );
}

/** Profile, the entry only. The rest of apps/users/app/profile/page.tsx comes in stage 3. */
export default function ProfileScreen() {
  const colors = useColors();
  const styles = useStyles();
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  // Only once the API has them set up, as the web's.
  const notifications = useQuery({ queryKey: ['push', 'customer', 'config'], queryFn: () => getPushConfig('customer'), enabled: !!user, retry: false, staleTime: 5 * 60_000 }).data?.enabled;
  const profile = useUserStore((s) => s.profile);

  useEffect(() => {
    if (user) void useUserStore.getState().fetchProfile().catch(() => undefined);
  }, [user]);

  const title = (
    <T accessibilityRole="header" size={28} weight={300} lh={34} tracking={-0.025}>
      Profile
    </T>
  );

  if (!user) {
    return (
      <CustomerShell>
        {title}
        <View style={styles.guest}>
          <T size={15} weight={600} align="center">
            Login to view your profile
          </T>
          <T size={13} align="center" color={colors.textSecondary}>
            Sign in to manage your vehicles and addresses
          </T>
          <ScButton
            variant="main"
            fullWidth={false}
            paddingX={32}
            onPress={() => router.push('/login?next=%2Fprofile' as Href)}
            style={styles.login}
          >
            Login
          </ScButton>
        </View>
        <AppearanceCard />
      </CustomerShell>
    );
  }

  const shown = profile ?? user;
  const areaLine = profile?.area ? [profile.area, profile.pincode].filter(Boolean).join(' – ') : null;
  const phone = user.phone.length === 10 ? `+91 ${user.phone.slice(0, 5)} ${user.phone.slice(5)}` : user.phone;

  return (
    <CustomerShell gap={12}>
      {title}
      <HubCard radius={22} style={styles.head}>
        <View style={styles.avatar}>
          <LinearGradient colors={[colors.avatarFrom, colors.avatarTo]} style={styles.avatarFill}>
            {profile?.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <T size={17} weight={500}>
                {initialOf(firstNameOf(shown.name))}
              </T>
            )}
          </LinearGradient>
        </View>
        <View style={styles.flex}>
          <T size={15} weight={600} numberOfLines={1}>
            {shown.name}
          </T>
          <T num size={13} lh={18} color={colors.textSecondary}>
            {phone}
          </T>
          {areaLine ? (
            <T size={12} numberOfLines={1} color={colors.textSecondary}>
              {areaLine}
            </T>
          ) : null}
        </View>
      </HubCard>
      <Row label="My bookings" href="/bookings" />
      <Row label="Saved garages" href="/profile/saved-garages" />
      {notifications ? <Row label="Notifications" href="/profile/notifications" /> : null}
      <AppearanceCard />
      <ScButton variant="outline" onPress={() => void signOut().then(() => router.push('/login' as Href))}>
        Log out
      </ScButton>
    </CustomerShell>
  );
}

const useStyles = createStyles(() => ({
  flex: { flex: 1, minWidth: 0 },
  guest: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 12 },
  login: { marginTop: 8 },
  card: { gap: 4, padding: 16 },
  segment: { marginTop: 8 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  avatar: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden' },
  avatarFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 48, height: 48 },
}));
