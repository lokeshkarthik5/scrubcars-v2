import type { ApiVendorClosure, ApiVendorProfile, ApiWorkingHours } from '@repo/core/api/types';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppShell, garageScreen } from '@/components/app-shell';
import { GarageStatus } from '@/components/garage-status';
import { HubBack, HubTitle } from '@/components/hub/parts';
import { Skeleton } from '@repo/native-ui/primitives';
import { HoursTab } from '@/components/settings/hours-tab';
import { LocationTab } from '@/components/settings/location-tab';
import { ProfileTab } from '@/components/settings/profile-tab';
import { SettingsMenu } from '@/components/settings/settings-menu';
import { TimeOffTab } from '@/components/settings/time-off-tab';
import { toast } from '@repo/native-ui/toast';
import { isSignedOut } from '@/lib/auth';
import { errorText } from '@/lib/error-text';
import { getMyVendor, getWorkingHours } from '@/lib/garage-api';
import { type SettingsSection, settingsSection } from '@/lib/settings-logic';
import { createStyles } from '@repo/native-ui/theme';
import { getMyClosures } from '@/lib/vendor-api';
import { msg, useT } from '@repo/core/i18n';

/** Each section's title over its Back (English, shown as t(…)), as the website's. */
const SECTION_TITLES: Record<SettingsSection, string> = {
  profile: msg('Profile'),
  location: msg('Location'),
  hours: msg('Hours'),
  'time-off': msg('Time off'),
  capacity: msg('Capacity'),
  'job-types': msg('Job types'),
  pickup: msg('Pickup & drop'),
};

/**
 * Settings (apps/vendors/app/settings/page.tsx) as one menu (mockup garage-hub 5, 22 Nov
 * 2026): the garage card and three list cards. A row opens its section here, on its own
 * under a Back (`?section=`; an old `?tab=` link opens the same), with the same form and the
 * same saves as the old tabs; Garage photos, Documents, the agreement, Team and
 * Notifications are their own pages, as before. Like the web it loads the garage, its
 * working hours and its holidays together, and shows a skeleton until the first two are
 * in; a failed load is a toast. The screen is keyed by garage (garageScreen), so a company
 * switch loads afresh.
 */
function SettingsScreen() {
  const t = useT();
  const styles = useStyles();
  const params = useLocalSearchParams<{ section?: string; tab?: string }>();
  const section = settingsSection(params.section ?? params.tab);
  const open = useCallback((next: SettingsSection) => router.setParams({ section: next, tab: undefined }), []);
  const back = useCallback(() => router.setParams({ section: undefined, tab: undefined }), []);

  const [vendor, setVendor] = useState<ApiVendorProfile | null>(null);
  const [hours, setHours] = useState<ApiWorkingHours[]>([]);
  const [closures, setClosures] = useState<ApiVendorClosure[]>([]);
  // Holidays load on their own: a failure there should cost the Holidays list, not every section.
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

  const title = section ? <HubBack title={t(SECTION_TITLES[section])} onBack={back} /> : <HubTitle>{t('Settings')}</HubTitle>;

  if (loading) {
    return (
      <AppShell showBrand brandRight={<GarageStatus />} gap={12}>
        {title}
        {/* The garage card, then a list card's worth. */}
        <Skeleton height={176} radius={28} />
        <Skeleton height={260} radius={22} />
      </AppShell>
    );
  }

  return (
    <AppShell showBrand brandRight={<GarageStatus />} gap={12}>
      {title}
      {section === null ? (
        <SettingsMenu vendor={vendor} hours={hours} closures={closures} onOpen={open} />
      ) : (
        // The section's own parts, gap-5 apart as the old tab's panel.
        <View style={styles.panel}>
          {section === 'profile' ? (
            <ProfileTab vendor={vendor} onSaved={setVendor} links={false} />
          ) : section === 'location' ? (
            vendor ? (
              <LocationTab vendor={vendor} onSaved={setVendor} />
            ) : null
          ) : section === 'time-off' ? (
            <TimeOffTab
              vendor={vendor}
              closures={closures}
              closuresFailed={closuresFailed}
              onVendorChange={setVendor}
              onClosuresChange={setClosures}
            />
          ) : (
            <HoursTab
              // Saved hours come back from the server: keyed so a fresh visit starts from them.
              key={section}
              vendor={vendor}
              hours={hours}
              onVendorChange={setVendor}
              onOpenLocation={() => open('location')}
              onHoursChange={setHours}
              part={section}
            />
          )}
        </View>
      )}
    </AppShell>
  );
}

export default garageScreen(SettingsScreen);

const useStyles = createStyles(() => ({
  panel: { gap: 20 },
}));
