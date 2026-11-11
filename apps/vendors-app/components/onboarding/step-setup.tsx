import { DEFAULT_DOORSTEP_RADIUS_KM, DOORSTEP_RADIUS_PLACEHOLDER } from '@repo/core/doorstep';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppShell } from '@/components/app-shell';
import { ScButton } from '@repo/native-ui/button';
import { Chip } from '@repo/native-ui/chip';
import { TimeField } from '@/components/form-controls';
import { ScInput } from '@repo/native-ui/inputs';
import { ScCard } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import { errorText } from '@/lib/error-text';
import { useOnboardingDraft, writeDraft } from '@/lib/onboarding-draft';
import {
  baysProblem,
  DAYS,
  jobsProblem,
  MAX_BAYS,
  MAX_RADIUS_KM,
  MIN_RADIUS_KM,
  radiusProblem,
  type ServiceMode,
  SLOT_INTERVALS,
  step3JobTypes,
  step3Problem,
  step3Settings,
  stepPath,
  toggleDay,
} from '@/lib/onboarding-logic';
import { decimalOnly, digitsOnly } from '@/lib/settings-logic';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { PRESSED_SCALE } from '@repo/native-ui/tokens';
import { setWorkingHoursForDays, updateSlotInterval, updateVendorJobTypes, updateVendorSettings } from '@/lib/vendor-api';
import { getMyVendor } from '@/lib/garage-api';
import { TravelChoiceField } from '@/components/travel-choice';

import { OnboardingHeader, SectionTitle, useDraftSync } from './parts';
import { fill, msg, useT } from '@repo/core/i18n';

const MODES: { value: ServiceMode; label: string }[] = [
  { value: 'garage', label: msg('They come to my garage') },
  { value: 'doorstep', label: msg('I also go to them') },
];

/** Step 3: Garage setup (apps/vendors/app/onboarding/step-3/page.tsx). Acts on the garage step 2 made. */
export function StepSetup() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const saved = useOnboardingDraft.getState();
  const [slotInterval, setSlotInterval] = useState<30 | 45 | 60>(saved.slotInterval);
  const [openTime, setOpenTime] = useState(saved.openTime);
  const [closeTime, setCloseTime] = useState(saved.closeTime);
  const [workingDays, setWorkingDays] = useState<number[]>(saved.workingDays);
  // "How do customers get serviced?" The distance is optional: left empty, the garage covers
  // the default 10 km from its pin.
  const [mode, setMode] = useState<ServiceMode>(saved.doorstep ? 'doorstep' : 'garage');
  const [radiusKm, setRadiusKm] = useState(saved.doorstepRadiusKm);
  // "All over <city>" (0069): offered once the garage step 2 made has a pin inside a city, which
  // GET /vendors/me says, as the portal's step 3 does.
  const [wholeCity, setWholeCity] = useState(saved.doorstepWholeCity === true);
  const [cityName, setCityName] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    getMyVendor()
      .then((garage) => live && setCityName(garage.garageCity?.name ?? null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const [bays, setBays] = useState(saved.bays);
  const [jobsPerDay, setJobsPerDay] = useState(saved.jobsPerDay);
  const [loading, setLoading] = useState(false);

  const doorstep = mode === 'doorstep';
  const allOver = doorstep && wholeCity && cityName !== null;
  useDraftSync({ slotInterval, openTime, closeTime, workingDays, doorstep, doorstepRadiusKm: radiusKm, doorstepWholeCity: wholeCity, bays, jobsPerDay });

  // All over the city takes no number, so a half-typed one never holds Continue.
  const radiusError = allOver ? null : radiusProblem(doorstep, radiusKm);
  const baysError = baysProblem(bays);
  const jobsError = jobsProblem(jobsPerDay);
  const blocked =
    step3Problem({ doorstep, doorstepRadiusKm: allOver ? '' : radiusKm, bays, jobsPerDay }) !== null;

  const handleContinue = async () => {
    if (blocked) return;
    setLoading(true);
    try {
      const form = { doorstep, doorstepRadiusKm: radiusKm, doorstepWholeCity: allOver, bays, jobsPerDay };
      writeDraft({ slotInterval, openTime, closeTime, workingDays, ...form });
      const settings = step3Settings(form);
      // The same four calls, together, as submitVendorOnboarding(3).
      await Promise.all([
        updateVendorJobTypes(step3JobTypes(form)),
        updateSlotInterval(slotInterval),
        setWorkingHoursForDays(workingDays, openTime, closeTime),
        ...(settings ? [updateVendorSettings(settings)] : []),
      ]);
      router.push(stepPath(4));
    } catch (err) {
      toast.error(errorText(err, t('Failed to save. Please try again.')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell hasNav={false}>
      <OnboardingHeader
        step={3}
        title={t('Garage setup')}
        subtitle={t('When you work, and how many cars you can take.')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace(stepPath(2)))}
      />

      <View style={styles.section}>
        <SectionTitle title={t('Slot interval')} subtitle={t('How far apart the start times customers can pick are.')} />
        <View style={styles.row}>
          {SLOT_INTERVALS.map((mins) => (
            <Chip key={mins} label={`${mins} min`} selected={slotInterval === mins} onPress={() => setSlotInterval(mins)} />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <SectionTitle title={t('Working days')} />
        <View style={styles.wrap}>
          {DAYS.map((label, day) => (
            <Chip
              key={label}
              label={label}
              selected={workingDays.includes(day)}
              onPress={() => setWorkingDays((days) => toggleDay(days, day))}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <SectionTitle
          title={t('Working hours')}
          subtitle={t('Applied to every working day. You can set each day in Settings later.')}
        />
        <View style={styles.row}>
          <View style={styles.half}>
            <TimeField label={t('Open time')} value={openTime} onChange={setOpenTime} />
          </View>
          <View style={styles.half}>
            <TimeField label={t('Close time')} value={closeTime} onChange={setCloseTime} />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <SectionTitle title={t('How do customers get serviced?')} />
        {/* Two radios rather than chips: exactly one answer is always true, and the doorstep one
            carries its own distance. */}
        <View accessibilityRole="radiogroup" style={styles.radios}>
          {MODES.map((option) => {
            const on = mode === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => setMode(option.value)}
                style={({ pressed }) => [
                  styles.radio,
                  on ? styles.radioOn : styles.radioOff,
                  pressed && { transform: [{ scale: PRESSED_SCALE }] },
                ]}
              >
                <View style={[styles.dot, { borderColor: on ? colors.textPrimary : colors.textMuted }]}>
                  {on ? <View style={styles.dotFill} /> : null}
                </View>
                <T size={13} color={on ? colors.textPrimary : colors.textSecondary}>
                  {t(option.label)}
                </T>
              </Pressable>
            );
          })}
        </View>
        {doorstep ? (
          <TravelChoiceField
            label={t('How far you go')}
            wholeCity={wholeCity}
            onChange={setWholeCity}
            cityName={cityName}
            radiusKm={radiusKm.trim() && Number.isFinite(Number(radiusKm)) ? Number(radiusKm) : null}
            defaultKm={DEFAULT_DOORSTEP_RADIUS_KM}
            wholeCityNote={(city) => t('You go to any address in {city}.', { city })}
          />
        ) : null}
        {doorstep && !allOver ? (
          <View>
            <ScInput
              label={t('Up to how many km from your garage?')}
              numeric
              keyboardType="number-pad"
              placeholder={DOORSTEP_RADIUS_PLACEHOLDER}
              accessibilityHint={t('From {min} to {max} kilometres', { min: MIN_RADIUS_KM, max: MAX_RADIUS_KM })}
              value={radiusKm}
              onChangeText={(text) => setRadiusKm(decimalOnly(text))}
            />
            {radiusError ? (
              <T accessibilityRole="alert" size={12} color={colors.warning} style={styles.below}>
                {radiusError}
              </T>
            ) : null}
            <T size={11} color={colors.textMuted} style={styles.below}>
              {fill(
                t(
                  "Optional. Leave it empty to use {km} km. Customers further away won't see you for doorstep jobs. You can draw an exact area later in Settings."
                ),
                {
                  km: (
                    <T size={11} num color={colors.textMuted}>
                      {DEFAULT_DOORSTEP_RADIUS_KM}
                    </T>
                  ),
                }
              )}
            </T>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <SectionTitle title={t('Capacity')} />
        <ScCard style={styles.capacity}>
          <ScInput
            label={t('How many cars can you work on at the same time?')}
            numeric
            keyboardType="number-pad"
            placeholder="1"
            accessibilityHint={t('From 1 to {max}', { max: MAX_BAYS })}
            value={bays}
            onChangeText={(text) => setBays(digitsOnly(text, 3))}
          />
          <ScInput
            label={t('Most jobs in a day (optional)')}
            numeric
            keyboardType="number-pad"
            placeholder={t('No limit')}
            value={jobsPerDay}
            onChangeText={(text) => setJobsPerDay(digitsOnly(text, 4))}
          />
          {baysError || jobsError ? (
            <T accessibilityRole="alert" size={12} color={colors.warning}>
              {baysError ?? jobsError}
            </T>
          ) : null}
          <T size={11} color={colors.textMuted}>
            {t('Customers are only offered times when you have room for one more car.')}
          </T>
        </ScCard>
      </View>

      <ScButton
        variant="main"
        size="lg"
        style={styles.continue}
        disabled={loading || blocked}
        onPress={() => void handleContinue()}
      >
        {t('Continue')}
      </ScButton>
    </AppShell>
  );
}

const useStyles = createStyles((colors) => ({
  section: { gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  half: { flex: 1 },
  radios: { gap: 8 },
  radio: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  radioOn: { borderColor: colors.outlineChosen, backgroundColor: colors.surfaceElevated },
  radioOff: { borderColor: colors.border, backgroundColor: colors.surface },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dotFill: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.chosenBg },
  below: { marginTop: 4 },
  capacity: { gap: 12 },
  continue: { marginTop: 'auto', marginBottom: 16 },
}));
