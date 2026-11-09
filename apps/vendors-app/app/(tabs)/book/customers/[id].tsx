import { useBookCustomer, useSendReminder, useUpdateBookCustomer } from '@repo/core/api/hooks/use-garage-book';
import { carName, monthYear, plateText, rupees, shortDate, washWords } from '@repo/core/garage-book';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { Edge, Recessed } from '@repo/native-ui/finish';
import { IconBrandWhatsapp, IconPlus } from '@repo/native-ui/icons';
import { LoadError, SkeletonList } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';

import { garageScreen } from '@/components/app-shell';
import { BookScreen } from '@/components/book/book-screen';
import { BackHeader, CarGauge, go, Overline, Plate, RaisedButton, Tag, Tile } from '@/components/book/parts';
import { sendReminder } from '@/components/book/reminders';
import { useIsVendorAdmin } from '@/lib/auth';

/** One customer (S3; the web's app/book/customers/[id]/page.tsx): plate, wash gauge, history, note. */
function CustomerScreen({ id }: { id: string }) {
  const styles = useStyles();
  const colors = useColors();
  const isOwner = useIsVendorAdmin();
  const customer = useBookCustomer(id || null);
  const send = useSendReminder();
  const save = useUpdateBookCustomer();
  const [note, setNote] = useState<string | null>(null);
  const c = customer.data;
  const now = new Date();

  if (!c) {
    return (
      <BookScreen>
        <BackHeader title="Customer" />
        {customer.isError ? <LoadError what="this customer" onRetry={() => void customer.refetch()} /> : <SkeletonList count={3} height={96} />}
      </BookScreen>
    );
  }

  const sub = c.viaDetlio
    ? `Via Detlio · since ${monthYear(c.since)}`
    : [c.phone ? `+91 ${c.phone.slice(0, 5)} ${c.phone.slice(5)}` : null, `your customer since ${monthYear(c.since)}`].filter(Boolean).join(' · ');

  return (
    <BookScreen>
      <BackHeader title={c.name} sub={sub} />
      {c.cars.map((car) => {
        const words = washWords(car.wash, now);
        const plate = plateText(car.plate);
        return (
          <Edge key={car.id} radius={22} innerStyle={styles.car}>
            <View style={styles.carText}>
              {plate ? <Plate plate={plate} /> : null}
              <T size={14} weight={600}>
                {[carName(car), car.colour].filter(Boolean).join(' · ') || 'Car'}
              </T>
              <T size={12} color={colors.textSecondary}>
                <T size={12} weight={500}>
                  {words.lead}
                </T>
                {words.rest}
              </T>
            </View>
            <View style={styles.gauge}>
              <CarGauge days={car.wash.daysSinceWash} interval={car.wash.intervalDays} over={car.wash.dueState === 'overdue'} />
              {car.wash.daysSinceWash !== null ? (
                <View style={styles.days}>
                  <T num size={28} weight={500} lh={28} tracking={-0.045}>
                    {String(car.wash.daysSinceWash)}
                  </T>
                  <T size={11} color={colors.textSecondary}>
                    {car.wash.daysSinceWash === 1 ? 'day ago' : 'days ago'}
                  </T>
                </View>
              ) : null}
            </View>
          </Edge>
        );
      })}
      <View style={styles.row}>
        <Tile label="Visits" value={c.visits} />
        {isOwner ? <Tile label="Spent" value={rupees(c.spentPaise) ?? '–'} /> : null}
        {isOwner ? <Tile label="Owes" value={rupees(c.owesPaise) ?? '₹0'} /> : null}
      </View>
      <View style={styles.row}>
        <RaisedButton
          label={c.viaDetlio ? 'Remind via Detlio' : c.phone ? 'Remind' : 'Add a phone to remind'}
          icon={<IconBrandWhatsapp size={18} />}
          disabled={send.isPending || (!c.viaDetlio && !c.phone)}
          onPress={() => sendReminder(send, c.id, c.name)}
          style={styles.flex}
        />
        {!c.viaDetlio ? (
          <RaisedButton label="New job" icon={<IconPlus size={18} />} onPress={() => go(`/book/new?customer=${encodeURIComponent(c.id)}`)} style={styles.flex} />
        ) : null}
      </View>
      <View>
        <Overline>History · Detlio and yours</Overline>
        {c.history.length === 0 ? (
          <T variant="t4" weight={400} color={colors.textSecondary} style={styles.none}>
            No visits yet.
          </T>
        ) : (
          c.history.map((h) => (
            <View key={`${h.source}-${h.id}`} style={styles.hist}>
              <T size={12} color={colors.textSecondary} style={styles.histDate}>
                {shortDate(h.at)}
              </T>
              <View style={styles.flex}>
                <View style={styles.histName}>
                  <T size={14} weight={600} numberOfLines={1} style={styles.shrink}>
                    {h.lines.join(', ') || 'Job'}
                  </T>
                  {h.source === 'detlio' ? <Tag detlio /> : <Tag>walk-in</Tag>}
                </View>
                <T size={12} color={colors.textSecondary}>
                  {h.source === 'detlio'
                    ? `Detlio booking · ${h.status}`
                    : `Walk-in · ${h.payment === 'later' ? 'Pay later' : h.payment.toUpperCase()}${h.status !== 'done' ? ` · ${h.status.replace('_', ' ')}` : ''}`}
                </T>
              </View>
              {h.amountPaise !== undefined ? (
                <T num size={14} weight={600}>
                  {rupees(h.amountPaise) ?? ''}
                </T>
              ) : null}
            </View>
          ))
        )}
      </View>
      <Recessed radius={18} innerStyle={styles.note}>
        <Overline>Your note · only your team sees it</Overline>
        <TextInput
          accessibilityLabel="Your note"
          multiline
          maxLength={500}
          value={note ?? c.note ?? ''}
          onChangeText={setNote}
          onBlur={() => {
            if (note === null || note === (c.note ?? '')) return;
            save.mutate(
              { id: c.id, patch: { note: note.trim() || null } },
              {
                onSuccess: () => toast.success('Note saved'),
                onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't save the note."),
              }
            );
          }}
          placeholder="Likes tyre shine. Pays on UPI."
          placeholderTextColor="#8A8A94"
          style={[styles.noteInput, { color: colors.textPrimary }]}
        />
      </Recessed>
    </BookScreen>
  );
}

/** One screen per customer: the same mounted screen reused for another id must not carry a typed note across. */
function CustomerRoute() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = decodeURIComponent(raw ?? '');
  return <CustomerScreen key={id} id={id} />;
}

export default garageScreen(CustomerRoute);

const useStyles = createStyles(() => ({
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  car: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  carText: { flex: 1, minWidth: 0, gap: 8 },
  gauge: { alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  days: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  row: { flexDirection: 'row', gap: 8 },
  none: { paddingVertical: 12 },
  hist: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1D1D23' },
  histDate: { width: 56, paddingTop: 2 },
  histName: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  note: { paddingHorizontal: 14, paddingVertical: 12 },
  noteInput: { marginTop: 4, fontSize: 14, minHeight: 40, padding: 0 },
}));
