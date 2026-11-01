import type { MediaConfig } from '@repo/core/api/service-media';
import type { Service } from '@repo/core/types';
import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, type ScrollView, StyleSheet, View } from 'react-native';

import { AppShell, garageScreen } from '@/components/app-shell';
import { LoadError, SkeletonList } from '@/components/primitives';
import { TopBar } from '@/components/rows';
import { PackagesPanel } from '@/components/services/packages-panel';
import { ServicesTab } from '@/components/services/services-tab';
import { T } from '@/components/text';
import { toast } from '@/components/toast';
import { useAuth } from '@/lib/auth';
import { emptyServiceForm, type ServiceForm } from '@/lib/service-form';
import { getMediaConfig, getMyServices } from '@/lib/services-api';
import { colors } from '@/lib/theme';

type Tab = 'services' | 'packages';
const TABS: { value: Tab; label: string }[] = [
  { value: 'services', label: 'Services' },
  { value: 'packages', label: 'Packages' },
];

/**
 * ActiveGarage (apps/vendors/components/active-garage.tsx): which garage this is, beside the
 * wordmark. Left out for someone with two or more: the company switcher already says.
 */
function ActiveGarage() {
  const name = useAuth((s) => s.vendor?.businessName);
  const vendorCount = useAuth((s) => s.vendors.length);
  if (!name || vendorCount > 1) return null;
  return (
    <T size={13} weight={500} color={colors.textSecondary} numberOfLines={1}>
      {name}
    </T>
  );
}

/**
 * Services and Packages (apps/vendors/app/services/page.tsx). Owner and admin only: the
 * route gate sends an operator home, as the web page does. Real tabs, each its own panel
 * with only the open one mounted, so Packages loads when it is opened.
 */
function ServicesScreen() {
  const [tab, setTab] = useState<Tab>('services');
  const [services, setServices] = useState<Service[]>([]);
  const [serviceForm, setServiceForm] = useState<ServiceForm>(emptyServiceForm);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // What the photo-and-video block may offer (video only once Stream is set up on the
  // server). Shared by every service and package on the screen.
  const [mediaConfig, setMediaConfig] = useState<MediaConfig | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    getMyServices()
      .then(setServices)
      .catch(() => {
        toast.error('Failed to load services');
        setFailed(true);
      })
      .finally(() => setLoading(false));
    getMediaConfig()
      .then(setMediaConfig)
      .catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  // The form is at the top; Edit on a card lower down brings it into view.
  const showForm = () => scroll.current?.scrollTo({ y: 0, animated: true });

  if (loading || failed) {
    return (
      <AppShell showBrand brandRight={<ActiveGarage />}>
        <TopBar title="Services" />
        {failed ? <LoadError what="your services" onRetry={load} /> : <SkeletonList count={3} height={112} />}
      </AppShell>
    );
  }

  return (
    <AppShell showBrand brandRight={<ActiveGarage />} scrollRef={scroll}>
      <TopBar title="Services" />

      {/* Tabs root: gap-4 between the tab list and the open panel. */}
      <View style={styles.tabsRoot}>
        <View accessibilityRole="tablist" style={styles.tabs}>
          {TABS.map(({ value, label }) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === value }}
              onPress={() => setTab(value)}
              style={[styles.tab, tab === value && styles.tabOn]}
            >
              <T size={13} weight={500} numberOfLines={1} color={tab === value ? colors.textPrimary : colors.textSecondary}>
                {label}
              </T>
            </Pressable>
          ))}
        </View>

        {tab === 'packages' ? (
          <PackagesPanel services={services} mediaConfig={mediaConfig} onEditStarted={showForm} />
        ) : (
          <ServicesTab
            services={services}
            setServices={setServices}
            form={serviceForm}
            setForm={setServiceForm}
            editingId={editingServiceId}
            setEditingId={setEditingServiceId}
            mediaConfig={mediaConfig}
            onEditStarted={showForm}
          />
        )}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  tabsRoot: { gap: 16 },
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, padding: 4 },
  tab: { flex: 1, minHeight: 48, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.surfaceElevated },
});

export default garageScreen(ServicesScreen);
