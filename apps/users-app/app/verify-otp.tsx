import { useNow } from '@repo/core/hooks/use-now';
import { formatCountdown, otpDeadlines, otpErrorMessage, retryAt as retryMoment, secondsUntil } from '@repo/core/otp';
import { AuthStage } from '@repo/native-ui/auth-stage';
import { Label, ScButton } from '@repo/native-ui/button';
import { IconAlertCircle } from '@repo/native-ui/icons';
import { OtpInput } from '@repo/native-ui/inputs';
import { T } from '@repo/native-ui/text';
import { useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { otpFlow } from '@/lib/otp-flow';
import { session } from '@/lib/session';

function formatPhone(phone: string) {
  if (phone.length !== 10) return `+91 ${phone}`;
  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
}

function Body() {
  const colors = useColors();
  const flow = otpFlow.get();
  const phone = flow?.phone ?? '';
  const purpose = flow?.purpose ?? 'login';
  const [expiresAt, setExpiresAt] = useState<number | null>(flow?.expiresAt ?? null);
  const [resendAt, setResendAt] = useState<number | null>(flow?.resendAt ?? null);
  const now = useNow(1000);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [otp, setOtp] = useState('');

  const expirySeconds = expiresAt ? secondsUntil(expiresAt, now) : null;
  const resendSeconds = resendAt ? secondsUntil(resendAt, now) : 0;

  const verify = async () => {
    if (!phone || otp.length !== 6 || loading) return;
    setLoading(true);
    setError('');
    try {
      const data = await session.signIn({
        phone,
        otp,
        purpose,
        // A sign-up: the placeholder name, until profile setup asks.
        ...(purpose === 'login' ? {} : { name: 'User' }),
      });
      otpFlow.set(null);
      // The session gate takes it from here.
      useAuth.getState().applySession(data);
    } catch (err) {
      setError(otpErrorMessage(err, 'Verification failed'));
    } finally {
      setLoading(false);
    }
  };

  // Verify auto-submits on the sixth digit, as the web's does.
  const submitted = useRef('');
  useEffect(() => {
    if (otp.length === 6 && submitted.current !== otp) {
      submitted.current = otp;
      void verify();
    }
    if (otp.length < 6) submitted.current = '';
    // verify closes over this render's otp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  const resend = async () => {
    if (resending || resendSeconds > 0) return;
    setResending(true);
    setError('');
    try {
      const sent = await session.sendCode(phone);
      const deadlines = otpDeadlines(Date.now(), sent.expiresInSeconds);
      setExpiresAt(deadlines.expiresAt);
      setResendAt(deadlines.resendAt);
    } catch (err) {
      setError(otpErrorMessage(err, 'Failed to resend OTP'));
      const at = retryMoment(err, Date.now());
      if (at) setResendAt(at);
    } finally {
      setResending(false);
    }
  };

  const disabled = loading || !phone || otp.length !== 6;
  const off = resendSeconds > 0 || resending;
  const resendColor = off ? colors.textMuted : colors.textPrimary;

  return (
    <View style={styles.center}>
      <T accessibilityRole="header" size={28} weight={700} lh={36} tracking={-0.02} align="center">
        Verify your number
      </T>
      <View style={styles.sent}>
        <T size={16} lh={24} color={colors.textSecondary} align="center">
          Enter the 6-digit code sent to
        </T>
        <T size={15} weight={600} align="center">
          {formatPhone(phone)}
        </T>
      </View>
      <View style={styles.boxes}>
        <OtpInput onChange={setOtp} invalid={Boolean(error)} />
      </View>
      {error ? (
        <View accessibilityRole="alert" style={styles.error}>
          <View style={styles.errorIcon}>
            <IconAlertCircle size={14} color={colors.error} />
          </View>
          <T size={12} color={colors.error} style={styles.errorText}>
            {error}
          </T>
        </View>
      ) : null}
      {expirySeconds !== null ? (
        <View style={styles.expiry}>
          {expirySeconds > 0 ? (
            <T size={12} color={colors.textSecondary}>
              {'Code expires in '}
              <T num size={12} weight={500}>
                {formatCountdown(expirySeconds)}
              </T>
            </T>
          ) : (
            <T accessibilityLiveRegion="polite" size={12} color={colors.textSecondary}>
              Code expired — resend
            </T>
          )}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: off }}
        disabled={off}
        onPress={() => void resend()}
        style={styles.resend}
      >
        <T size={13} weight={600} lh={18} color={resendColor} style={off ? undefined : styles.underline}>
          {resending ? (
            'Sending...'
          ) : resendSeconds > 0 ? (
            <>
              {'Resend OTP in '}
              <T num size={13} weight={600} lh={18} color={resendColor}>
                {formatCountdown(resendSeconds)}
              </T>
            </>
          ) : (
            'Resend OTP'
          )}
        </T>
      </Pressable>
      <View style={styles.verify}>
        <ScButton variant="cta" glass disabled={disabled} onPress={() => void verify()}>
          <Label color={disabled ? colors.textSecondary : colors.white}>{loading ? 'Verifying...' : 'Verify'}</Label>
        </ScButton>
      </View>
    </View>
  );
}

/** PhoneVerify (packages/ui/src/auth/phone-verify.tsx) as apps/users words it. Always dark. */
export default function VerifyOtpScreen() {
  return (
    <AuthStage onBack={() => (router.canGoBack() ? router.back() : router.replace('/login' as Href))}>
      <Body />
    </AuthStage>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
  sent: { paddingTop: 8 },
  boxes: { paddingTop: 28 },
  error: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingTop: 16, alignSelf: 'stretch' },
  errorIcon: { marginTop: 3 },
  errorText: { flex: 1 },
  expiry: { paddingTop: 24 },
  resend: { marginTop: 8, minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
  verify: { marginTop: 32, alignSelf: 'stretch' },
});
