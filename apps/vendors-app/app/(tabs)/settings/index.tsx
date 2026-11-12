import { getPushConfig } from '@repo/core/api/push';
import type { ApiVendorClosure, ApiVendorProfile, ApiWorkingHours } from '@repo/core/api/types';
import { useQuery } from '@tanstack/react-query';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { View } from 'react-native';

import { AccountActions } from '@/components/account-actions';
import { AppearanceCard } from '@/components/appearance-card';
import { AppLockCard } from '@/components/app-lock-card';
import { AppShell, garageScreen } from '@/components/app-shell';
import { GraphiteSwitch } from '@repo/native-ui/finish';
import { Label, ScButton } from '@repo/native-ui/button';
import { IconBell, IconLogout, IconUsers } from '@repo/native-ui/icons';
import { Skeleton, SkeletonList } from '@repo/native-ui/primitives';
import { LinkRow, SectionHeader, TopBar } from '@/components/rows';
import { LanguageRow } from '@/components/language-row';
import { HoursTab } from '@/components/settings/hours-tab';
import { LocationTab } from '@/components/settings/location-tab';
import { ProfileTab } from '@/components/settings/profile-tab';
import { TimeOffTab } from '@/components/settings/time-off-tab';
import { SupportCard } from '@/components/support-card';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import { APP_VERSION } from '@/lib/app-config';
import { isSignedOut, useAuth } from '@/lib/auth';
import { errorText } from '@/lib/error-text';
import { getMyVendor, getWorkingHours } from '@/lib/garage-api';
import { initialTab, SETTINGS_TABS, type SettingsTab } from '@/lib/settings-logic';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { getMyClosures } from '@/lib/vendor-api';
import { msg, useT } from '@repo/core/i18n';

const LABELS: Record<SettingsTab, string> = {
  profile: msg('Profile'),
  location: msg('Location'),
  hours: msg('Hours'),
  'time-off': msg('Time off'),
  account: msg('Account'),
};

/**
 * Settings (apps/vendors/app/settings/page.tsx), with the web's five tabs. Like the web it
 * loads the garage, its working hours and its holidays together, and shows a skeleton until
 * the first two are in; a failed load is a toast. A tab is built the first time it is opened
 * and kept (hidden) after, so what was typed in Profile, Hours or Location survives a look at
 * another tab, as the web's lifted state does. The screen is keyed by garage (garageScreen),
 * so a company switch loads afresh.
 */
function SettingsScreen() {
  const t = useT();
  const styles = useStyles();
  const params = useLocalSearchParams<{ tab?: string }>();
  const requested = initialTab(params.tab);
  const [tab, setTab] = useState<SettingsTab>(requested);
  const [opened, setOpened] = useState<SettingsTab[]>([requested]);
  const [seen, setSeen] = useState(requested);
  const open = (next: SettingsTab) => {
    setTab(next);
    setOpened((list) => (list.includes(next) ? list : [...list, next]));
  };
  if (requested !== seen) {
    setSeen(requested);
    open(requested);
  }

  const [vendor, setVendor] = useState<ApiVendorProfile | null>(null);
  const [hours, setHours] = useState<ApiWorkingHours[]>([]);
  const [closures, setClosures] = useState<ApiVendorClosure[]>([]);
  // Holidays load on their own: a failure there should cost the Holidays list, not every tab.
  const [closuresFailed, setClosuresFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getMyClosures()
      .then((list) => {
        if (cancelled) return;
        setClosures(list);
        setClosuresFailed(false);
      })
      .catch(() => {
        if (!cancelled) setClosuresFailed(true);
      });
    Promise.all([getMyVendor(), getWorkingHours()])
      .then(([vendorData, hoursData]) => {
        if (cancelled) return;
        setVendor(vendorData);
        setHours(hoursData);
      })
      .catch((err) => {
        if (!cancelled && !isSignedOut()) toast.error(errorText(err, t('Failed to load settings')));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <AppShell>
        <TopBar title={t('Settings')} />
        {/* The tab strip, then a form's worth of card. */}
        <SkeletonList count={2} height={44} />
        <Skeleton height={320} />
      </AppShell>
    );
  }

  const panel = (key: SettingsTab, content: ReactNode) =>
    opened.includes(key) ? (
      <View key={key} style={tab === key ? styles.panel : styles.hidden}>
        {content}
      </View>
    ) : null;

  return (
    <AppShell>
      <TopBar title={t('Settings')} />
      <View style={styles.tabsBlock}>
        <GraphiteSwitch
          role="tab"
          pinned
          accessibilityLabel={t('Settings')}
          options={SETTINGS_TABS.map((key) => ({ value: key, label: t(LABELS[key]) }))}
          value={tab}
          onChange={open}
          style={styles.tabs}
        />
        {panel('profile', <ProfileTab vendor={vendor} onSaved={setVendor} />)}
        {panel('location', vendor ? <LocationTab vendor={vendor} onSaved={setVendor} /> : null)}
        {panel(
          'hours',
          <HoursTab vendor={vendor} hours={hours} onVendorChange={setVendor} onOpenLocation={() => open('location')} />
        )}
        {panel(
          'time-off',
          <TimeOffTab
            vendor={vendor}
            closures={closures}
            closuresFailed={closuresFailed}
            onVendorChange={setVendor}
            onClosuresChange={setClosures}
          />
        )}
        {panel('account', <AccountTab />)}
      </View>
    </AppShell>
  );
}

function AccountTab() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const signOut = useAuth((s) => s.signOut);
  const [busy, setBusy] = useState(false);
  const push = useQuery({
    queryKey: ['push', 'garage', 'config-settings'],
    queryFn: () => getPushConfig('garage'),
    retry: false,
  });
  return (
    <>
      <AppearanceCard />
      <AppLockCard />
      {push.data?.enabled ? (
        <LinkRow
          icon={<IconBell size={18} />}
          title={t('Notifications')}
          description={t('New-booking alerts on this phone or computer')}
          onPress={() => router.push('/settings/notifications' as Href)}
        />
      ) : null}
      <LinkRow
        icon={<IconUsers size={18} />}
        title={t('Team')}
        description={t('Add admins and operators, and set what they can do')}
        onPress={() => router.push('/settings/members' as Href)}
      />
      <LanguageRow />
      <AccountActions />
      <View style={styles.section}>
        <SectionHeader title={t('Support')} />
        <SupportCard />
      </View>
      <ScButton
        variant="outline"
        disabled={busy}
        onPress={() => {
          setBusy(true);
          void signOut().finally(() => setBusy(false));
        }}
      >
        <IconLogout size={18} />
        <Label>{t('Log out')}</Label>
      </ScButton>
      <T num size={12} color={colors.textMuted} align="center" style={styles.version}>
        {`Detlio for Garages ${APP_VERSION}`}
      </T>
    </>
  );
}

export default garageScreen(SettingsScreen);

const useStyles = createStyles((colors) => ({
  tabsBlock: { gap: 16 },
  // The web's graphite tab strip: a 44-point key inside a 52-point track.
  tabs: { height: 52 },
  // The web's TabsContent is a column with gap-5.
  panel: { gap: 20 },
  hidden: { display: 'none' },
  section: { gap: 12 },
  version: { marginBottom: 8 },
}));
