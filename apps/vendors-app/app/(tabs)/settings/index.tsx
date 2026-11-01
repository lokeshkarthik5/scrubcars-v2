import type { ApiVendorProfile } from '@repo/core/api/types';
import { getPushConfig } from '@repo/core/api/push';
import { APP_TIMEZONE } from '@repo/core/utils';
import { useQuery } from '@tanstack/react-query';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AccountActions } from '@/components/account-actions';
import { AppShell, garageScreen } from '@/components/app-shell';
import { Label, ScButton } from '@/components/button';
import { IconBell, IconLogout, IconUsers } from '@/components/icons';
import { ScInput } from '@/components/inputs';
import { ScCard } from '@/components/primitives';
import { LinkRow, ScSwitch, SectionHeader } from '@/components/rows';
import { SupportCard } from '@/components/support-card';
import { T } from '@/components/text';
import { toast } from '@/components/toast';
import { APP_VERSION } from '@/lib/app-config';
import { useAuth } from '@/lib/auth';
import { getMyVendor, pauseBookings, resumeBookings } from '@/lib/garage-api';
import { colors } from '@/lib/theme';

const TABS = ['profile', 'location', 'hours', 'time-off', 'account'] as const;
type SettingsTab = (typeof TABS)[number];
const LABELS: Record<SettingsTab, string> = {
  profile: 'Profile',
  location: 'Location',
  hours: 'Hours',
  'time-off': 'Time off',
  account: 'Account',
};

/**
 * Settings (apps/vendors/app/settings/page.tsx), with the web's five tabs. Account
 * and Pause new bookings are v1.0 and live; the rest are v1.1 and say so. Opens on
 * Account rather than the web's Profile, so the tab never lands on an empty screen.
 */
function SettingsScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const requested = TABS.includes(params.tab as SettingsTab) ? (params.tab as SettingsTab) : 'account';
  const [tab, setTab] = useState<SettingsTab>(requested);
  const [seen, setSeen] = useState(requested);
  if (requested !== seen) {
    setSeen(requested);
    setTab(requested);
  }

  return (
    <AppShell>
      <T accessibilityRole="header" size={18} weight={700}>
        Settings
      </T>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {TABS.map((key) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            onPress={() => setTab(key)}
            style={[styles.tab, tab === key && styles.tabOn]}
          >
            <T size={13} weight={500} numberOfLines={1} color={tab === key ? colors.textPrimary : colors.textSecondary}>
              {LABELS[key]}
            </T>
          </Pressable>
        ))}
      </View>
      {tab === 'account' ? <AccountTab /> : tab === 'time-off' ? <TimeOffTab /> : <Later what={LABELS[tab]} />}
    </AppShell>
  );
}

function Later({ what }: { what: string }) {
  return (
    <View style={styles.later}>
      <T size={14} weight={600} align="center">
        {what}
      </T>
      <T size={13} color={colors.textSecondary} align="center">
        Coming in the next version. Until then, change this at vendor.detlio.com.
      </T>
    </View>
  );
}

function AccountTab() {
  const signOut = useAuth((s) => s.signOut);
  const [busy, setBusy] = useState(false);
  const push = useQuery({
    queryKey: ['push', 'garage', 'config-settings'],
    queryFn: () => getPushConfig('garage'),
    retry: false,
  });
  return (
    <>
      {push.data?.enabled ? (
        <LinkRow
          icon={<IconBell size={18} />}
          title="Notifications"
          description="New-booking alerts on this phone or computer"
          onPress={() => router.push('/settings/notifications' as Href)}
        />
      ) : null}
      <LinkRow
        icon={<IconUsers size={18} />}
        title="Team"
        description="Add admins and operators, and set what they can do"
        onPress={() => router.push('/settings/members' as Href)}
      />
      <AccountActions />
      <View style={styles.section}>
        <SectionHeader title="Support" />
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
        <Label>Log out</Label>
      </ScButton>
      <T num size={12} color={colors.textMuted} align="center" style={styles.version}>
        {`Detlio for Garages ${APP_VERSION}`}
      </T>
    </>
  );
}

function TimeOffTab() {
  const [vendor, setVendor] = useState<ApiVendorProfile | null>(null);
  useEffect(() => {
    getMyVendor()
      .then(setVendor)
      .catch(() => undefined);
  }, []);
  return (
    <>
      {vendor ? <PauseSection vendor={vendor} onChange={setVendor} /> : null}
      <Later what="Holidays" />
    </>
  );
}

/** PauseSection (apps/vendors/app/settings/time-off-section.tsx). */
function PauseSection({ vendor, onChange }: { vendor: ApiVendorProfile; onChange: (v: ApiVendorProfile) => void }) {
  const [reason, setReason] = useState(vendor.bookingsPausedReason ?? '');
  const [busy, setBusy] = useState(false);
  const paused = vendor.bookingsPausedAt != null;
  const savedReason = vendor.bookingsPausedReason ?? '';

  const run = async (action: () => Promise<ApiVendorProfile>, done: string) => {
    setBusy(true);
    try {
      const updated = await action();
      onChange(updated);
      setReason(updated.bookingsPausedReason ?? '');
      toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const pause = () => run(() => pauseBookings(reason.trim() || undefined), 'New bookings paused');
  const toggle = () => (paused ? run(resumeBookings, 'Taking bookings again') : pause());

  return (
    <View style={styles.section}>
      <SectionHeader title="Pause new bookings" />
      <ScCard style={styles.section}>
        <T size={11} color={colors.textSecondary}>
          {"Customers can't book you while this is on. Bookings you already have stay as they are."}
        </T>
        <ScInput
          label="Reason (optional, customers see this)"
          placeholder="e.g. Closed for renovation"
          maxLength={200}
          value={reason}
          onChangeText={setReason}
        />
        <View style={styles.switchRow}>
          <T size={13} weight={500}>
            Pause new bookings
          </T>
          <ScSwitch label="Pause new bookings" tone="warning" checked={paused} disabled={busy} onChange={() => void toggle()} />
        </View>
        {paused ? (
          <>
            <T size={12}>
              {'Paused since '}
              <T num size={12} weight={500}>
                {new Date(vendor.bookingsPausedAt as string).toLocaleDateString('en-IN', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  timeZone: APP_TIMEZONE,
                })}
              </T>
              .
              {savedReason ? (
                <T size={12} color={colors.textSecondary}>{` Customers see: “${savedReason}”`}</T>
              ) : null}
            </T>
            <View style={styles.pauseActions}>
              <View style={styles.half}>
                <ScButton variant="outline" disabled={busy || reason.trim() === savedReason} onPress={() => void pause()}>
                  Update reason
                </ScButton>
              </View>
              <View style={styles.half}>
                <ScButton variant="main" size="lg" disabled={busy} onPress={() => void toggle()}>
                  {busy ? 'Saving...' : 'Resume bookings'}
                </ScButton>
              </View>
            </View>
          </>
        ) : null}
      </ScCard>
    </View>
  );
}

export default garageScreen(SettingsScreen);

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, padding: 4 },
  tab: { flex: 1, minHeight: 48, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.surfaceElevated },
  later: {
    gap: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  section: { gap: 12 },
  switchRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  pauseActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  half: { flex: 1, minWidth: 0 },
  version: { marginBottom: 8 },
});
