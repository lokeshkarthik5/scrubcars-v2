import { LinearGradient } from 'expo-linear-gradient';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Recessed, RedLight } from './finish';
import { EASE_SETTLE, EASE_SPRING, useReduceMotion } from './motion';
import { font, T } from './text';
import { createStyles, useColors, useFinish } from './theme';

/** Pasted "+91 98765 43210" or "098765...": ten digits (core's normaliseIndianMobile, handed in). */
export type NormalisePhone = (text: string) => string;

/** ScInput, 'solid' tone. */
export function ScInput({
  label,
  style,
  numeric,
  ...props
}: TextInputProps & { label?: string; numeric?: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  const { on: finish } = useFinish();
  if (finish) {
    // Under the finish a field is recessed: pressed into the screen, lit from below.
    return (
      <View style={styles.field}>
        {label ? (
          <T size={11} weight={500} color={colors.textSecondary}>
            {label}
          </T>
        ) : null}
        <Recessed radius={12}>
          <TextInput
            placeholderTextColor={colors.textMuted}
            keyboardAppearance={colors.keyboard}
            style={[styles.solid, styles.recessedInput, numeric && styles.numeric, style]}
            accessibilityLabel={props.accessibilityLabel ?? label}
            {...props}
          />
        </Recessed>
      </View>
    );
  }
  return (
    <View style={styles.field}>
      {label ? (
        <T size={11} weight={500} color={colors.textSecondary}>
          {label}
        </T>
      ) : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        keyboardAppearance={colors.keyboard}
        style={[styles.solid, numeric && styles.numeric, style]}
        accessibilityLabel={props.accessibilityLabel ?? label}
        {...props}
      />
    </View>
  );
}

/** ScTextarea. */
export function ScTextarea({ rows = 2, style, ...props }: TextInputProps & { label?: string; rows?: number }) {
  return (
    <ScInput
      multiline
      textAlignVertical="top"
      style={[{ minHeight: rows * 20 + 22 }, style]}
      {...props}
    />
  );
}

/** ScPhoneInput on the glass card: "+91 98765 43210" pasted arrives as ten digits. */
export function ScPhoneInput({
  value,
  onChange,
  onSubmit,
  normalise,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  normalise: NormalisePhone;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.phone}>
      <View style={styles.phoneCode} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <T size={16} lh={18}>
          🇮🇳
        </T>
        <T size={16} lh={18}>
          +91
        </T>
      </View>
      <TextInput
        accessibilityLabel="Phone number"
        autoComplete="tel-national"
        autoFocus
        keyboardAppearance={colors.keyboard}
        keyboardType="number-pad"
        onChangeText={(text) => {
          const digits = normalise(text);
          if (digits.length <= 10) onChange(digits);
        }}
        onSubmitEditing={onSubmit}
        placeholder="Phone number"
        placeholderTextColor="#7D7D85"
        returnKeyType="go"
        selectionColor={colors.textPrimary}
        style={styles.phoneInput}
        textContentType="telephoneNumber"
        value={value}
      />
    </View>
  );
}

/**
 * OtpInput: six boxes in the web's look. One hidden field behind them rather
 * than six inputs, so the phone's code suggestion and a paste fill every box.
 */
export function OtpInput({
  length = 6,
  onChange,
  resetKey,
  invalid = false,
}: {
  length?: number;
  onChange: (otp: string) => void;
  /** Change it to empty the boxes. */
  resetKey?: number;
  /** The code was refused: the boxes part again, so the digits can be seen and fixed. */
  invalid?: boolean;
}) {
  const colors = useColors();
  const styles = useStyles();
  const { on: finish } = useFinish();
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  // All six in and nothing said against them: the boxes join into one tick.
  const joined = finish && value.length === length && !invalid;

  useEffect(() => {
    setValue('');
    onChange('');
    // onChange is a setState in the one caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  return (
    <Pressable
      accessibilityRole="none"
      onPress={() => input.current?.focus()}
      style={styles.otpRow}
    >
      {Array.from({ length }, (_, index) => {
        const digit = value[index] ?? '';
        const current = focused && index === Math.min(value.length, length - 1);
        if (finish) {
          return (
            <CodeBox key={index} index={index} length={length} digit={digit} current={current} joined={joined} />
          );
        }
        return (
          <View
            key={index}
            style={[
              styles.otpBox,
              digit ? styles.otpFilled : null,
              current ? styles.otpFocus : null,
            ]}
          >
            <T num size={16} weight={700} lh={20}>
              {digit}
            </T>
          </View>
        );
      })}
      {finish ? <CodeJoin joined={joined} length={length} /> : null}
      <TextInput
        ref={input}
        accessibilityLabel="Verification code"
        autoComplete="one-time-code"
        autoFocus
        caretHidden
        keyboardAppearance={colors.keyboard}
        keyboardType="number-pad"
        maxLength={length}
        onBlur={() => setFocused(false)}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, '').slice(0, length);
          setValue(digits);
          onChange(digits);
        }}
        onFocus={() => setFocused(true)}
        style={styles.otpHidden}
        textContentType="oneTimeCode"
        value={value}
      />
    </Pressable>
  );
}

/** How far apart the code boxes sit: a box and the gap after it. */
const BOX_STEP = 52;

/**
 * One code box under the finish (moment 10, the website's otp-cell): recessed, with a
 * red light under it that switches on as its digit goes in. With the sixth digit the
 * boxes slide into the middle and fade as one tick takes their place; Backspace, or a
 * wrong code emptying them, parts them again at once.
 */
function CodeBox({ index, length, digit, current, joined }: { index: number; length: number; digit: string; current: boolean; joined: boolean }) {
  const colors = useColors();
  const reduce = useReduceMotion();
  const join = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce || !joined) {
      join.setValue(joined ? 1 : 0);
      return;
    }
    const run = Animated.timing(join, { toValue: 1, duration: 350, delay: 250, easing: EASE_SETTLE, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [joined, reduce, join]);
  const toCentre = ((length - 1) / 2 - index) * BOX_STEP;
  return (
    <Animated.View
      style={{
        opacity: join.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: [
          { translateX: join.interpolate({ inputRange: [0, 1], outputRange: [0, toCentre] }) },
          { scale: join.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }) },
        ],
      }}
    >
      <Recessed radius={12} style={[codeStyles.box, current && { borderWidth: 1.5, borderColor: colors.scheme === 'light' ? colors.outlineStrong : 'rgba(255,255,255,0.55)' }]} innerStyle={codeStyles.boxInner}>
        <T num size={16} weight={700} lh={20} color={colors.textPrimary}>
          {digit}
        </T>
        <RedLight state={digit ? 'on' : 'dim'} width={14} style={codeStyles.light} />
      </Recessed>
    </Animated.View>
  );
}

/** The light that sweeps across as the sixth digit goes in, and the tick the boxes join into. */
function CodeJoin({ joined, length }: { joined: boolean; length: number }) {
  const reduce = useReduceMotion();
  const sweep = useRef(new Animated.Value(0)).current;
  const tick = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!joined) {
      sweep.setValue(0);
      tick.setValue(0);
      return;
    }
    if (reduce) {
      tick.setValue(1);
      return;
    }
    const run = Animated.parallel([
      Animated.timing(sweep, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(tick, { toValue: 1, duration: 400, delay: 300, easing: EASE_SPRING, useNativeDriver: true }),
    ]);
    run.start();
    return () => run.stop();
  }, [joined, reduce, sweep, tick]);
  const width = length * BOX_STEP;
  return (
    <View pointerEvents="none" style={[codeStyles.join, { width }]}>
      <Animated.View
        style={[
          codeStyles.sweep,
          {
            opacity: sweep.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 1, 0] }),
            transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-60, width] }) }],
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(255,90,110,0)', 'rgba(255,90,110,0.5)', 'rgba(255,90,110,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        style={[
          codeStyles.tick,
          { opacity: tick, transform: [{ scale: tick.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] },
        ]}
      >
        <LinearGradient colors={['#383840', '#1D1D23']} style={[StyleSheet.absoluteFill, codeStyles.tickFace]} />
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M5 12.5l4.2 4.2L19 7" />
        </Svg>
      </Animated.View>
    </View>
  );
}

const codeStyles = StyleSheet.create({
  box: { width: 44, height: 50 },
  boxInner: { alignItems: 'center', justifyContent: 'center' },
  light: { position: 'absolute', bottom: 6, alignSelf: 'center' },
  join: { position: 'absolute', top: 0, bottom: 0, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sweep: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 60 },
  tick: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,45,74,0.6)',
    shadowColor: '#E4002B',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 11,
    shadowOpacity: 0.5,
  },
  tickFace: { borderRadius: 26 },
});

const useStyles = createStyles((c) => ({
  field: { gap: 6 },
  recessedInput: { borderWidth: 0, backgroundColor: 'transparent', fontFamily: font(500), fontSize: 15 },
  solid: {
    letterSpacing: 0,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: font(400),
    fontSize: 13,
    color: c.textPrimary,
  },
  numeric: { fontFamily: font(400, true) },
  phone: {
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.scheme === 'dark' ? 'rgba(255,255,255,0.15)' : c.border,
    backgroundColor: c.scheme === 'dark' ? 'rgba(255,255,255,0.06)' : c.surface,
  },
  phoneCode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRightWidth: 1,
    borderRightColor: c.scheme === 'dark' ? 'rgba(255,255,255,0.15)' : c.border,
  },
  phoneInput: {
    // iOS reuses a text field's native view: without this, the wide spacing of the
    // pickup code's box came back here after a sign-out.
    letterSpacing: 0,
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 16,
    fontFamily: font(400),
    fontSize: 16,
    lineHeight: 20,
    color: c.textPrimary,
  },
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  otpBox: {
    width: 44,
    height: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.scheme === 'dark' ? 'rgba(255,255,255,0.15)' : c.border,
    backgroundColor: c.scheme === 'dark' ? 'rgba(255,255,255,0.06)' : c.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpFilled: { borderColor: c.scheme === 'dark' ? 'rgba(255,255,255,0.3)' : c.outlineStrong },
  otpFocus: { borderColor: c.textPrimary },
  otpHidden: { position: 'absolute', width: 1, height: 1, opacity: 0.01 },
}));
