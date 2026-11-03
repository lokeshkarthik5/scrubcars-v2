import { createService } from '@repo/core/api/services';
import { SERVICE_CATEGORY_OPTIONS } from '@repo/core/categories';
import { PRICING_TYPES } from '@repo/core/pricing';
import type { PricingType, ServiceCategory } from '@repo/core/types';
import { VEHICLE_TIERS, VENDOR_VEHICLE_TYPE_OPTIONS } from '@repo/core/vehicles';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppShell } from '@/components/app-shell';
import { Chip } from '@repo/native-ui/chip';
import { IconAlertCircle, IconCircleCheck } from '@repo/native-ui/icons';
import { ScInput } from '@repo/native-ui/inputs';
import { ScCard } from '@repo/native-ui/primitives';
import { RectButton } from '@/components/rect-button';
import { T } from '@repo/native-ui/text';
import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/error-text';
import { closeDraft, useOnboardingDraft, writeDraft } from '@/lib/onboarding-draft';
import {
  addedText,
  DURATIONS,
  EMPTY_TIERS,
  type ServiceFormInput,
  serviceBody,
  SERVICE_PRESETS,
  serviceReady,
  stepPath,
  toggleVehicleType,
} from '@/lib/onboarding-logic';
import { decimalOnly } from '@/lib/settings-logic';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { updateVendorSettings } from '@/lib/vendor-api';

import { FieldLabel, OnboardingHeader, SectionTitle } from './parts';

/** Step 4: Services and vehicles, the last step (apps/vendors/app/onboarding/step-4/page.tsx). */
export function StepServices() {
  const colors = useColors();
  const styles = useStyles();
  const [vehicleTypes, setVehicleTypes] = useState<string[]>(useOnboardingDraft.getState().vehicleTypes);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ServiceCategory>('car_wash');
  const [pricingType, setPricingType] = useState<PricingType>('flat');
  const [price, setPrice] = useState('');
  // Per-vehicle tiers. All three are required by the server, since the booking charge reads the
  // tier matching the customer's vehicle.
  const [tiers, setTiers] = useState(EMPTY_TIERS);
  const [duration, setDuration] = useState(30);
  const [addedCount, setAddedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form: ServiceFormInput = { name, category, pricingType, price, tiers, duration };

  const toggleType = (type: string) => {
    const next = toggleVehicleType(vehicleTypes, type);
    setVehicleTypes(next);
    writeDraft({ vehicleTypes: next });
  };

  const handleAddService = async () => {
    if (!serviceReady(form)) return;
    setLoading(true);
    setError(null);
    try {
      await createService(serviceBody(form));
      setAddedCount((count) => count + 1);
      setName('');
      setPrice('');
      setTiers(EMPTY_TIERS);
    } catch (err) {
      setError(errorText(err, 'Failed to add service'));
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = async () => {
    setFinishing(true);
    setError(null);
    try {
      if (vehicleTypes.length) await updateVendorSettings({ vehicleTypes });
      await useAuth.getState().reloadSession();
      closeDraft();
      router.replace('/home');
    } catch (err) {
      setError(errorText(err, 'Failed to finish onboarding'));
    } finally {
      setFinishing(false);
    }
  };

  const pricing = PRICING_TYPES.find((pt) => pt.value === pricingType);

  return (
    <AppShell hasNav={false}>
      <OnboardingHeader
        step={4}
        title="Services & vehicles"
        subtitle="Add what you sell. You can add more, and packages, in Services later."
        onBack={() => (router.canGoBack() ? router.back() : router.replace(stepPath(3)))}
      />

      <View style={styles.section}>
        <SectionTitle
          title="Quick add a common service"
          subtitle="Tap a preset or type a custom name below, then set price & duration."
        />
        <View style={styles.wrap}>
          {SERVICE_PRESETS.map((preset) => (
            <Chip
              key={preset.name}
              label={preset.name}
              selected={name === preset.name}
              onPress={() => {
                setName(preset.name);
                setCategory(preset.category);
              }}
            />
          ))}
        </View>
      </View>

      <ScCard style={styles.card}>
        <ScInput label="Service name" value={name} onChangeText={setName} />

        <View style={styles.group}>
          <FieldLabel>Category</FieldLabel>
          <View style={styles.wrap}>
            {SERVICE_CATEGORY_OPTIONS.map((c) => (
              <Chip key={c.value} label={c.label} selected={category === c.value} onPress={() => setCategory(c.value)} />
            ))}
          </View>
        </View>

        <View style={styles.group}>
          <FieldLabel>Pricing</FieldLabel>
          <View style={styles.wrap}>
            {PRICING_TYPES.map((pt) => (
              <Chip key={pt.value} label={pt.label} selected={pricingType === pt.value} onPress={() => setPricingType(pt.value)} />
            ))}
          </View>
          <T size={11} color={colors.textMuted}>
            {pricing?.hint}
          </T>
        </View>

        {pricingType === 'per_vehicle' ? (
          <View style={styles.tierRow}>
            {VEHICLE_TIERS.map(({ value, label }) => (
              <View key={value} style={styles.tier}>
                <ScInput
                  label={`${label} (₹)`}
                  numeric
                  keyboardType="decimal-pad"
                  value={tiers[value]}
                  onChangeText={(text) => setTiers((prev) => ({ ...prev, [value]: decimalOnly(text) }))}
                />
              </View>
            ))}
          </View>
        ) : (
          <ScInput
            label={pricingType === 'on_inspection' ? 'Inspection fee (₹)' : 'Price (₹)'}
            numeric
            keyboardType="decimal-pad"
            value={price}
            onChangeText={(text) => setPrice(decimalOnly(text))}
          />
        )}

        <View style={styles.group}>
          <FieldLabel>Duration</FieldLabel>
          <View style={styles.wrap}>
            {DURATIONS.map((d) => (
              <Chip key={d} label={`${d} min`} selected={duration === d} onPress={() => setDuration(d)} />
            ))}
          </View>
        </View>

        {/* One red at a time: adding a service is the step's main action until one is added, and
            then Go to dashboard is. */}
        <RectButton
          tone={addedCount === 0 ? 'primary' : 'secondary'}
          disabled={!serviceReady(form) || loading}
          onPress={() => void handleAddService()}
        >
          {loading ? 'Adding...' : 'Add service'}
        </RectButton>

        {addedCount > 0 ? (
          <View style={styles.added} accessibilityLiveRegion="polite">
            <IconCircleCheck size={14} color={colors.success} />
            <T size={12} color={colors.textSecondary}>
              {addedText(addedCount)}
            </T>
          </View>
        ) : null}
      </ScCard>

      <View style={styles.section}>
        <SectionTitle
          title="Vehicle types handled"
          subtitle="These are the vehicle types customers can book for, and the tiers you price against when a service uses per-vehicle pricing."
        />
        <View style={styles.wrap}>
          {VENDOR_VEHICLE_TYPE_OPTIONS.map((type) => (
            <Chip key={type} label={type} selected={vehicleTypes.includes(type)} onPress={() => toggleType(type)} />
          ))}
        </View>
      </View>

      {/* Amber, as errors are: red on this step is its main button. */}
      {error ? (
        <View accessibilityRole="alert" style={styles.error}>
          <View style={styles.errorIcon}>
            <IconAlertCircle size={14} color={colors.error} />
          </View>
          <T size={12} color={colors.error} style={styles.flex}>
            {error}
          </T>
        </View>
      ) : null}

      <View style={styles.footer}>
        <RectButton tone={addedCount === 0 ? 'secondary' : 'primary'} disabled={finishing} onPress={() => void handleFinish()}>
          {finishing ? 'Opening dashboard...' : 'Go to dashboard'}
        </RectButton>
      </View>
    </AppShell>
  );
}

const useStyles = createStyles(() => ({
  flex: { flex: 1, minWidth: 0 },
  section: { gap: 12 },
  card: { gap: 16 },
  group: { gap: 6 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tierRow: { flexDirection: 'row', gap: 8 },
  tier: { flex: 1, minWidth: 0 },
  added: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  error: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  errorIcon: { marginTop: 3 },
  footer: { marginTop: 'auto', paddingBottom: 16 },
}));
