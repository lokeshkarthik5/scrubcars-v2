import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { normaliseIndianMobile } from '@repo/core/phone';

import { colors } from '@/lib/theme';

import { font, T } from './text';

/** ScInput, 'solid' tone. */
export function ScInput({
  label,
  style,
  ...props
}: TextInputProps & { label?: string }) {
  return (
    <View style={styles.field}>
      {label ? (
        <T size={11} weight={500} color={colors.textSecondary}>
          {label}
        </T>
      ) : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        keyboardAppearance="dark"
        style={[styles.solid, style]}
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
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
}) {
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
        keyboardAppearance="dark"
        keyboardType="number-pad"
        onChangeText={(text) => {
          const digits = normaliseIndianMobile(text);
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
        keyboardAppearance="dark"
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

const styles = StyleSheet.create({
  field: { gap: 6 },
  solid: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: font(400),
    fontSize: 13,
    color: colors.textPrimary,
  },
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
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 16,
    fontFamily: font(400),
    fontSize: 16,
    lineHeight: 20,
    color: colors.textPrimary,
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
  otpFocus: { borderColor: colors.textPrimary },
  otpHidden: { position: 'absolute', width: 1, height: 1, opacity: 0.01 },
});
