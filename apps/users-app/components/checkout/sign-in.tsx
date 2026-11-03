import type { OtpPurpose } from '@repo/core/api/types';
import { useNow } from '@repo/core/hooks/use-now';
import type { NativeOtpPurpose } from '@repo/core/native-session';
import { formatCountdown, otpDeadlines, otpErrorMessage, retryAt as retryMoment, secondsUntil } from '@repo/core/otp';
import { normaliseIndianMobile } from '@repo/core/phone';
import { ScButton } from '@repo/native-ui/button';
import { IconAlertCircle, IconCheck } from '@repo/native-ui/icons';
import { OtpInput, ScInput, ScPhoneInput } from '@repo/native-ui/inputs';
import { HubCard } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { session } from '@/lib/session';
import { track } from '@/lib/shims/analytics';

const OTP_LENGTH = 6;
const WEBSITE = 'https://detlio.com';

/**
 * useCheckoutSignIn (apps/users/components/checkout/checkout-sign-in.tsx): signing in where
 * the booking is, so nobody leaves it. A session it starts lands the same way as the login
 * screen's, through useAuth.
 */
export function useCheckoutSignIn() {
  const [phase, setPhase] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState<OtpPurpose | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [codeKey, setCodeKey] = useState(0);
  const phoneValid = /^\d{10}$/.test(phone);
  const isNew = purpose === 'register';
  const readyToVerify = phase === 'code' && otp.length === OTP_LENGTH && (!isNew || name.trim().length > 0);

  const changePhone = (value: string) => {
    setPhone(value);
    if (retryAt) {
      setRetryAt(null);
      setError('');
    }
  };

  const sendCode = async (): Promise<boolean> => {
    if (!phoneValid || sending) return false;
    setSending(true);
    setError('');
    try {
      const sent = await session.sendCode(phone);
      const deadlines = otpDeadlines(Date.now(), sent.expiresInSeconds);
      setPurpose(sent.purpose);
      setExpiresAt(deadlines.expiresAt);
      setResendAt(deadlines.resendAt);
      setOtp('');
      setCodeKey((k) => k + 1);
      setPhase('code');
      track('otp_sent');
      return true;
    } catch (err) {
      setError(otpErrorMessage(err, 'Failed to send the code'));
      setRetryAt(retryMoment(err, Date.now()));
      return false;
    } finally {
      setSending(false);
    }
  };

  const resend = async () => {
    if (!purpose || sending) return;
    setSending(true);
    setError('');
    try {
      const sent = await session.sendCode(phone);
      const deadlines = otpDeadlines(Date.now(), sent.expiresInSeconds);
      setExpiresAt(deadlines.expiresAt);
      setResendAt(deadlines.resendAt);
      setOtp('');
      setCodeKey((k) => k + 1);
    } catch (err) {
      setError(otpErrorMessage(err, 'Failed to resend the code'));
      const at = retryMoment(err, Date.now());
      if (at) setResendAt(at);
    } finally {
      setSending(false);
    }
  };

  const editNumber = () => {
    setPhase('phone');
    setOtp('');
    setError('');
  };

  const verify = async (): Promise<boolean> => {
    if (!readyToVerify || verifying || !purpose) return false;
    setVerifying(true);
    setError('');
    try {
      const data = await session.signIn({
        phone,
        otp,
        purpose: purpose as NativeOtpPurpose,
        ...(isNew ? { name: name.trim() } : {}),
      });
      useAuth.getState().applySession(data);
      return true;
    } catch (err) {
      setError(otpErrorMessage(err, 'Verification failed'));
      return false;
    } finally {
      setVerifying(false);
    }
  };

  return {
    phase,
    phone,
    changePhone,
    phoneValid,
    otp,
    setOtp,
    name,
    setName,
    isNew,
    sending,
    verifying,
    error,
    retryAt,
    expiresAt,
    resendAt,
    codeKey,
    readyToVerify,
    sendCode,
    resend,
    editNumber,
    verify,
  };
}

export type CheckoutSignIn = ReturnType<typeof useCheckoutSignIn>;

const formatPhone = (phone: string) => (phone.length === 10 ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : `+91 ${phone}`);

/** CheckoutSignInCard. */
export function CheckoutSignInCard({
  signIn,
  verifyLabel,
  onVerify,
  busy,
}: {
  signIn: CheckoutSignIn;
  verifyLabel: string;
  onVerify: () => void;
  busy: boolean;
}) {
  const colors = useColors();
  const styles = useStyles();
  const now = useNow(1000);
  const waitSeconds = signIn.retryAt ? secondsUntil(signIn.retryAt, now) : 0;
  const expirySeconds = signIn.expiresAt ? secondsUntil(signIn.expiresAt, now) : null;
  const resendSeconds = signIn.resendAt ? secondsUntil(signIn.resendAt, now) : 0;
  const shownError = signIn.retryAt && waitSeconds === 0 ? '' : signIn.error;
  return (
    <HubCard style={styles.card}>
      <View>
        <T size={17} weight={500} lh={24}>
          Your phone number
        </T>
        <T size={13} lh={18} color={colors.textSecondary} style={styles.sub}>
          For your booking updates. No password: we text you a code.
        </T>
      </View>
      {signIn.phase === 'phone' ? (
        <View style={styles.part}>
          <ScPhoneInput
            value={signIn.phone}
            onChange={signIn.changePhone}
            onSubmit={() => {
              if (waitSeconds === 0) void signIn.sendCode();
            }}
            normalise={normaliseIndianMobile}
          />
          <ScButton
            variant="outline"
            disabled={!signIn.phoneValid || signIn.sending || waitSeconds > 0}
            onPress={() => void signIn.sendCode()}
          >
            {signIn.sending
              ? 'Sending…'
              : waitSeconds > 0 && waitSeconds < 60
                ? `Send code in ${formatCountdown(waitSeconds)}`
                : 'Send code'}
          </ScButton>
        </View>
      ) : (
        <View style={styles.part}>
          <View style={styles.between}>
            <T size={15} lh={20}>
              {formatPhone(signIn.phone)}
            </T>
            <Pressable accessibilityRole="button" disabled={signIn.verifying || busy} onPress={signIn.editNumber} style={styles.link}>
              <T size={13} lh={18} color={colors.textSecondary} style={styles.underline}>
                Change number
              </T>
            </Pressable>
          </View>
          <View style={styles.sent}>
            <IconCheck size={14} color={colors.success} />
            <T size={13} lh={18} color={colors.success}>
              Code sent by SMS
            </T>
          </View>
          <OtpInput length={OTP_LENGTH} onChange={signIn.setOtp} resetKey={signIn.codeKey} />
          {signIn.isNew ? (
            <ScInput
              label="Your name (for the garage)"
              placeholder="Your name"
              autoComplete="name"
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={255}
              value={signIn.name}
              onChangeText={signIn.setName}
            />
          ) : null}
          <View style={styles.between}>
            <T size={12} lh={16} color={colors.textSecondary} style={styles.grow}>
              {expirySeconds === null ? '' : expirySeconds > 0 ? `Code expires in ${formatCountdown(expirySeconds)}` : 'Code expired — send a new one'}
            </T>
            <Pressable accessibilityRole="button" disabled={resendSeconds > 0 || signIn.sending} onPress={() => void signIn.resend()} style={styles.link}>
              <T
                size={12}
                weight={500}
                lh={16}
                color={resendSeconds > 0 || signIn.sending ? colors.textMuted : colors.textPrimary}
                style={resendSeconds > 0 || signIn.sending ? undefined : styles.underline}
              >
                {signIn.sending ? 'Sending…' : resendSeconds > 0 ? `Resend in ${formatCountdown(resendSeconds)}` : 'Resend code'}
              </T>
            </Pressable>
          </View>
          <ScButton variant="main" disabled={!signIn.readyToVerify || signIn.verifying || busy} onPress={onVerify}>
            {signIn.verifying ? 'Verifying…' : busy ? 'One moment…' : verifyLabel}
          </ScButton>
        </View>
      )}
      {shownError ? (
        <View style={styles.error} accessibilityRole="alert">
          <IconAlertCircle size={15} color={colors.error} />
          <T size={13} lh={18} color={colors.error} style={styles.grow}>
            {shownError}
          </T>
        </View>
      ) : null}
      <T size={12} lh={16} color={colors.textMuted}>
        {'New to Detlio? Your account is made when you verify. By continuing you agree to our '}
        <T size={12} lh={16} color={colors.textMuted} style={styles.underline} onPress={() => void WebBrowser.openBrowserAsync(`${WEBSITE}/terms`)}>
          Terms
        </T>
        {'; our '}
        <T size={12} lh={16} color={colors.textMuted} style={styles.underline} onPress={() => void WebBrowser.openBrowserAsync(`${WEBSITE}/privacy`)}>
          Privacy Policy
        </T>
        {' explains how we use your data.'}
      </T>
    </HubCard>
  );
}

const useStyles = createStyles(() => ({
  card: { padding: 20, gap: 16 },
  sub: { marginTop: 2 },
  part: { gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  underline: { textDecorationLine: 'underline' },
  sent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  grow: { flex: 1 },
  error: { flexDirection: 'row', gap: 6 },
}));
