import type { MediaConfig } from '@repo/core/api/service-media';
import type { Service } from '@repo/core/types';
import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { type ScrollView, View } from 'react-native';

import { AppShell, garageScreen } from '@/components/app-shell';
import { GraphiteSwitch } from '@repo/native-ui/finish';
import { LoadError, SkeletonList } from '@repo/native-ui/primitives';
import { TopBar } from '@/components/rows';
import { PackagesPanel } from '@/components/services/packages-panel';
import { ServicesTab } from '@/components/services/services-tab';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import { isSignedOut, useAuth, useIsVendorAdmin } from '@/lib/auth';
import { emptyServiceForm, type ServiceForm } from '@/lib/service-form';
import { getMediaConfig, getMyServices } from '@/lib/services-api';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { msg, useT } from '@repo/core/i18n';

type Tab = 'services' | 'packages';
const TABS: { value: Tab; label: string }[] = [
  { value: 'services', label: msg('Services') },
  { value: 'packages', label: msg('Packages') },
];

/**
 * ActiveGarage (apps/vendors/components/active-garage.tsx): which garage this is, beside the
 * wordmark. Left out for someone with two or more: the company switcher already says.
 */
function ActiveGarage() {
  const colors = useColors();
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
  const t = useT();
  const styles = useStyles();
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
  // An operator is sent home by the route gate; the server refuses them (403), so the
  // screen behind the gate must not ask, or "Failed to load services" flashes as they leave.
  const isVendorAdmin = useIsVendorAdmin();

  const load = useCallback(() => {
    if (!isVendorAdmin) return;
    setLoading(true);
    setFailed(false);
    getMyServices()
      .then(setServices)
      .catch(() => {
        // Leaving (signing out flips an operator to "admin" for a moment): no news to give.
        if (isSignedOut()) return;
        toast.error(t('Failed to load services'));
        setFailed(true);
      })
      .finally(() => setLoading(false));
    getMediaConfig()
      .then(setMediaConfig)
      .catch(() => undefined);
  }, [isVendorAdmin]);
  useEffect(load, [load]);

  // The form is at the top; Edit on a card lower down brings it into view.
  const showForm = () => scroll.current?.scrollTo({ y: 0, animated: true });

  if (loading || failed) {
    return (
      <AppShell showBrand brandRight={<ActiveGarage />}>
        <TopBar title={t('Services')} />
        {failed ? <LoadError what={t('your services')} onRetry={load} /> : <SkeletonList count={3} height={112} />}
      </AppShell>
    );
  }

  return (
    <AppShell showBrand brandRight={<ActiveGarage />} scrollRef={scroll}>
      <TopBar title={t('Services')} />

      {/* Tabs root: gap-4 between the tab list and the open panel. */}
      <View style={styles.tabsRoot}>
        <GraphiteSwitch
          role="tab"
          pinned
          accessibilityLabel={t('Services')}
          options={TABS.map((option) => ({ ...option, label: t(option.label) }))}
          value={tab}
          onChange={setTab}
          style={styles.tabs}
        />

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

const useStyles = createStyles((colors) => ({
  tabsRoot: { gap: 16 },
  // The web's graphite tab strip: a 44-point key inside a 52-point track.
  tabs: { height: 52 },
}));

export default garageScreen(ServicesScreen);
