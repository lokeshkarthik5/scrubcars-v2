import { useNow } from '@repo/core/hooks/use-now';
import { formatCountdown, otpDeadlines, otpErrorMessage, retryAt as retryMoment, secondsUntil } from '@repo/core/otp';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthStage } from '@/components/auth-stage';
import { Label, ScButton } from '@/components/button';
import { IconAlertCircle } from '@/components/icons';
import { OtpInput } from '@/components/inputs';
import { T } from '@/components/text';
import { useAuth } from '@/lib/auth';
import { otpFlow } from '@/lib/otp-flow';
import { session } from '@/lib/session';
import { colors } from '@/lib/theme';

function formatPhone(phone: string) {
  if (phone.length !== 10) return `+91 ${phone}`;
  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
}

/** PhoneVerify (packages/ui/src/auth/phone-verify.tsx), as apps/vendors words it. */
export default function VerifyOtpScreen() {
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
  const back = () => (router.canGoBack() ? router.back() : router.replace('/login' as Href));

  const verify = async () => {
    if (!phone || otp.length !== 6) return;
    setLoading(true);
    setError('');
    try {
      const data = await session.signIn({
        phone,
        otp,
        purpose,
        ...(purpose === 'login' ? {} : { name: 'Vendor' }),
      });
      otpFlow.set(null);
      // The session gate takes it from here: Home, or setting up a first garage.
      useAuth.getState().applySession(data);
    } catch (err) {
      setError(otpErrorMessage(err, 'Verification failed'));
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <AuthStage onBack={back}>
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
          <OtpInput onChange={setOtp} />
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
          accessibilityState={{ disabled: resendSeconds > 0 || resending }}
          disabled={resendSeconds > 0 || resending}
          onPress={() => void resend()}
          style={styles.resend}
        >
          {(() => {
            const off = resendSeconds > 0 || resending;
            const color = off ? colors.textMuted : colors.textPrimary;
            return (
              <T size={13} weight={600} lh={18} color={color} style={off ? undefined : styles.underline}>
                {resending ? (
                  'Sending...'
                ) : resendSeconds > 0 ? (
                  <>
                    {'Resend OTP in '}
                    <T num size={13} weight={600} lh={18} color={color}>
                      {formatCountdown(resendSeconds)}
                    </T>
                  </>
                ) : (
                  'Resend OTP'
                )}
              </T>
            );
          })()}
        </Pressable>
        <View style={styles.verify}>
          <ScButton variant="cta" glass disabled={disabled} onPress={() => void verify()}>
            <Label color={disabled ? colors.textSecondary : colors.brandWhite}>
              {loading ? 'Verifying...' : 'Verify'}
            </Label>
          </ScButton>
        </View>
      </View>
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
