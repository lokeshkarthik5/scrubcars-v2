import type { ReminderEntry } from '@repo/core/api/garage-book';
import { useBookReminders, useSaveReminderMessage, useSendReminder } from '@repo/core/api/hooks/use-garage-book';
import { carName, fillReminder, GARAGE_BOOK_LIMITS, messageRefusal, reminderReason } from '@repo/core/garage-book';
import { msg, useT } from '@repo/core/i18n';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Edge, Raised, Recessed, RedLight } from '@repo/native-ui/finish';
import { LoadError, SkeletonList } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';

import { garageScreen } from '@/components/app-shell';
import { BookScreen } from '@/components/book/book-screen';
import { BackHeader, BookInput, Empty, Footnote, Overline, RaisedButton, Seg, Tag } from '@/components/book/parts';
import { sendReminder } from '@/components/book/reminders';
import { useAuth } from '@/lib/auth';

type View_ = 'today' | 'week' | 'rules';

/** Reminders (S4; the web's app/book/reminders/page.tsx). */
function RemindersScreen() {
  const t = useT();
  const [view, setView] = useState<View_>('today');
  const reminders = useBookReminders();
  const send = useSendReminder();
  // Filled into the message the customer gets, which stays English.
  const garage = useAuth((s) => s.vendor?.businessName) ?? 'your garage';
  const data = reminders.data;
  const list = data ? (view === 'week' ? data.week : data.due) : [];
  const example = data?.due[0] ?? data?.week[0];
  return (
    <BookScreen>
      <BackHeader title={t('Reminders')} />
      <Seg<View_>
        label={msg('Show reminders')}
        value={view}
        onChange={setView}
        options={[
          { value: 'today', label: msg('Today'), count: data?.due.filter((r) => !r.sentAt).length },
          { value: 'week', label: msg('This week'), count: data?.week.length },
          { value: 'rules', label: msg('Rules') },
        ]}
      />
      {!data ? (
        reminders.isError ? (
          <LoadError what={t('reminders')} onRetry={() => void reminders.refetch()} />
        ) : (
          <SkeletonList count={4} height={64} />
        )
      ) : view === 'rules' ? (
        <Rules message={data.message} interval={data.defaultIntervalDays} />
      ) : (
        <>
          <Pressable accessibilityRole="button" onPress={() => setView('rules')}>
            <Edge radius={22} innerStyle={{ paddingHorizontal: 16, paddingVertical: 14 }}>
              <Overline>{t('The message · you can edit it')}</Overline>
              <T size={14} lh={21} style={{ marginTop: 6 }}>
                {fillReminder(data.message, { name: example?.name ?? 'Suresh', car: carName(example?.car) || null, garage, phone: null })}
              </T>
            </Edge>
          </Pressable>
          {list.length === 0 ? (
            <Empty>{view === 'week' ? t('No one comes due this week.') : t('No one is due today.')}</Empty>
          ) : (
            <View>
              {list.map((entry) => (
                <ReminderRow
                  key={entry.customerId}
                  entry={entry}
                  busy={send.isPending && send.variables === entry.customerId}
                  onSend={() => sendReminder(send, entry.customerId, entry.name)}
                />
              ))}
            </View>
          )}
          <Footnote>
            {t(
              'WhatsApp opens on your phone with the message ready, and you press Send. Free. Detlio customers get your reminder as a Detlio app notification, also free.'
            )}
          </Footnote>
        </>
      )}
    </BookScreen>
  );
}

function ReminderRow({ entry, busy, onSend }: { entry: ReminderEntry; busy: boolean; onSend: () => void }) {
  const t = useT();
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <View style={styles.name}>
          <T variant="t3" weight={600} numberOfLines={1} style={styles.shrink}>
            {entry.name}
          </T>
          {entry.source === 'detlio' ? <Tag detlio /> : null}
        </View>
        <T size={12} color={colors.textSecondary} numberOfLines={1}>
          {reminderReason(entry)}
        </T>
      </View>
      {entry.sentAt ? (
        <Raised radius={12} style={styles.button} innerStyle={styles.sent}>
          <T size={13} weight={600}>
            {t('Sent ✓')}
          </T>
          <RedLight width={28} style={{ marginTop: 3 }} />
        </Raised>
      ) : (
        <RaisedButton
          label={!entry.canSend ? t('No mobile') : entry.channel === 'whatsapp' ? 'WhatsApp' : t('Via Detlio')}
          height={40}
          radius={12}
          disabled={!entry.canSend || busy}
          onPress={onSend}
          style={styles.button}
        />
      )}
    </View>
  );
}

function Rules({ message, interval }: { message: string; interval: number }) {
  const t = useT();
  const styles = useStyles();
  const colors = useColors();
  const [text, setText] = useState(message);
  const [days, setDays] = useState(String(interval));
  const save = useSaveReminderMessage();
  const refusal = messageRefusal(text);
  const daysNumber = Number(days);
  const daysOk = Number.isInteger(daysNumber) && daysNumber >= 1 && daysNumber <= 365;
  return (
    <View style={{ gap: 12 }}>
      <T variant="t4" weight={600} color="#D4D4DA">
        {t('The message')}
      </T>
      <Recessed radius={18} innerStyle={styles.messageBox}>
        <TextInput
          accessibilityLabel={t('The message')}
          multiline
          maxLength={GARAGE_BOOK_LIMITS.messageMax}
          value={text}
          onChangeText={setText}
          style={[styles.message, { color: colors.textPrimary }]}
        />
      </Recessed>
      <Footnote>
        {t('{name} becomes their first name, {car} their car, {garage} your garage and {phone} your number. No links.', {
          name: '{name}',
          car: '{car}',
          garage: '{garage}',
          phone: '{phone}',
        })}
      </Footnote>
      {refusal && text.trim() !== '' ? (
        <T size={12} weight={600} color="#FF8A95">
          {refusal}
        </T>
      ) : null}
      <T variant="t4" weight={600} color="#D4D4DA">
        {t('Remind to wash again after (days)')}
      </T>
      <BookInput value={days} onChangeText={(text) => setDays(text.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" accessibilityLabel={t('Days')} style={{ width: 112 }} />
      <RaisedButton
        label={save.isPending ? t('Saving…') : t('Save')}
        disabled={Boolean(refusal) || !daysOk || save.isPending}
        onPress={() =>
          save.mutate(
            { message: text.trim(), defaultIntervalDays: daysNumber },
            {
              onSuccess: () => toast.success(t('Saved')),
              onError: (error) => toast.error(error instanceof Error ? error.message : t("Couldn't save. Try again.")),
            }
          )
        }
      />
    </View>
  );
}

export default garageScreen(RemindersScreen);

const useStyles = createStyles(() => ({
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1D1D23' },
  name: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  button: { width: 96, height: 40 },
  sent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messageBox: { paddingHorizontal: 14, paddingVertical: 12 },
  message: { fontSize: 14, lineHeight: 21, minHeight: 105, padding: 0, textAlignVertical: 'top' },
}));
