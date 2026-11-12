import type { ApiVendorProfile } from '@repo/core/api/types';
import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScButton } from '@repo/native-ui/button';
import { ScBadge } from '@/components/form-controls';
import { ScInput } from '@repo/native-ui/inputs';
import { ScCard } from '@repo/native-ui/primitives';
import { LinkRow, SectionHeader } from '@/components/rows';
import { getGarageDocumentsConfig } from '@/lib/documents-api';
import { documentsRowDescription } from '@/lib/documents-view';
import { useIsVendorAdmin } from '@/lib/auth';
import { updateVendorSettings } from '@/lib/vendor-api';
import { digitsOnly, type ProfileForm, profileFromVendor, profilePayload } from '@/lib/settings-logic';

import { IconFileCertificate, IconFileText, IconPhoto } from './settings-icons';
import { useSaving } from './use-saving';
import { useT } from '@repo/core/i18n';

/** Settings > Profile (apps/vendors/app/settings/page.tsx), with its three link rows. */
export function ProfileTab({
  vendor,
  onSaved,
}: {
  vendor: ApiVendorProfile | null;
  onSaved: (vendor: ApiVendorProfile) => void;
}) {
  const t = useT();
  const [form, setForm] = useState<ProfileForm>(
    vendor ? profileFromVendor(vendor) : { businessName: '', phone: '', address: '', city: '', pincode: '' }
  );
  const { saving, run } = useSaving();
  const isAdmin = useIsVendorAdmin();
  // Documents shows only once the server has its private bucket for them.
  const [documentsOn, setDocumentsOn] = useState(false);
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    getGarageDocumentsConfig()
      .then((config) => {
        if (!cancelled) setDocumentsOn(config.enabled);
      })
      .catch(() => {
        if (!cancelled) setDocumentsOn(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const save = () =>
    vendor &&
    run('profile', async () => {
      onSaved(await updateVendorSettings(profilePayload(form, vendor)));
    });

  return (
    <>
      <View style={styles.section}>
        <View style={styles.header}>
          <SectionHeader title={t('Profile')} />
          {vendor ? (
            <ScBadge variant={vendor.isVerified ? 'success' : 'pending'}>
              {vendor.isVerified ? t('Shown to customers') : t('Not shown to customers yet')}
            </ScBadge>
          ) : null}
        </View>
        <ScCard style={styles.section}>
          <ScInput
            label={t('Business name')}
            value={form.businessName}
            onChangeText={(businessName) => setForm({ ...form, businessName })}
          />
          <ScInput
            label={t('Phone')}
            numeric
            keyboardType="number-pad"
            textContentType="telephoneNumber"
            maxLength={10}
            value={form.phone}
            onChangeText={(text) => setForm({ ...form, phone: digitsOnly(text, 10) })}
          />
          <ScInput
            label={t('Address')}
            textContentType="fullStreetAddress"
            value={form.address}
            onChangeText={(address) => setForm({ ...form, address })}
          />
          <ScInput label={t('City')} value={form.city} onChangeText={(city) => setForm({ ...form, city })} />
          <ScInput
            label={t('Pincode')}
            numeric
            keyboardType="number-pad"
            maxLength={6}
            placeholder="600001"
            value={form.pincode}
            onChangeText={(text) => setForm({ ...form, pincode: digitsOnly(text, 6) })}
          />
          <ScButton variant="main" size="lg" disabled={saving === 'profile'} onPress={() => void save()}>
            {saving === 'profile' ? t('Saving...') : t('Save profile')}
          </ScButton>
        </ScCard>
      </View>

      <LinkRow
        icon={<IconPhoto size={18} />}
        title={t('Garage photos')}
        description={t('Add photos customers see on your listing')}
        onPress={() => router.push('/photos' as Href)}
      />
      {documentsOn ? (
        <LinkRow
          icon={<IconFileCertificate size={18} />}
          title={t('Documents')}
          // A doorstep-only garage (no pickup either) has no shop, so no shop photo is asked for.
          description={t(documentsRowDescription(vendor))}
          onPress={() => router.push('/settings/documents' as Href)}
        />
      ) : null}
      <LinkRow
        icon={<IconFileText size={18} />}
        title={t('Garage agreement')}
        description={t('Read and accept the Detlio garage agreement, for Bronze')}
        onPress={() => router.push('/agreement' as Href)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
});
