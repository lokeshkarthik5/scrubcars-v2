import type { BookCustomerRow, NewWalkIn, OwnJob } from '@repo/core/api/garage-book';
import { useBookCustomer, useBookCustomers, useBookReminders, useBookServices } from '@repo/core/api/hooks/use-garage-book';
import {
  DEFAULT_INTERVAL_DAYS,
  carName,
  newClientId,
  plateText,
  remindLine,
  rupees,
  shortDate,
  walkInTime,
  type JobPayment,
  type WhenChoice,
} from '@repo/core/garage-book';
import { useDebounced } from '@repo/core/hooks/use-debounced';
import DateTimePicker from '@react-native-community/datetimepicker';
import { type Href, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { Edge, RedButton, RedLight } from '@repo/native-ui/finish';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';

import { garageScreen } from '@/components/app-shell';
import { BookScreen } from '@/components/book/book-screen';
import { BackHeader, BookInput, Disc, Footnote, PickTile, Plate, Seg, Switch } from '@/components/book/parts';
import { useIsVendorAdmin } from '@/lib/auth';
import { saveWalkIn, useWalkInQueue } from '@/lib/book-offline';

const WHEN = [
  { value: 'now', label: 'Now' },
  { value: 'later', label: 'Later today' },
  { value: 'pick', label: 'Pick a time' },
] as const;

const PAYMENTS = [
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'later', label: 'Pay later' },
] as const;

/**
 * Add a walk-in (S1; the web's app/book/new/page.tsx). With no signal it is saved on the phone
 * with its client id and sent later, and Today shows it as waiting.
 */
function NewWalkInScreen() {
  const styles = useStyles();
  const colors = useColors();
  const isOwner = useIsVendorAdmin();
  const offline = useWalkInQueue((s) => s.offline);
  const params = useLocalSearchParams<{ customer?: string }>();
  const [clientId] = useState(() => newClientId());
  const [typed, setTyped] = useState('');
  const [chosen, setChosen] = useState<BookCustomerRow | null>(null);
  const [cleared, setCleared] = useState(false);
  const [name, setName] = useState('');
  const [car, setCar] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState<{ label: string; rupees: string } | null>(null);
  const [when, setWhen] = useState<WhenChoice>('now');
  const [time, setTime] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [payment, setPayment] = useState<JobPayment>('upi');
  const [remind, setRemind] = useState(true);
  const [saving, setSaving] = useState(false);

  const services = useBookServices();
  const reminders = useBookReminders();
  const interval = reminders.data?.defaultIntervalDays ?? DEFAULT_INTERVAL_DAYS;
  const search = useDebounced(typed.trim(), 250);
  const fromLink = params.customer ?? null;
  const matches = useBookCustomers({ filter: 'own', q: search }, search.length >= 3 && !chosen && (cleared || !fromLink));
  const linked = useBookCustomer(fromLink && fromLink.startsWith('own:') ? fromLink : null);
  const linkedRow = useMemo<BookCustomerRow | null>(() => {
    const c = linked.data;
    if (!c) return null;
    return {
      id: c.id,
      source: 'own',
      viaDetlio: false,
      name: c.name,
      phone: c.phone,
      cars: c.cars,
      lastVisitAt: c.history[0]?.at ?? null,
      visits: c.visits,
      remindedAt: null,
      due: { state: 'none', dueOn: null, daysSince: null, intervalDays: null },
    };
  }, [linked.data]);

  const match = chosen ?? (cleared ? null : linkedRow);
  const suggestion = !match ? matches.data?.customers[0] : undefined;
  const lines = (services.data ?? []).filter((service) => picked.includes(service.id));
  const otherPaise = other && other.label.trim() && Number(other.rupees) > 0 ? Math.round(Number(other.rupees) * 100) : null;
  const count = lines.length + (otherPaise ? 1 : 0);
  const totalPaise = lines.reduce((sum, line) => sum + line.pricePaise, 0) + (otherPaise ?? 0);
  const looksLikePhone = /^[+\d\s-]{10,}$/.test(typed.trim());
  const ready = count > 0 && (match !== null || typed.trim().length > 0 || name.trim().length > 0) && (when !== 'pick' || time !== null);

  const save = async () => {
    const timing = walkInTime(when, new Date(), when === 'pick' && time ? time.toISOString() : null);
    const [make, ...model] = car.trim().split(/\s+/);
    const input: NewWalkIn = {
      clientId,
      customer: match
        ? { id: match.id }
        : {
            name: name.trim() || undefined,
            phone: looksLikePhone ? typed.trim() : undefined,
            plate: looksLikePhone ? undefined : typed.trim() || undefined,
            make: make || undefined,
            model: model.join(' ') || undefined,
          },
      lines: [...lines.map((line) => ({ serviceId: line.id })), ...(otherPaise ? [{ label: other!.label.trim(), pricePaise: otherPaise }] : [])],
      scheduledAt: timing.scheduledAt,
      status: timing.status,
      payment,
      remindInDays: remind ? interval : null,
    };
    // How Today shows it while it waits for a signal.
    const preview: OwnJob = {
      source: 'own',
      id: clientId,
      clientId,
      customerId: match?.id ?? `own:${clientId}`,
      name: match?.name ?? (name.trim() || plateText(typed) || 'Walk-in'),
      scheduledAt: timing.scheduledAt,
      status: timing.status,
      doneAt: null,
      car: null,
      lines: [...lines.map((line) => ({ serviceId: line.id, label: line.name, qty: 1 })), ...(otherPaise ? [{ serviceId: null, label: other!.label.trim(), qty: 1 }] : [])],
      payment,
      remindInDays: remind ? interval : null,
      visitNumber: 0,
    };
    setSaving(true);
    try {
      const { job, queued } = await saveWalkIn(input, preview);
      if (queued) toast.info('No signal. Saved on this phone; it sends when you are back online.');
      router.replace(`/home?added=${encodeURIComponent(queued ? job.clientId : job.id)}` as Href);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the job. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <BookScreen
      gap={18}
      hasNav={false}
      footer={
        <View style={styles.bar}>
          <View style={styles.flex}>
            <T variant="over" color={colors.textMuted}>
              {isOwner ? `Total · ${count} ${count === 1 ? 'service' : 'services'}` : `${count} ${count === 1 ? 'service' : 'services'}`}
            </T>
            {isOwner ? (
              <T num size={22} weight={600}>
                {rupees(totalPaise) ?? '₹0'}
              </T>
            ) : null}
          </View>
          <RedButton onPress={() => void save()} disabled={!ready || saving} height={52} radius={18} style={styles.save}>
            {saving ? 'Saving…' : 'Save job'}
          </RedButton>
        </View>
      }
    >
      <BackHeader
        title="New walk-in job"
        close
        right={
          offline ? (
            <View style={styles.noSignal}>
              <View style={styles.amberDot} />
              <T size={11} weight={500} color="#F5C46B">
                No signal
              </T>
            </View>
          ) : null
        }
      />

      <View style={styles.group}>
        <T variant="t4" weight={600} color="#D4D4DA">
          Number plate or phone
        </T>
        <BookInput
          height={52}
          value={typed}
          onChangeText={(text) => {
            setTyped(text);
            setChosen(null);
            setCleared(true);
          }}
          placeholder="TN 09 AB 4521 or 98400 12345"
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel="Number plate or phone"
        />
        {plateText(typed) && !looksLikePhone && /\d/.test(typed) ? <Plate plate={typed} /> : null}
        {match ? (
          <CustomerMatch
            row={match}
            chosen
            onPress={() => {
              setChosen(null);
              setCleared(true);
            }}
          />
        ) : suggestion ? (
          <CustomerMatch row={suggestion} chosen={false} onPress={() => setChosen(suggestion)} />
        ) : typed.trim().length >= 3 ? (
          <View style={styles.pair}>
            <BookInput value={name} onChangeText={setName} placeholder="Customer's name" accessibilityLabel="Customer's name" style={styles.flex} />
            <BookInput value={car} onChangeText={setCar} placeholder="Car (Hyundai Creta)" accessibilityLabel="Car" style={styles.flex} />
          </View>
        ) : null}
      </View>

      <View style={styles.group}>
        <T variant="t4" weight={600} color="#D4D4DA">
          Services, from your price list
        </T>
        <View style={styles.grid}>
          {(services.data ?? []).map((service) => (
            <PickTile
              key={service.id}
              title={service.name}
              sub={[rupees(service.pricePaise), service.durationMins ? `${service.durationMins} min` : null].filter(Boolean).join(' · ')}
              on={picked.includes(service.id)}
              onPress={() => setPicked((list) => (list.includes(service.id) ? list.filter((id) => id !== service.id) : [...list, service.id]))}
            />
          ))}
          <PickTile title="+ Other" sub="Type a job and price" on={other !== null} onPress={() => setOther((value) => (value ? null : { label: '', rupees: '' }))} />
        </View>
        {other ? (
          <View style={styles.pair}>
            <BookInput value={other.label} onChangeText={(label) => setOther({ ...other, label })} placeholder="Headlight polish" accessibilityLabel="The job" style={styles.flex} />
            <BookInput
              value={other.rupees}
              onChangeText={(text) => setOther({ ...other, rupees: text.replace(/[^\d.]/g, '') })}
              placeholder="₹ price"
              keyboardType="numeric"
              accessibilityLabel="Price in rupees"
              style={styles.price}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.group}>
        <T variant="t4" weight={600} color="#D4D4DA">
          When
        </T>
        <Seg<WhenChoice>
          label="When"
          value={when}
          options={WHEN}
          onChange={(next) => {
            setWhen(next);
            if (next === 'pick') setShowPicker(true);
          }}
        />
        {when === 'pick' ? (
          <Pressable accessibilityRole="button" onPress={() => setShowPicker(true)}>
            <T variant="t3" color={colors.textSecondary}>
              {time ? time.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : 'Tap to pick a time'}
            </T>
          </Pressable>
        ) : null}
        {showPicker ? (
          <DateTimePicker
            mode="time"
            value={time ?? new Date()}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, date) => {
              setShowPicker(Platform.OS === 'ios');
              if (event.type === 'set' && date) setTime(date);
            }}
          />
        ) : null}
      </View>

      <View style={styles.group}>
        <T variant="t4" weight={600} color="#D4D4DA">
          Payment
        </T>
        <Seg<JobPayment> label="Payment" value={payment} options={PAYMENTS} onChange={setPayment} />
      </View>

      <Edge radius={18} innerStyle={styles.remind}>
        <View style={styles.flex}>
          <T variant="t3" weight={600}>
            Remind to wash again
          </T>
          <T size={12} color={colors.textSecondary}>
            {remind ? `${remindLine(interval, new Date())} · from your WhatsApp` : 'Off for this job'}
          </T>
        </View>
        <Switch checked={remind} onChange={setRemind} label="Remind to wash again" />
      </Edge>

      <Footnote>
        {offline
          ? 'No signal: the job is saved on this phone and sent as soon as you are back online.'
          : 'Saved jobs show on Today straight away. Walk-ins never change your Detlio slots.'}
      </Footnote>
    </BookScreen>
  );
}

function CustomerMatch({ row, chosen, onPress }: { row: BookCustomerRow; chosen: boolean; onPress: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  const firstCar = row.cars[0];
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: chosen }} onPress={onPress}>
      <Edge radius={18} innerStyle={styles.match}>
        <Disc name={row.name} size={36} />
        <View style={styles.flex}>
          <T variant="t3" weight={600} numberOfLines={1}>
            {`${row.name}${firstCar && carName(firstCar) ? ` · ${carName(firstCar)}` : ''}`}
          </T>
          <T size={12} color={colors.textSecondary} numberOfLines={1}>
            {`Your customer · ${row.visits} ${row.visits === 1 ? 'visit' : 'visits'}${row.lastVisitAt ? ` · last ${shortDate(row.lastVisitAt)}` : ''}${chosen ? '' : ' · tap to use'}`}
          </T>
        </View>
        <RedLight state={chosen ? 'on' : 'dim'} width={18} />
      </Edge>
    </Pressable>
  );
}

/**
 * A tab screen stays mounted between visits, so each visit gets a fresh form and a new client
 * id: the same id again would be the last walk-in on the server, not a new one.
 */
function FreshWalkIn() {
  const [visit, setVisit] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setVisit((n) => n + 1);
    }, [])
  );
  return <NewWalkInScreen key={visit} />;
}

export default garageScreen(FreshWalkIn);

const useStyles = createStyles(() => ({
  flex: { flex: 1, minWidth: 0 },
  group: { gap: 8 },
  pair: { flexDirection: 'row', gap: 8 },
  price: { width: 120 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  match: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  remind: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  noSignal: {
    height: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  amberDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F5A524' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  save: { paddingHorizontal: 28 },
}));
