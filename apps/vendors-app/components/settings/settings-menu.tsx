import { getPushConfig } from '@repo/core/api/push';
import type { ApiVendorClosure, ApiVendorProfile, ApiWorkingHours } from '@repo/core/api/types';
import { DEFAULT_DOORSTEP_RADIUS_KM } from '@repo/core/doorstep';
import { LANGUAGE_NAMES, LANGUAGE_OPTIONS, useLang, useT, useTn } from '@repo/core/i18n';
import { luxuryRowLine } from '@repo/core/luxury-form';
import { TIER_LABELS, type Tier } from '@repo/core/tiers';
import { useQuery } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Image, View } from 'react-native';

import { AccountActions } from '@/components/account-actions';
import { AppearanceCard } from '@/components/appearance-card';
import { AppLockCard } from '@/components/app-lock-card';
import { HubList, HubPill, HubRow, HubSectionHead, HubTag } from '@/components/hub/parts';
import { SupportCard } from '@/components/support-card';
import {
  IconBell,
  IconCar,
  IconClock,
  IconFileText,
  IconLanguage,
  IconLock,
  IconLogout,
  IconMapPin,
  IconPhoto,
  IconStack2,
  IconSun,
  IconTruck,
  IconUser,
  IconUsers,
  type IconProps,
} from '@repo/native-ui/icons';
import { LanguageSheet } from '@repo/native-ui/language-sheet';
import { HubCard } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { APP_VERSION } from '@/lib/app-config';
import { useAuth, useIsVendorAdmin } from '@/lib/auth';
import { getGarageDocumentsConfig } from '@/lib/documents-api';
import { documentsRowDescription } from '@/lib/documents-view';
import { useGarageTier } from '@/lib/garage-api';
import { useGarageLuxury } from '@/lib/luxury-api';
import { hoursSummary, type SettingsSection } from '@/lib/settings-logic';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';
import { getMyPhotos } from '@/lib/vendor-api';

import { IconFileCertificate, IconSteeringWheel } from './settings-icons';

const go = (path: string) => router.push(path as Href);

/** The local Tabler drawings take the same props as the package's. */
const asIcon = (Icon: (props: IconProps) => React.ReactElement) => Icon;

/**
 * The garage itself, on top of the menu (mockup garage-hub 5): its cover photo (the first
 * garage photo) if any, the name, the address, whether customers can see it, and its tier.
 */
function GarageCard({ vendor, cover, tier }: { vendor: ApiVendorProfile; cover: string | null; tier: Tier | null }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const address = [vendor.address, vendor.city].filter(Boolean).join(', ');
  return (
    <HubCard accessibilityLabel={vendor.businessName} style={styles.garage}>
      {cover ? (
        <Image source={{ uri: cover }} style={styles.cover} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : (
        <View style={styles.coverBlank} />
      )}
      <View style={styles.garageBody}>
        <T size={24} weight={300} lh={30} tracking={-0.02}>
          {vendor.businessName}
        </T>
        {address || vendor.pincode ? (
          <T size={13} lh={18} color={colors.dim} style={styles.address}>
            {address}
            {vendor.pincode ? (
              <>
                {address ? ' · ' : ''}
                <T num size={13} lh={18} color={colors.dim}>
                  {vendor.pincode}
                </T>
              </>
            ) : null}
          </T>
        ) : null}
        <View style={styles.tags}>
          <HubTag tone={vendor.isVerified ? 'green' : 'amber'}>
            {vendor.isVerified ? t('Shown to customers') : t('Not shown to customers yet')}
          </HubTag>
          {tier ? <HubTag>{t(TIER_LABELS[tier])}</HubTag> : null}
        </View>
      </View>
    </HubCard>
  );
}

/** Luxury car specialist (0083): the owner seat only, locked below Silver, as before. */
function LuxuryRow() {
  const t = useT();
  const vendorId = useAuth((s) => s.activeVendorId) ?? undefined;
  const { data } = useGarageLuxury(vendorId);
  const { line, locked } = luxuryRowLine(data);
  return (
    <HubRow
      icon={locked ? IconLock : asIcon(IconSteeringWheel)}
      label={t('Luxury car specialist')}
      sub={t(line)}
      onPress={() => go('/settings/luxury')}
    />
  );
}

/** English or தமிழ் (Tamil) on this phone, as a row of the Account card, opening the sheet. */
function LanguageHubRow() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const [open, setOpen] = useState(false);
  return (
    <>
      <HubRow icon={IconLanguage} label={t('Language')} value={LANGUAGE_NAMES[lang]} onPress={() => setOpen(true)} />
      <LanguageSheet open={open} onClose={() => setOpen(false)} options={LANGUAGE_OPTIONS} value={lang} onChange={setLang} />
    </>
  );
}

/**
 * Settings as one menu (mockup garage-hub 5, the website's twin in
 * apps/vendors/app/settings/page.tsx): the garage card, then Your garage, Jobs and Account
 * as list cards, each row with its current answer when it is already known. A row opens its
 * section (`onOpen`) or its own page; everything the old Account tab held follows.
 */
export function SettingsMenu({
  vendor,
  hours,
  closures,
  onOpen,
}: {
  vendor: ApiVendorProfile | null;
  hours: ApiWorkingHours[];
  closures: ApiVendorClosure[];
  onOpen: (section: SettingsSection) => void;
}) {
  const t = useT();
  const tn = useTn();
  const colors = useColors();
  const styles = useStyles();
  const vendorId = useAuth((s) => s.activeVendorId) ?? undefined;
  const signOut = useAuth((s) => s.signOut);
  const isAdmin = useIsVendorAdmin();
  const [busy, setBusy] = useState(false);

  // The cover and the count; read again on return from Garage photos.
  const photos = useQuery({ queryKey: ['photos', 'garage', vendorId], queryFn: getMyPhotos, enabled: Boolean(vendorId), retry: false });
  useRefreshOnFocus(['photos', 'garage', vendorId]);
  const tier = useGarageTier(vendorId, isAdmin);
  // Documents shows only once the server has its private bucket for them.
  const documents = useQuery({
    queryKey: ['documents', 'config', vendorId],
    queryFn: getGarageDocumentsConfig,
    enabled: isAdmin,
    retry: false,
  });
  const push = useQuery({
    queryKey: ['push', 'garage', 'config-settings'],
    queryFn: () => getPushConfig('garage'),
    retry: false,
  });

  const cover = photos.data && photos.data.length > 0 ? [...photos.data].sort((a, b) => a.sortOrder - b.sortOrder)[0]!.url : null;
  const wholeCity = vendor?.doorstepWholeCity === true && Boolean(vendor.garageCity?.name);
  const locationValue = !vendor
    ? undefined
    : vendor.lat === null
      ? t('Not set')
      : vendor.doorstepEnabled
        ? wholeCity
          ? t('All over {city}', { city: vendor.garageCity?.name ?? '' })
          : t('Pinned · {km} km doorstep', { km: vendor.doorstepRadiusKm ?? DEFAULT_DOORSTEP_RADIUS_KM })
        : t('Pinned');
  const timeOffValue = vendor?.bookingsPausedAt
    ? t('Paused')
    : closures.length > 0
      ? tn(closures.length, '{count} holiday', '{count} holidays')
      : t('None');
  const jobTypesValue = vendor
    ? [vendor.dropinEnabled && t('Drop In'), vendor.doorstepEnabled && t('Doorstep')].filter(Boolean).join(' · ') || t('None')
    : undefined;
  const bays = vendor?.bays && vendor.bays > 0 ? vendor.bays : 1;

  return (
    <>
      {vendor ? <GarageCard vendor={vendor} cover={cover} tier={tier.data?.tier ?? null} /> : null}

      <HubSectionHead title={t('Your garage')} />
      <HubList>
        <HubRow first icon={IconUser} label={t('Profile')} value={t('Name, phone, address')} onPress={() => onOpen('profile')} />
        <HubRow
          icon={IconPhoto}
          label={t('Garage photos')}
          value={photos.data ? String(photos.data.length) : undefined}
          onPress={() => go('/photos')}
        />
        <HubRow icon={IconMapPin} label={t('Location')} value={locationValue} onPress={() => onOpen('location')} />
        <HubRow icon={IconClock} label={t('Hours')} value={hours.length > 0 ? hoursSummary(hours) : undefined} onPress={() => onOpen('hours')} />
        <HubRow icon={IconSun} label={t('Time off')} value={timeOffValue} onPress={() => onOpen('time-off')} />
      </HubList>

      {vendor ? (
        <>
          <HubSectionHead title={t('Jobs')} />
          <HubList>
            <HubRow
              first
              icon={IconStack2}
              label={t('Capacity')}
              value={tn(bays, '{count} car at a time', '{count} cars at a time')}
              onPress={() => onOpen('capacity')}
            />
            <HubRow icon={IconCar} label={t('Job types')} value={jobTypesValue} onPress={() => onOpen('job-types')} />
            <HubRow
              icon={IconTruck}
              label={t('Pickup & drop')}
              value={vendor.pickupEnabled ? t('On') : t('Off')}
              onPress={() => onOpen('pickup')}
            />
            {isAdmin ? <LuxuryRow /> : null}
          </HubList>
        </>
      ) : null}

      <HubSectionHead title={t('Account')} />
      <HubList>
        {documents.data?.enabled ? (
          <HubRow
            first
            icon={asIcon(IconFileCertificate)}
            label={t('Documents')}
            // A doorstep-only garage (no pickup either) has no shop, so no shop photo is asked for.
            sub={t(documentsRowDescription(vendor))}
            onPress={() => go('/settings/documents')}
          />
        ) : null}
        <HubRow
          first={!documents.data?.enabled}
          icon={IconFileText}
          label={t('Garage agreement')}
          sub={t('Read and accept the Detlio garage agreement, for Bronze')}
          onPress={() => go('/agreement')}
        />
        <HubRow
          icon={IconUsers}
          label={t('Team members')}
          sub={t('Add admins and operators, and set what they can do')}
          onPress={() => go('/settings/members')}
        />
        {push.data?.enabled ? (
          <HubRow
            icon={IconBell}
            label={t('Notifications')}
            sub={t('New-booking alerts on this phone or computer')}
            onPress={() => go('/settings/notifications')}
          />
        ) : null}
        {/* English or தமிழ் (Tamil), on this phone. */}
        <LanguageHubRow />
      </HubList>

      <AppearanceCard />
      <AppLockCard />

      {/* Close my garage (the owner), or leave it and delete the login (any other seat) (0066). */}
      <AccountActions />

      <View style={styles.section}>
        <HubSectionHead title={t('Support')} />
        <SupportCard />
      </View>

      <HubPill
        disabled={busy}
        onPress={() => {
          setBusy(true);
          void signOut().finally(() => setBusy(false));
        }}
      >
        <IconLogout size={18} />
        <T size={15} weight={500}>
          {t('Log out')}
        </T>
      </HubPill>
      <T num size={12} color={colors.textMuted} align="center" style={styles.version}>
        {`Detlio for Garages ${APP_VERSION}`}
      </T>
    </>
  );
}

const useStyles = createStyles((c) => ({
  garage: { overflow: 'hidden' },
  cover: { height: 120, width: '100%', borderTopLeftRadius: 27, borderTopRightRadius: 27 },
  coverBlank: { height: 88, backgroundColor: c.disc, borderTopLeftRadius: 27, borderTopRightRadius: 27 },
  garageBody: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 18 },
  address: { marginTop: 4 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  section: { gap: 4 },
  version: { marginBottom: 8 },
}));
