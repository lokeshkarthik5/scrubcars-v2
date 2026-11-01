import { ApiError, setUnauthorizedHandler } from '@repo/core/api/client';
import type { NativeOtpPurpose, NativeSessionData } from '@repo/core/native-session';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { session } from '@/lib/session';

/**
 * The v0 sign-in: proves the session end to end on a real build. A plain
 * placeholder on purpose; the designed screens replace it once approved.
 */
type Screen =
  | { name: 'loading' }
  | { name: 'unreachable' }
  | { name: 'phone' }
  | { name: 'code'; phone: string; purpose: NativeOtpPurpose }
  | { name: 'signed-in'; data: NativeSessionData };

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Could not reach Detlio. Check your connection.';

export default function Index() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const restore = useCallback(async () => {
    setScreen({ name: 'loading' });
    const result = await session.refresh();
    if (result.status === 'signed-in') setScreen({ name: 'signed-in', data: result.session });
    else if (result.status === 'unreachable') setScreen({ name: 'unreachable' });
    else setScreen({ name: 'phone' });
  }, []);

  useEffect(() => {
    // A 401 that could not be refreshed. Still holding a token means no signal,
    // which never signs anyone out.
    setUnauthorizedHandler(async () => {
      setScreen((await session.hasRefreshToken()) ? { name: 'unreachable' } : { name: 'phone' });
    });
    void restore();
    return () => setUnauthorizedHandler(null);
  }, [restore]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      const sent = await session.sendCode(phone);
      setOtp('');
      setScreen({ name: 'code', phone, purpose: sent.purpose });
    });

  const verify = (target: { phone: string; purpose: NativeOtpPurpose }) =>
    run(async () => {
      const data = await session.signIn({
        phone: target.phone,
        otp,
        purpose: target.purpose,
        ...(target.purpose === 'login' ? {} : { name }),
      });
      setScreen({ name: 'signed-in', data });
    });

  const signOut = () =>
    run(async () => {
      await session.signOut();
      setPhone('');
      setScreen({ name: 'phone' });
    });

  return (
    <SafeAreaView style={styles.page}>
      {screen.name === 'loading' ? <ActivityIndicator accessibilityLabel="Loading" /> : null}

      {screen.name === 'unreachable' ? (
        <View style={styles.form}>
          <Text style={styles.title}>Could not reach Detlio</Text>
          <Text style={styles.text}>You are still signed in. Check your connection.</Text>
          <Button title="Try again" onPress={restore} />
        </View>
      ) : null}

      {screen.name === 'phone' ? (
        <View style={styles.form}>
          <Text style={styles.title}>Sign in</Text>
          <TextInput
            accessibilityLabel="Mobile number"
            autoComplete="tel"
            keyboardType="number-pad"
            maxLength={10}
            onChangeText={setPhone}
            placeholder="10-digit mobile number"
            style={styles.input}
            value={phone}
          />
          <Button title="Send code" disabled={busy || phone.length !== 10} onPress={sendCode} />
        </View>
      ) : null}

      {screen.name === 'code' ? (
        <View style={styles.form}>
          <Text style={styles.title}>Enter the code</Text>
          <Text style={styles.text}>Sent to {screen.phone}</Text>
          {screen.purpose === 'login' ? null : (
            <TextInput
              accessibilityLabel="Your name"
              onChangeText={setName}
              placeholder="Your name"
              style={styles.input}
              value={name}
            />
          )}
          <TextInput
            accessibilityLabel="Code"
            autoComplete="one-time-code"
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={setOtp}
            placeholder="6-digit code"
            style={styles.input}
            textContentType="oneTimeCode"
            value={otp}
          />
          <Button
            title="Verify"
            disabled={busy || otp.length !== 6 || (screen.purpose !== 'login' && !name.trim())}
            onPress={() => verify(screen)}
          />
          <Button title="Change number" disabled={busy} onPress={() => setScreen({ name: 'phone' })} />
        </View>
      ) : null}

      {screen.name === 'signed-in' ? (
        <View style={styles.form}>
          <Text style={styles.title}>Signed in</Text>
          <Text style={styles.text}>{screen.data.user.name}</Text>
          <Text style={styles.text}>
            {screen.data.vendors.map((vendor) => vendor.businessName).join(', ') || 'No garage yet'}
          </Text>
          <Button title="Sign out" disabled={busy} onPress={signOut} />
        </View>
      ) : null}

      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0A0A0B' },
  form: { gap: 12 },
  title: { color: '#FAFAFA', fontSize: 24, fontWeight: '600' },
  text: { color: '#B4B4BC', fontSize: 15 },
  error: { color: '#EF3240', fontSize: 14, marginTop: 12 },
  input: {
    borderColor: '#26262C',
    borderRadius: 8,
    borderWidth: 1,
    color: '#FAFAFA',
    fontSize: 16,
    padding: 12,
  },
});
