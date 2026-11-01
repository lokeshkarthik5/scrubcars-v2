import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, type TextInputProps, View } from 'react-native';

import { font, T } from './text';
import { createStyles, useColors } from './theme';

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
}: {
  length?: number;
  onChange: (otp: string) => void;
  /** Change it to empty the boxes. */
  resetKey?: number;
}) {
  const colors = useColors();
  const styles = useStyles();
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);

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

const useStyles = createStyles((c) => ({
  field: { gap: 6 },
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
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  phoneCode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.15)',
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
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpFilled: { borderColor: 'rgba(255,255,255,0.3)' },
  otpFocus: { borderColor: c.textPrimary },
  otpHidden: { position: 'absolute', width: 1, height: 1, opacity: 0.01 },
}));
