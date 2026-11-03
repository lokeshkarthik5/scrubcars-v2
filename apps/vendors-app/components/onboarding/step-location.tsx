import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppShell } from '@/components/app-shell';
import { ScButton } from '@repo/native-ui/button';
import { ScInput, ScTextarea } from '@repo/native-ui/inputs';
import { LocationPicker, type PickedLocation } from '@/components/location-picker';
import { ScCard } from '@repo/native-ui/primitives';
import { toast } from '@repo/native-ui/toast';
import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/error-text';
import { onboardingHold } from '@/lib/route-gate';
import { draftData, useOnboardingDraft, writeDraft } from '@/lib/onboarding-draft';
import {
  createVendorBody,
  prefillFromPin,
  step2Problem,
  step2Ready,
  stepPath,
} from '@/lib/onboarding-logic';
import { digitsOnly } from '@/lib/settings-logic';
import { createVendor } from '@/lib/vendor-api';

import { OnboardingHeader, SectionTitle, useDraftSync } from './parts';

/**
 * Step 2: Garage location (apps/vendors/app/onboarding/step-2/page.tsx). Continue makes the
 * garage, makes it the one the app acts as, and walks on to step 3.
 */
export function StepLocation() {
  const saved = useOnboardingDraft.getState();
  const [address, setAddress] = useState(saved.address);
  const [pincode, setPincode] = useState(saved.pincode);
  const [city, setCity] = useState(saved.city);
  const [mapsUrl, setMapsUrl] = useState(saved.mapsUrl);
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState<PickedLocation | null>(
    saved.lat != null && saved.lng != null
      ? {
          lat: saved.lat,
          lng: saved.lng,
          address: saved.address,
          city: saved.city,
          pincode: saved.pincode,
          source: saved.geoSource,
        }
      : null
  );
  useDraftSync({ address, pincode, city, mapsUrl, lat: pin?.lat ?? null, lng: pin?.lng ?? null, geoSource: pin?.source ?? 'map_pin' });

  /**
   * The pin is the source of truth for coordinates; the text fields are for humans. So a
   * placement prefills the address, pincode and city, and leaves them editable, because an
   * owner's own wording beats any geocoder's for a customer looking for the gate. As on the
   * web, only the address is kept when already filled.
   */
  const handlePick = (picked: PickedLocation) => {
    setPin(picked);
    const next = prefillFromPin({ address, pincode, city }, picked);
    setAddress(next.address);
    setPincode(next.pincode);
    setCity(next.city);
  };

  const handleContinue = async () => {
    const problem = step2Problem({ hasPin: Boolean(pin), pincode });
    if (problem || !pin) {
      toast.error(problem ?? 'Set your garage location on the map');
      return;
    }
    setLoading(true);
    // Once the garage exists these steps count as done and the gate would send its owner home.
    onboardingHold.set(true);
    try {
      writeDraft({ address, pincode, city, mapsUrl, lat: pin.lat, lng: pin.lng, geoSource: pin.source });
      const draft = draftData(useOnboardingDraft.getState());
      // A retry after the garage was made but could not be opened must not make a second one.
      let vendorId = draft.vendorId;
      if (!vendorId) {
        vendorId = (await createVendor(createVendorBody({ ...draft, lat: pin.lat, lng: pin.lng }))).id;
        writeDraft({ vendorId });
      }
      // Steps 3 and 4 configure "the company I am acting as", so the new one has to be active
      // before they run: the requests carry its id.
      await useAuth.getState().reloadSession();
      if (!useAuth.getState().vendors.some((v) => v.id === vendorId)) {
        throw new Error('Your garage was saved, but it could not be opened yet. Tap Continue to try again.');
      }
      useAuth.getState().setActiveVendor(vendorId);
      router.replace(stepPath(3) as Href);
    } catch (err) {
      onboardingHold.set(false);
      toast.error(errorText(err, 'Failed to save. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell hasNav={false}>
      <OnboardingHeader
        step={2}
        title="Your garage location"
        onBack={() => (router.canGoBack() ? router.back() : router.replace(stepPath(1)))}
      />

      <View style={styles.section}>
        <SectionTitle
          title="Pin your garage"
          subtitle="This is how customers find you and how we work out who is nearby, so place it exactly at your gate."
        />
        <LocationPicker value={pin ? { lat: pin.lat, lng: pin.lng } : null} onChange={handlePick} expectedCity={city} />
      </View>

      <ScCard style={styles.card}>
        <ScTextarea
          label="Full address"
          rows={3}
          textContentType="fullStreetAddress"
          value={address}
          onChangeText={setAddress}
        />
        <ScInput label="City" value={city} onChangeText={setCity} />
        <ScInput
          label="Pincode"
          numeric
          keyboardType="number-pad"
          placeholder="600001"
          value={pincode}
          onChangeText={(text) => setPincode(digitsOnly(text, 6))}
        />
        <ScInput
          label="Google Maps link (optional)"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://maps.app.goo.gl/…"
          value={mapsUrl}
          onChangeText={setMapsUrl}
        />
      </ScCard>

      <ScButton
        variant="main"
        size="lg"
        style={styles.continue}
        disabled={!step2Ready({ hasPin: Boolean(pin), address, city, pincode }) || loading}
        onPress={() => void handleContinue()}
      >
        Continue
      </ScButton>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  card: { gap: 16 },
  continue: { marginTop: 'auto', marginBottom: 16 },
});
