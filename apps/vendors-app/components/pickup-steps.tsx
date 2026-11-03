import { markDelivered } from '@repo/core/api/bookings';
import { ApiError } from '@repo/core/api/client';
import { photoGateMessage } from '@repo/core/job-photo-standards';
import { handoverLocked, MAX_CODE_ATTEMPTS, PICKUP_STEP_LABELS, type PickupNext } from '@repo/core/pickup';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_TEL_HREF } from '@repo/core/support';
import type { Booking } from '@repo/core/types';
import { useState } from 'react';
import { View } from 'react-native';

import { changeStatusWithUndo } from '@/lib/deferred-status';
import { openLink } from '@/lib/open-link';
import { createStyles, useColors } from '@repo/native-ui/theme';

import { ScButton } from '@repo/native-ui/button';
import { ScInput } from '@repo/native-ui/inputs';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import { errorText } from '@/lib/error-text';

const STEP_HINTS: Record<PickupNext, string> = {
  picked_up:
    "Ask the customer for the 4-digit pickup code in their Detlio app. From now until the car is back, it's in your care.",
  at_garage: 'Press when the car arrives at your garage.',
  start_work: 'Start the work on the car.',
  out_for_delivery: 'Press when the work is done and the car leaves to go back to the customer.',
  delivered: 'Ask the customer for the 4-digit delivery code in their Detlio app. This finishes the job.',
};

/**
 * PickupSteps: the one thing the job waits for, as the server says. The code the
 * customer reads out stays in this screen's state and the Undo queue's memory; it
 * is never stored or logged.
 */
export function PickupSteps({
  booking,
  onStartWork,
  onChanged,
}: {
  booking: Booking;
  onStartWork: () => void;
  onChanged: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const step = booking.pickup?.nextStep ?? null;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [lockedStep, setLockedStep] = useState<PickupNext | null>(null);

  if (!step) return null;

  const needsCode = step === 'picked_up' || step === 'delivered';
  const triesLeft = step === 'picked_up' ? booking.pickup?.pickupCodeTriesLeft : booking.pickup?.deliveryCodeTriesLeft;
  const outOfTries = handoverLocked(step, lockedStep, triesLeft);
  const who = booking.customerName ?? 'this customer';
  const photoBlock =
    step === 'start_work'
      ? (booking.photoStandard?.startBlocked ?? null)
      : step === 'out_for_delivery' || step === 'delivered'
        ? (booking.photoStandard?.finishBlocked ?? null)
        : null;

  const run = async () => {
    if (step === 'picked_up' || step === 'at_garage' || step === 'out_for_delivery') {
      changeStatusWithUndo(booking.id, step, step === 'picked_up' ? code : undefined);
      setCode('');
      return;
    }
    setBusy(true);
    try {
      if (step === 'delivered') await markDelivered(booking.id, code);
      else onStartWork();
      setCode('');
      if (step !== 'start_work') toast.success(`${PICKUP_STEP_LABELS[step]} marked`);
      onChanged();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'HANDOVER_CODE_LOCKED') setLockedStep(step);
      toast.error(errorText(error, 'Could not update this booking'));
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.column}>
      {needsCode && !outOfTries ? (
        <ScInput
          label={step === 'picked_up' ? "Customer's pickup code" : "Customer's delivery code"}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          placeholder="4 digits"
          numeric
          style={styles.code}
          value={code}
          onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 4))}
        />
      ) : null}

      {outOfTries ? (
        <T accessibilityRole="alert" size={14} color={colors.warning}>
          {'Too many wrong codes. Call Detlio support on '}
          <T
            accessibilityRole="link"
            num
            size={14}
            color={colors.warning}
            style={styles.underline}
            onPress={() => openLink(SUPPORT_TEL_HREF)}
          >
            {SUPPORT_PHONE_DISPLAY}
          </T>
          : we can confirm the handover once we have spoken to the customer.
        </T>
      ) : (
        <>
          {photoBlock ? (
            <T size={15} color={colors.warning}>
              {photoGateMessage(photoBlock)}
            </T>
          ) : null}
          <ScButton
            variant="main"
            size="lg"
            accessibilityLabel={step === 'start_work' ? `Start job for ${who}` : `Mark ${PICKUP_STEP_LABELS[step]} for ${who}`}
            disabled={busy || (needsCode && code.length !== 4) || photoBlock !== null}
            onPress={() => void run()}
          >
            {busy ? 'Saving...' : step === 'start_work' ? 'Start job' : PICKUP_STEP_LABELS[step]}
          </ScButton>
          <T size={13} color={colors.textSecondary}>
            {STEP_HINTS[step]}
            {needsCode && triesLeft !== undefined && triesLeft < MAX_CODE_ATTEMPTS ? (
              <>
                {' '}
                <T num size={13} color={colors.textSecondary}>
                  {triesLeft}
                </T>
                {` ${triesLeft === 1 ? 'try' : 'tries'} left.`}
              </>
            ) : null}
          </T>
        </>
      )}
    </View>
  );
}

const useStyles = createStyles(() => ({
  column: { gap: 8 },
  code: { letterSpacing: 4, fontSize: 16 },
  underline: { textDecorationLine: 'underline' },
}));
