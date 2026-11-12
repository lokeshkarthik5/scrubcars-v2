import type { ApiVendorClosure, ApiVendorProfile } from '@repo/core/api/types';
import type { Booking } from '@repo/core/types';
import { APP_TIMEZONE } from '@repo/core/utils';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ScButton } from '@repo/native-ui/button';
import { DateField } from '@/components/form-controls';
import { ScInput } from '@repo/native-ui/inputs';
import { Notice, ScCard } from '@repo/native-ui/primitives';
import { ScSwitch, SectionHeader } from '@/components/rows';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import { errorText } from '@/lib/error-text';
import { pauseBookings, resumeBookings } from '@/lib/garage-api';
import { bookingsSentence, closureWindow, formatDay, sortClosures } from '@/lib/settings-logic';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { addClosure, removeClosure } from '@/lib/vendor-api';
import { fill, msg, useT, useTn } from '@repo/core/i18n';

/**
 * Settings > Time off (apps/vendors/app/settings/time-off-section.tsx): Pause new
 * bookings, then Holidays.
 */
export function TimeOffTab({
  vendor,
  closures,
  closuresFailed,
  onVendorChange,
  onClosuresChange,
}: {
  vendor: ApiVendorProfile | null;
  closures: ApiVendorClosure[];
  closuresFailed: boolean;
  onVendorChange: (vendor: ApiVendorProfile) => void;
  onClosuresChange: (closures: ApiVendorClosure[]) => void;
}) {
  return (
    <>
      {vendor ? <PauseSection vendor={vendor} onChange={onVendorChange} /> : null}
      <HolidaysSection closures={closures} loadFailed={closuresFailed} onChange={onClosuresChange} />
    </>
  );
}

/**
 * "Pause new bookings": the garage drops out of the lists and checkout turns customers
 * away, while every booking it already has carries on. The reason comes before the
 * switch, because the switch acts the moment it is tapped. While paused the reason stays
 * editable: pausing again only rewrites it.
 */
export function PauseSection({
  vendor,
  onChange,
}: {
  vendor: ApiVendorProfile;
  onChange: (vendor: ApiVendorProfile) => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [reason, setReason] = useState(vendor.bookingsPausedReason ?? '');
  const [busy, setBusy] = useState(false);
  // `!=`, not `!==`: a server older than pausing sends no field at all, and that garage is not paused.
  const paused = vendor.bookingsPausedAt != null;
  const savedReason = vendor.bookingsPausedReason ?? '';

  const run = async (action: () => Promise<ApiVendorProfile>, done: string) => {
    setBusy(true);
    try {
      const updated = await action();
      onChange(updated);
      setReason(updated.bookingsPausedReason ?? '');
      toast.success(t(done));
    } catch (err) {
      toast.error(errorText(err, t('Something went wrong')));
    } finally {
      setBusy(false);
    }
  };

  const pause = () => run(() => pauseBookings(reason.trim() || undefined), msg('New bookings paused'));
  const toggle = () => (paused ? run(resumeBookings, msg('Taking bookings again')) : pause());

  return (
    <View style={styles.section}>
      <SectionHeader title={t('Pause new bookings')} />
      <ScCard style={styles.section}>
        <T size={11} color={colors.textSecondary}>
          {t("Customers can't book you while this is on. Bookings you already have stay as they are.")}
        </T>
        <ScInput
          label={t('Reason (optional, customers see this)')}
          placeholder={t('e.g. Closed for renovation')}
          maxLength={200}
          value={reason}
          onChangeText={setReason}
        />
        <View style={styles.switchRow}>
          <T size={13} weight={500}>
            {t('Pause new bookings')}
          </T>
          {/* Amber when on: a paused garage is a state to notice, not an action to take. */}
          <ScSwitch label={t('Pause new bookings')} tone="warning" checked={paused} disabled={busy} onChange={() => void toggle()} />
        </View>
        {paused ? (
          <>
            <T size={12}>
              {fill(t('Paused since {date}.'), {
                date: (
                  <T num size={12} weight={500}>
                    {new Date(vendor.bookingsPausedAt as string).toLocaleDateString('en-IN', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      timeZone: APP_TIMEZONE,
                    })}
                  </T>
                ),
              })}
              {savedReason ? (
                <T size={12} color={colors.textSecondary}>{` ${t('Customers see: “{reason}”', { reason: savedReason })}`}</T>
              ) : null}
            </T>
            <View style={styles.pauseActions}>
              {/* Pausing again keeps the original start and only rewrites the reason. */}
              <View style={styles.half}>
                <ScButton variant="outline" disabled={busy || reason.trim() === savedReason} onPress={() => void pause()}>
                  {t('Update reason')}
                </ScButton>
              </View>
              <View style={styles.half}>
                <ScButton variant="main" size="lg" disabled={busy} onPress={() => void toggle()}>
                  {busy ? t('Saving...') : t('Resume bookings')}
                </ScButton>
              </View>
            </View>
          </>
        ) : null}
      </ScCard>
    </View>
  );
}

/**
 * Single days off on top of the weekly hours. A holiday offers no times to customers;
 * bookings already on that day are left alone and listed, so the owner can call those
 * customers.
 */
export function HolidaysSection({
  closures,
  loadFailed = false,
  onChange,
}: {
  closures: ApiVendorClosure[];
  /** The list could not be read. Adding still works; the list is just unknown. */
  loadFailed?: boolean;
  onChange: (closures: ApiVendorClosure[]) => void;
}) {
  const t = useT();
  const tn = useTn();
  const colors = useColors();
  const styles = useStyles();
  const { min, max } = closureWindow();
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  // The bookings on the day just added, named so the owner knows whom to call.
  const [onThatDay, setOnThatDay] = useState<{ date: string; bookings: Booking[] } | null>(null);

  const add = async () => {
    if (!date) return;
    setBusy('add');
    try {
      const result = await addClosure({ date, ...(reason.trim() && { reason: reason.trim() }) });
      onChange(sortClosures([...closures, result.closure]));
      setOnThatDay(result.bookings.length > 0 ? { date: result.closure.date, bookings: result.bookings } : null);
      setDate('');
      setReason('');
      toast.success(t('Holiday added'));
    } catch (err) {
      toast.error(errorText(err, t('Something went wrong')));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (closure: ApiVendorClosure) => {
    setBusy(closure.id);
    try {
      await removeClosure(closure.id);
      onChange(closures.filter((c) => c.id !== closure.id));
      if (onThatDay?.date === closure.date) setOnThatDay(null);
      toast.success(t('Holiday removed'));
    } catch (err) {
      toast.error(errorText(err, t('Something went wrong')));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.section}>
      <SectionHeader title={t('Holidays')} />
      <ScCard style={styles.section}>
        <T size={12} color={colors.textSecondary}>
          {t("Days you're closed on top of your weekly hours. Customers can't pick them.")}
        </T>
        <DateField label={t('Date')} value={date} min={min} max={max} onChange={setDate} />
        <ScInput
          label={t('Reason (optional)')}
          placeholder={t('e.g. Diwali')}
          maxLength={200}
          value={reason}
          onChangeText={setReason}
        />
        {/* Secondary: while paused, Resume above is this tab's one main action. */}
        <ScButton variant="outline" disabled={!date || busy === 'add'} onPress={() => void add()}>
          {busy === 'add' ? t('Saving...') : t('Add holiday')}
        </ScButton>

        {onThatDay ? (
          <Notice title={bookingsSentence(onThatDay.bookings.length)}>
            {onThatDay.bookings.map((b) => `${b.customerName ?? t('Customer')} · ${b.scheduledAt}`).join('\n')}
          </Notice>
        ) : null}

        {loadFailed ? (
          <T accessibilityRole="alert" size={12} color={colors.warning}>
            {t("Couldn't load your holidays. Open Settings again to see them.")}
          </T>
        ) : null}

        {closures.length > 0 ? (
          <View>
            {closures.map((closure, index) => (
              <View key={closure.id} style={[styles.closure, index > 0 && styles.closureDivider]}>
                <View style={styles.flex}>
                  <T num size={13} weight={500}>
                    {formatDay(closure.date)}
                  </T>
                  {closure.reason ? (
                    <T size={11} color={colors.textSecondary} numberOfLines={1}>
                      {closure.reason}
                    </T>
                  ) : null}
                  {closure.activeBookingCount > 0 ? (
                    <T size={11} color={colors.warning}>
                      {fill(
                        tn(closure.activeBookingCount, '{num} booking still on this day', '{num} bookings still on this day'),
                        {
                          num: (
                            <T num size={11} color={colors.warning}>
                              {closure.activeBookingCount}
                            </T>
                          ),
                        }
                      )}
                    </T>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('Remove holiday on {date}', { date: formatDay(closure.date) })}
                  disabled={busy === closure.id}
                  onPress={() => void remove(closure)}
                  style={[styles.remove, busy === closure.id && { opacity: 0.5 }]}
                >
                  <T size={12} weight={500} color={colors.textSecondary}>
                    {t('Remove')}
                  </T>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </ScCard>
    </View>
  );
}

const useStyles = createStyles((colors) => ({
  flex: { flex: 1, minWidth: 0 },
  section: { gap: 12 },
  switchRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  pauseActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  half: { flex: 1, minWidth: 0 },
  closure: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  closureDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  remove: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
}));
