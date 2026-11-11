import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { createStyles, useColors, useTheme } from '@repo/native-ui/theme';
import type { Tokens } from '@repo/native-ui/tokens';

import { ScButton } from '@repo/native-ui/button';
import { IconCheck, IconChevronDown } from '@repo/native-ui/icons';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { useT } from '@repo/core/i18n';

/** ScCheckbox (packages/ui/src/sc/checkbox.tsx): ticked is white, with a 44px row to hit. */
export function ScCheckbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={[styles.checkRow, disabled && { opacity: 0.6 }]}
    >
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked ? <IconCheck size={12} stroke={2.5} color={colors.chosenText} /> : null}
      </View>
      <T size={12} style={styles.flex}>
        {label}
      </T>
    </Pressable>
  );
}

type BadgeVariant = 'success' | 'pending' | 'muted' | 'active' | 'accent' | 'danger';
const badgeLook = (colors: Tokens): Record<BadgeVariant, { bg: string; fg: string; border?: string }> => ({
  success: { bg: colors.successMuted, fg: colors.success },
  pending: { bg: 'transparent', fg: colors.textPrimary, border: colors.outlineSoft },
  muted: { bg: colors.surfaceElevated, fg: colors.textSecondary, border: colors.border },
  active: { bg: colors.chosenBg, fg: colors.chosenText },
  accent: { bg: colors.tones.new.tint, fg: colors.tones.new.text },
  danger: { bg: colors.errorMuted, fg: colors.error },
});

/** ScBadge (packages/ui/src/sc/badge.tsx): 11px words in a small rounded tag. */
export function ScBadge({ children, variant = 'muted' }: { children: string; variant?: BadgeVariant }) {
  const colors = useColors();
  const styles = useStyles();
  const v = badgeLook(colors)[variant];
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: v.bg },
        v.border ? { borderWidth: 1, borderColor: v.border } : null,
      ]}
    >
      <T size={11} weight={500} lh={16} color={v.fg}>
        {children}
      </T>
    </View>
  );
}

/** ProgressBar (packages/ui/src/sc/progress-bar.tsx): 3px, the one red bar. `progress` is 0 to 100. */
export function ProgressBar({ progress }: { progress: number }) {
  const styles = useStyles();
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress) }} style={styles.progress}>
      <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, progress))}%` }]} />
    </View>
  );
}

/** ScSelect: the web's native select, as a field that opens a sheet of options. */
export function ScSelect<V extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label?: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (value: V) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={styles.field}>
      {label ? (
        <T size={11} weight={500} color={colors.textSecondary}>
          {label}
        </T>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${current?.label ?? ''}` : current?.label}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.select, disabled && { opacity: 0.6 }]}
      >
        <T size={13} style={styles.flex} numberOfLines={1}>
          {current?.label ?? ''}
        </T>
        <IconChevronDown size={16} color={colors.textSecondary} />
      </Pressable>
      <ScSheet open={open} onClose={() => setOpen(false)} accessibilityLabel={label ?? t('Choose')}>
        <View style={styles.options}>
          {options.map((o) => (
            <Pressable
              key={o.value}
              accessibilityRole="button"
              accessibilityState={{ selected: o.value === value }}
              onPress={() => {
                setOpen(false);
                onChange(o.value);
              }}
              style={styles.option}
            >
              <T size={15} weight={o.value === value ? 600 : 400} style={styles.flex}>
                {o.label}
              </T>
              {o.value === value ? <IconCheck size={18} /> : null}
            </Pressable>
          ))}
        </View>
      </ScSheet>
    </View>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` of a Date's own calendar day (the picker works in the phone's zone). */
export const toDateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromDateKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};
/** `HH:MM` of a Date, and back onto today's date. */
export const toTimeKey = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fromTimeKey = (key: string) => {
  const [h, m] = key.split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
};

function PickerField({
  label,
  display,
  placeholder,
  disabled,
  mode,
  value,
  onPick,
  minimumDate,
  maximumDate,
  minuteInterval,
}: {
  label?: string;
  display: string;
  placeholder?: string;
  disabled?: boolean;
  mode: 'date' | 'time';
  value: Date;
  onPick: (d: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  minuteInterval?: 1 | 5 | 10 | 15 | 20 | 30;
}) {
  const t = useT();
  const colors = useColors();
  const { scheme } = useTheme();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  return (
    <View style={styles.field}>
      {label ? (
        <T size={11} weight={500} color={colors.textSecondary}>
          {label}
        </T>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${display || placeholder || t('not set')}` : display}
        disabled={disabled}
        onPress={() => {
          setDraft(value);
          setOpen(true);
        }}
        style={[styles.select, disabled && { opacity: 0.6 }]}
      >
        <T size={13} num style={styles.flex} color={display ? colors.textPrimary : colors.textMuted}>
          {display || placeholder || ''}
        </T>
      </Pressable>
      <ScSheet open={open} onClose={() => setOpen(false)} accessibilityLabel={label ?? t('Choose')} horizontalPadding={16}>
        <View style={styles.pickerBody}>
          <View style={styles.pickerCentre}>
          <DateTimePicker
            value={draft}
            mode={mode}
            display={Platform.OS === 'ios' ? (mode === 'date' ? 'inline' : 'spinner') : 'default'}
            themeVariant={scheme}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            minuteInterval={minuteInterval}
            onChange={(_e: DateTimePickerEvent, d?: Date) => d && setDraft(d)}
          />
          </View>
          <ScButton
            onPress={() => {
              onPick(draft);
              setOpen(false);
            }}
          >
            {t('Done')}
          </ScButton>
        </View>
      </ScSheet>
    </View>
  );
}

/** A date input (`YYYY-MM-DD`). Empty string is "not chosen yet". */
export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  placeholder,
  disabled,
}: {
  label?: string;
  value: string;
  onChange: (key: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <PickerField
      label={label}
      mode="date"
      display={value}
      placeholder={placeholder ?? t('Choose a date')}
      disabled={disabled}
      value={value ? fromDateKey(value) : min ? fromDateKey(min) : new Date()}
      minimumDate={min ? fromDateKey(min) : undefined}
      maximumDate={max ? fromDateKey(max) : undefined}
      onPick={(d) => onChange(toDateKey(d))}
    />
  );
}

/** A 24-hour time input (`HH:MM`). */
export function TimeField({
  label,
  value,
  onChange,
  disabled,
}: {
  label?: string;
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  return (
    <PickerField
      label={label}
      mode="time"
      display={value}
      disabled={disabled}
      value={fromTimeKey(value || '09:00')}
      onPick={(d) => onChange(toTimeKey(d))}
    />
  );
}

const useStyles = createStyles((colors) => ({
  flex: { flex: 1, minWidth: 0 },
  field: { gap: 6 },
  checkRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  box: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.chosenBg, borderColor: colors.chosenBg },
  badge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  progress: { height: 3, width: '100%', borderRadius: 2, overflow: 'hidden', backgroundColor: colors.track },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: colors.red },
  select: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  options: { paddingHorizontal: 16 },
  option: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  pickerBody: { gap: 12 },
  pickerCentre: { alignItems: 'center' },
}));
