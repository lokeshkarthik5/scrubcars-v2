import { useSetBirthday } from '@repo/core/api/hooks/use-rewards';
import { ScButton } from '@repo/native-ui/button';
import { Chip } from '@repo/native-ui/chip';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const daysInMonth = (month: number) => (month ? new Date(Date.UTC(2024, month, 0)).getUTCDate() : 31);

/** BirthdayForm: month and day, no year. The web's dropdowns as a chip sheet. */
export function BirthdayForm({ birthday, perkFrom }: { birthday: { month: number; day: number } | null; perkFrom: string | null }) {
  const colors = useColors();
  const styles = useStyles();
  const save = useSetBirthday();
  const [month, setMonth] = useState(birthday?.month ?? 0);
  const [day, setDay] = useState(birthday?.day ?? 0);
  const [choosing, setChoosing] = useState<'month' | 'day' | null>(null);
  const changed = month !== (birthday?.month ?? 0) || day !== (birthday?.day ?? 0);
  const pick = (label: string, kind: 'month' | 'day', wide: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel={kind === 'month' ? 'Month' : 'Day'} onPress={() => setChoosing(kind)} style={[styles.select, wide ? styles.grow : styles.day]}>
      <T num={kind === 'day'} size={14} lh={20}>
        {label}
      </T>
    </Pressable>
  );
  return (
    <View style={styles.column}>
      <T size={13} lh={18} color={colors.textSecondary}>
        {`${perkFrom ? `From ${perkFrom}, a wash on us in your birthday month.` : 'Your birthday, for birthday treats.'} Only the day and month.`}
      </T>
      <View style={styles.row}>
        {pick(month ? MONTHS[month - 1] : 'Month', 'month', true)}
        {pick(day ? String(day) : 'Day', 'day', false)}
      </View>
      <View style={styles.actions}>
        <ScButton
          variant="outline"
          fullWidth={false}
          height={36}
          paddingX={16}
          disabled={!changed || !month || !day || save.isPending}
          onPress={() =>
            save.mutate(
              { month, day },
              {
                onSuccess: () => toast.success('Birthday saved'),
                onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't save it"),
              }
            )
          }
        >
          Save
        </ScButton>
        {birthday ? (
          <Pressable
            accessibilityRole="button"
            disabled={save.isPending}
            onPress={() =>
              save.mutate(null, {
                onSuccess: () => {
                  setMonth(0);
                  setDay(0);
                },
              })
            }
          >
            <T size={12} lh={16} color={colors.textSecondary} style={styles.underline}>
              Remove
            </T>
          </Pressable>
        ) : null}
      </View>
      <ScSheet horizontalPadding={16} open={choosing !== null} onClose={() => setChoosing(null)} accessibilityLabel={choosing === 'month' ? 'Month' : 'Day'}>
        <ScrollView style={styles.sheet} contentContainerStyle={styles.chips}>
          {choosing === 'month'
            ? MONTHS.map((name, i) => (
                <Chip
                  key={name}
                  label={name}
                  selected={month === i + 1}
                  onPress={() => {
                    setMonth(i + 1);
                    if (day > daysInMonth(i + 1)) setDay(0);
                    setChoosing(null);
                  }}
                />
              ))
            : Array.from({ length: daysInMonth(month) }, (_, i) => (
                <Chip
                  key={i}
                  label={String(i + 1)}
                  selected={day === i + 1}
                  onPress={() => {
                    setDay(i + 1);
                    setChoosing(null);
                  }}
                />
              ))}
        </ScrollView>
      </ScSheet>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  column: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  select: { height: 40, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 12 },
  grow: { flex: 1 },
  day: { width: 88 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  underline: { textDecorationLine: 'underline' },
  sheet: { maxHeight: 420 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },
}));
