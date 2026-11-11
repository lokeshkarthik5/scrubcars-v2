import type { ApiVendorProfile, ApiWorkingHours } from '@repo/core/api/types';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ScButton } from '@repo/native-ui/button';
import { Chip } from '@repo/native-ui/chip';
import { TimeField } from '@/components/form-controls';
import { ScInput } from '@repo/native-ui/inputs';
import { ScCard } from '@repo/native-ui/primitives';
import { ScSwitch, SectionHeader } from '@/components/rows';
import { T } from '@repo/native-ui/text';
import {
  capacityFromVendor,
  capacityPayload,
  capacityProblem,
  DAYS,
  digitsOnly,
  mapWorkingHours,
  SLOT_INTERVALS,
  type WorkingHoursForm,
  workingHoursPayload,
} from '@/lib/settings-logic';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { setVendorWorkingHours, updateSlotInterval, updateVendorJobTypes, updateVendorSettings } from '@/lib/vendor-api';

import { PickupSection } from './pickup-section';
import { useSaving } from './use-saving';
import { msg, useT } from '@repo/core/i18n';

/**
 * Settings > Hours (apps/vendors/app/settings/page.tsx): weekly hours, slot interval,
 * capacity, job types, and Pickup & drop. `vendor` is null when the shell could not load
 * the garage; the sections that edit it are then left out, as on the web.
 */
export function HoursTab({
  vendor,
  hours,
  onVendorChange,
  onOpenLocation,
}: {
  vendor: ApiVendorProfile | null;
  hours: ApiWorkingHours[];
  onVendorChange: (vendor: ApiVendorProfile) => void;
  onOpenLocation: () => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [workingHours, setWorkingHours] = useState<WorkingHoursForm[]>(() => mapWorkingHours(hours));
  const [capacity, setCapacity] = useState(() =>
    capacityFromVendor(vendor ?? { bays: null, jobsPerDay: null })
  );
  const { saving, run } = useSaving();

  const setDay = (dayOfWeek: number, change: Partial<WorkingHoursForm>) =>
    setWorkingHours((current) => current.map((item) => (item.dayOfWeek === dayOfWeek ? { ...item, ...change } : item)));

  const saveWorkingHours = () =>
    run('working-hours', async () => {
      const updated = await setVendorWorkingHours(workingHoursPayload(workingHours));
      setWorkingHours(mapWorkingHours(updated));
    });

  const saveSlotInterval = (slotIntervalMins: 30 | 45 | 60) =>
    run('slot-interval', async () => {
      onVendorChange(await updateSlotInterval(slotIntervalMins));
    });

  const capacityError = capacityProblem(capacity.bays, capacity.jobsPerDay);
  const saveCapacity = () =>
    !capacityError &&
    run('capacity', async () => {
      onVendorChange(await updateVendorSettings(capacityPayload(capacity)));
    });

  // Doorstep turns on without asking how far first: the radius is optional, and a garage
  // that leaves it empty covers the default 10 km from its pin (set under Location).
  const saveJobType = (field: 'dropinEnabled' | 'doorstepEnabled', value: boolean) =>
    run(`job-type-${field}`, async () => {
      onVendorChange(await updateVendorJobTypes({ [field]: value }));
    });

  return (
    <>
      <View style={styles.section}>
        <SectionHeader title={t('Working hours')} />
        <View style={styles.rows}>
          {workingHours.map((day) => (
            <ScCard key={day.dayOfWeek} style={styles.dayCard}>
              <T size={13} weight={500} color={day.isClosed ? colors.textMuted : colors.textPrimary} style={styles.dayName}>
                {DAYS[day.dayOfWeek]}
              </T>
              <View style={styles.time}>
                <TimeField
                  value={day.openTime}
                  disabled={day.isClosed}
                  onChange={(openTime) => setDay(day.dayOfWeek, { openTime })}
                />
              </View>
              <View style={styles.time}>
                <TimeField
                  value={day.closeTime}
                  disabled={day.isClosed}
                  onChange={(closeTime) => setDay(day.dayOfWeek, { closeTime })}
                />
              </View>
              {/* Says what the day is, and is pressed when it is closed. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('{day} closed all day', { day: DAYS[day.dayOfWeek]! })}
                accessibilityState={{ selected: day.isClosed }}
                onPress={() => setDay(day.dayOfWeek, { isClosed: !day.isClosed })}
                style={[styles.toggle, day.isClosed && styles.toggleOn]}
              >
                <T
                  size={14}
                  weight={500}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  color={day.isClosed ? colors.textPrimary : colors.textSecondary}
                >
                  {day.isClosed ? t('Closed') : t('Open')}
                </T>
              </Pressable>
            </ScCard>
          ))}
          <ScButton variant="main" size="lg" disabled={saving === 'working-hours'} onPress={() => void saveWorkingHours()}>
            {saving === 'working-hours' ? t('Saving...') : t('Save working hours')}
          </ScButton>
        </View>
      </View>

      {vendor ? (
        <View style={styles.section}>
          <View>
            <SectionHeader title={t('Slot interval')} />
            <T size={12} color={colors.textSecondary} style={styles.subtitle}>
              {t('How far apart the start times customers can pick are.')}
            </T>
          </View>
          <ScCard>
            <View style={styles.chips}>
              {SLOT_INTERVALS.map((interval) => (
                <Chip
                  key={interval}
                  label={`${interval} min`}
                  selected={vendor.slotIntervalMins === interval}
                  disabled={saving === 'slot-interval'}
                  onPress={() => void saveSlotInterval(interval)}
                />
              ))}
            </View>
          </ScCard>
        </View>
      ) : null}

      {vendor ? (
        <View style={styles.section}>
          <SectionHeader title={t('Capacity')} />
          <ScCard style={styles.section}>
            <ScInput
              label={t('How many cars can you work on at the same time?')}
              numeric
              keyboardType="number-pad"
              maxLength={2}
              value={capacity.bays}
              onChangeText={(text) => setCapacity({ ...capacity, bays: digitsOnly(text, 2) })}
            />
            <ScInput
              label={t('Most jobs in a day (optional)')}
              numeric
              keyboardType="number-pad"
              maxLength={3}
              placeholder={t('No limit')}
              value={capacity.jobsPerDay}
              onChangeText={(text) => setCapacity({ ...capacity, jobsPerDay: digitsOnly(text, 3) })}
            />
            {/* What the numbers do, in one line: customers are only offered a time when a car can go in. */}
            <T size={11} color={colors.textMuted}>
              {t('Customers are only offered times when you have room for one more car. Leave the daily limit blank for no limit.')}
            </T>
            {capacityError ? (
              <T accessibilityRole="alert" size={12} color={colors.warning}>
                {capacityError}
              </T>
            ) : null}
            {/* Secondary: "Save working hours" above is this tab's main action. */}
            <ScButton variant="outline" disabled={!!capacityError || saving === 'capacity'} onPress={() => void saveCapacity()}>
              {saving === 'capacity' ? t('Saving...') : t('Save capacity')}
            </ScButton>
          </ScCard>
        </View>
      ) : null}

      {vendor ? (
        <View style={styles.section}>
          <SectionHeader title={t('Job types')} />
          <ScCard style={styles.section}>
            {(
              [
                { field: 'dropinEnabled', label: msg('Drop In'), description: msg('Customers visit your garage') },
                { field: 'doorstepEnabled', label: msg('Doorstep'), description: msg('You travel to the customer') },
              ] as const
            ).map(({ field, label, description }) => {
              const enabled = vendor[field];
              return (
                <View key={field} style={styles.part}>
                  <View style={styles.switchRow}>
                    <View style={styles.flex}>
                      <T size={13} weight={500}>
                        {t(label)}
                      </T>
                      <T size={11} color={colors.textSecondary}>
                        {t(description)}
                      </T>
                    </View>
                    {/* Saves the moment it is tapped. */}
                    <ScSwitch
                      label={t(label)}
                      checked={enabled}
                      disabled={saving === `job-type-${field}`}
                      onChange={(next) => void saveJobType(field, next)}
                    />
                  </View>
                  {/* Doorstep is measured from the garage's pin, so an unpinned garage is left off the
                      Doorstep list and cannot be booked there. */}
                  {field === 'doorstepEnabled' && enabled && vendor.lat === null ? (
                    <View style={styles.pinNote}>
                      <T accessibilityRole="alert" size={12} color={colors.warning}>
                        {t("Customers can't find you for doorstep jobs until your garage is pinned.")}
                      </T>
                      <Pressable accessibilityRole="link" onPress={onOpenLocation} style={styles.pinLink}>
                        <T size={12} weight={500} style={styles.underline}>
                          {t('Pin it under Location')}
                        </T>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScCard>
        </View>
      ) : null}

      {vendor ? <PickupSection key={vendor.id} vendor={vendor} onChange={onVendorChange} /> : null}
    </>
  );
}

const useStyles = createStyles((colors) => ({
  flex: { flex: 1, minWidth: 0 },
  section: { gap: 12 },
  part: { gap: 4 },
  rows: { gap: 8 },
  subtitle: { marginTop: 2 },
  dayCard: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  dayName: { width: 36 },
  time: { flex: 1, minWidth: 0 },
  // 64 wide, as the web's; up to 92 for Tamil's longer word, which also shrinks a little to fit.
  toggle: {
    minHeight: 48,
    minWidth: 64,
    maxWidth: 92,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleOn: { borderColor: colors.textSecondary, backgroundColor: colors.surfaceElevated },
  chips: { flexDirection: 'row', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  pinNote: { alignItems: 'flex-start' },
  pinLink: { minHeight: 44, justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
}));
