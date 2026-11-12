import type { HomeActionCard } from '@repo/core/api/home';
import { reminderBookHref, reminderDueLine } from '@repo/core/car-history';
import { formatClock, formatWhen } from '@repo/core/format';
import { bookingDayLabel } from '@repo/core/home-display';
import { fill, t, useT, useTn } from '@repo/core/i18n';
import { formatRupees } from '@repo/core/job-records';
import { ScButton } from '@repo/native-ui/button';
import {
  IconArrowUpRight,
  IconBuildingStore,
  IconCalendarOff,
  IconCar,
  IconMessageCheck,
  IconSparkles,
  IconStar,
  IconX,
} from '@repo/native-ui/icons';
import { HubCard, PressRow } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

type Card<K extends HomeActionCard['kind']> = Extract<HomeActionCard, { kind: K }>;

const go = (href: string) => router.push(href as Href);

/** Where each card's buttons go: the booking's own page does the paying and moving. */
export const bookingActionPath = (bookingId: string, then?: 'pay' | 'reschedule' | 'help' | 'times' | 'extra') =>
  `/bookings/${bookingId}${then ? `?then=${then}` : ''}`;

function raisedLabel(iso: string, now: Date): string {
  const day = bookingDayLabel(iso);
  return day === bookingDayLabel(now.toISOString()) ? t('Today') : day;
}

function NeedsYou({ vendorName }: { vendorName: string }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.needs}>
      <View style={styles.dot} />
      <T size={13} numberOfLines={1} color={colors.dim} style={styles.shrink}>
        {t('Needs you · {vendorName}', { vendorName })}
      </T>
    </View>
  );
}

/** The full-width red pill a must-act card ends on: the screen's one main action. */
function Pill({ href, label, children }: { href: string; label?: string; children: ReactNode }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <ScButton variant="hero" accessibilityLabel={label} onPress={() => go(href)} style={styles.pill}>
      {children}
      <IconArrowUpRight size={17} stroke={1.5} color={colors.white} />
    </ScButton>
  );
}

function PillWords({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <T size={15} weight={500} lh={20} color={colors.white}>
      {children}
    </T>
  );
}

function MoreLink({ words }: { words: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="link" onPress={() => go('/updates')} style={styles.more}>
      <T size={13} color={colors.textMuted} style={styles.underline}>
        {words}
      </T>
    </Pressable>
  );
}

export function BillDueCard({ card, now }: { card: Card<'bill_due'>; now: Date }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const amount = formatRupees(Number(card.amountDue));
  return (
    <HubCard style={styles.card}>
      <NeedsYou vendorName={card.vendorName} />
      <T size={20} lh={24} tracking={-0.015} style={styles.title}>
        {t('Pay your final bill')}
      </T>
      <T size={15} color={colors.dim} style={styles.line}>
        {card.serviceName} · <T num size={15}>{amount}</T> · {raisedLabel(card.raisedAt, now)}
      </T>
      <Pill href={bookingActionPath(card.bookingId, 'pay')} label={t('Pay {amount}', { amount })}>
        <PillWords>
          {fill(t('Pay {amount}'), { amount: <T num size={15} weight={500} lh={20} color={colors.white}>{amount}</T> })}
        </PillWords>
      </Pill>
      {card.moreDue > 0 ? <MoreLink words={t('+{count} more to pay', { count: card.moreDue })} /> : null}
    </HubCard>
  );
}

export function TimeProposalHomeCard({ card }: { card: Card<'time_proposal'> }) {
  const tn = useTn();
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <HubCard style={styles.card}>
      <NeedsYou vendorName={card.vendorName} />
      <T size={20} lh={24} tracking={-0.015} style={styles.title}>
        {fill(t("Can't do {time} — pick another time"), { time: <T num size={20} lh={24}>{formatClock(card.scheduledAt)}</T> })}
      </T>
      <T size={15} color={colors.dim} style={styles.line}>
        {fill(tn(card.options.length, '1 time offered · answer by {when}', '{count} times offered · answer by {when}'), { when: <T num size={15} color={colors.dim}>{formatWhen(card.expiresAt)}</T> })}
      </T>
      <Pill href={bookingActionPath(card.bookingId, 'times')}>
        <PillWords>{t('Pick a time')}</PillWords>
      </Pill>
    </HubCard>
  );
}

export function ExtraWorkHomeCard({ card, now }: { card: Card<'extra_work_due'>; now: Date }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const amount = formatRupees(Number(card.amount));
  return (
    <HubCard style={styles.card}>
      <NeedsYou vendorName={card.vendorName} />
      <T size={20} lh={24} tracking={-0.015} style={styles.title}>
        {t('Approve extra work')}
      </T>
      <T size={15} color={colors.dim} style={styles.line}>
        {card.description} · <T num size={15}>{amount}</T> · {raisedLabel(card.raisedAt, now)}
      </T>
      <Pill href={bookingActionPath(card.bookingId, 'extra')} label={t('Review and approve {amount}', { amount })}>
        <PillWords>{t('Review & approve')}</PillWords>
      </Pill>
      {card.moreDue > 0 ? <MoreLink words={t('+{count} more to answer', { count: card.moreDue })} /> : null}
    </HubCard>
  );
}

function Eyebrow({ vendorName }: { vendorName: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.eyebrow}>
      <View style={styles.eyebrowLeft}>
        <IconBuildingStore size={15} stroke={1.5} color={colors.textMuted} />
        <T size={13} numberOfLines={1} color={colors.dim} style={styles.shrink}>
          {vendorName}
        </T>
      </View>
      <IconCalendarOff size={20} stroke={1.5} color={colors.dim} />
    </View>
  );
}

export function GarageClosedCard({ card }: { card: Card<'garage_closed'> }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <HubCard style={styles.card}>
      <Eyebrow vendorName={card.vendorName} />
      <T size={17} weight={500} tracking={-0.012} style={styles.softTitle}>
        {t('Closed on {bookingDayLabel}', { bookingDayLabel: bookingDayLabel(card.scheduledAt) })}
      </T>
      <T size={13} color={colors.dim} style={styles.line}>
        {fill(card.reason === 'holiday' ? t('A holiday, the day of your {time} booking.') : t('Its weekly day off, the day of your {time} booking.'), {
          time: <T num size={13} color={colors.dim}>{formatClock(new Date(card.scheduledAt))}</T>,
        })}
        {card.canChangeTime ? ` ${t('Pick another time, or ask us for help.')}` : ` ${t('Ask us for help with it.')}`}
      </T>
      <View style={styles.row}>
        {card.canChangeTime ? (
          <ScButton variant="quiet" fullWidth={false} onPress={() => go(bookingActionPath(card.bookingId, 'reschedule'))}>
            {t('Change time')}
          </ScButton>
        ) : null}
        <ScButton variant="quiet" fullWidth={false} onPress={() => go(bookingActionPath(card.bookingId, 'help'))}>
          {t('Get help')}
        </ScButton>
      </View>
    </HubCard>
  );
}

export function RateWashCard({ card, onDismiss, dismissing }: { card: Card<'rate'>; onDismiss: () => void; dismissing?: boolean }) {
  const tn = useTn();
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <HubCard accessibilityLabel={t('Rate your wash')} style={styles.rate}>
      <View style={styles.rateHead}>
        <View style={styles.rateWords}>
          <T size={15} weight={500} tracking={-0.01} numberOfLines={2}>
            {t('How was your wash at {vendorName}?', { vendorName: card.vendorName })}
          </T>
          <T size={13} color={colors.dim}>
            {t('{vehicleName} · Rate it', { vehicleName: card.vehicleName })}
          </T>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Hide Rate your wash')} disabled={dismissing} onPress={onDismiss} style={styles.x}>
          <IconX size={20} stroke={1.5} color={colors.dim} />
        </Pressable>
      </View>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((stars) => (
          <Pressable
            key={stars}
            accessibilityRole="button"
            accessibilityLabel={tn(stars, 'Rate {count} star', 'Rate {count} stars')}
            onPress={() => go(`/bookings/${card.bookingId}?rate=${stars}`)}
            style={styles.x}
          >
            <IconStar size={24} stroke={1.3} color={colors.textSoft} />
          </Pressable>
        ))}
      </View>
    </HubCard>
  );
}

export function ComplaintAnswerCard({ card }: { card: Card<'complaint_resolved'> }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <HubCard accessibilityLabel={t('Complaint {number} resolved', { number: card.number })} style={styles.card}>
      <View style={styles.eyebrow}>
        <T num size={13} color={colors.dim}>
          {card.number}
        </T>
        <IconMessageCheck size={20} stroke={1.5} color={colors.dim} />
      </View>
      <View style={styles.complaint}>
        <View style={styles.shrink}>
          <T size={17} weight={500} tracking={-0.012}>
            {t('Complaint resolved')}
          </T>
          <T size={13} numberOfLines={1} color={colors.dim} style={styles.line}>
            {t("We've answered it.")}
          </T>
        </View>
        <ScButton variant="quiet" fullWidth={false} onPress={() => go('/profile/complaints')}>
          {t('See our answer')}
        </ScButton>
      </View>
    </HubCard>
  );
}

export function ServiceReminderHomeCard({
  card,
  now,
  onBook,
  onSnooze,
  onDismiss,
  busy,
}: {
  card: Card<'service_reminder'>;
  now: Date;
  onBook: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
  busy?: boolean;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <HubCard accessibilityLabel={card.title} style={styles.reminder}>
      <View style={styles.rateHead}>
        <View style={styles.rateWords}>
          <PressRow onPress={() => go(`/profile/cars/${card.vehicleId}`)} style={styles.eyebrowLeft}>
            <IconCar size={15} stroke={1.5} color={colors.textMuted} />
            <T size={13} numberOfLines={1} color={colors.dim}>
              {card.vehicleName}
            </T>
          </PressRow>
          <T size={17} weight={500} tracking={-0.012} style={styles.softTitle}>
            {card.title}
          </T>
          <T size={13} color={colors.dim} style={styles.line}>
            {reminderDueLine({ ...card, booked: null }, now)} · {card.reason}
          </T>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Dismiss reminder: {title}', { title: card.title })} disabled={busy} onPress={onDismiss} style={styles.x}>
          <IconX size={20} stroke={1.5} color={colors.dim} />
        </Pressable>
      </View>
      <View style={styles.reminderActions}>
        <ScButton
          variant="quiet"
          fullWidth={false}
          onPress={() => {
            onBook();
            go(reminderBookHref(card));
          }}
        >
          <IconSparkles size={16} stroke={1.5} />
          <T size={15} weight={500} lh={20}>
            {t('Book')}
          </T>
        </ScButton>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Remind me in 2 weeks')} disabled={busy} onPress={onSnooze} style={styles.snooze}>
          <T size={15} color={colors.dim}>
            {t('In 2 weeks')}
          </T>
        </Pressable>
      </View>
    </HubCard>
  );
}

const useStyles = createStyles((c) => ({
  card: { padding: 20 },
  needs: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.red },
  shrink: { flexShrink: 1, minWidth: 0 },
  title: { marginTop: 8 },
  softTitle: { marginTop: 14 },
  line: { marginTop: 4 },
  pill: { marginTop: 16 },
  more: { marginTop: 4, minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  underline: { textDecorationLine: 'underline' },
  eyebrow: { height: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eyebrowLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
  row: { marginTop: 16, flexDirection: 'row', gap: 8 },
  rate: { paddingTop: 4, paddingRight: 6, paddingBottom: 8, paddingLeft: 20 },
  rateHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rateWords: { flex: 1, minWidth: 0, paddingTop: 12 },
  x: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stars: { marginLeft: -10, marginTop: 4, flexDirection: 'row' },
  complaint: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  reminder: { paddingTop: 4, paddingRight: 6, paddingBottom: 16, paddingLeft: 20 },
  reminderActions: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 14 },
  snooze: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
}));
