import { useUpdateWashInterval } from '@repo/core/api/hooks/use-home';
import type { HomeCar, HomeRightTile } from '@repo/core/api/home';
import type { WashIntervalDays } from '@repo/core/api/users';
import { bookAgainPathFor, withdrawnPathFor } from '@repo/core/book-again';
import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types';
import { formatClock, formatDay } from '@repo/core/format';
import { bookingDayLabel, WASH_INTERVAL_CHOICES, WASH_INTERVAL_DEFAULT_NOTE, washLine, washMeter } from '@repo/core/home-display';
import { msg, t, tn, useT } from '@repo/core/i18n';
import { formatRupees } from '@repo/core/job-records';
import { PICKUP_STAGE_NOW } from '@repo/core/pickup';
import {
  IconBuildingStore,
  IconCalendarEvent,
  IconCheck,
  IconDroplet,
  IconPhoto,
  IconRepeat,
  IconSpeakerphone,
  type IconProps,
} from '@repo/native-ui/icons';
import { Disc, HubCard, PressRow } from '@repo/native-ui/primitives';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { type Href, router } from 'expo-router';
import { useState, type ReactElement, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { errorText } from '@/lib/error-text';
import { WashGauge } from '@/components/moments/wash-gauge';

const NEXT_LABELS: Record<string, string> = { pending: msg('Requested'), confirmed: msg('Next booking'), in_progress: msg('Being washed now') };

export function Tile({
  label,
  icon: Icon,
  onPress,
  children,
}: {
  label: string;
  icon: (props: IconProps) => ReactElement;
  onPress: () => void;
  children: ReactNode;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <PressRow onPress={onPress} style={styles.tileWrap}>
      <HubCard style={styles.tile}>
        <View style={styles.tileHead}>
          {/* Two lines, so a longer label (Tamil) wraps rather than ends in an ellipsis. */}
          <T size={13} numberOfLines={2} color={colors.dim} style={styles.shrink}>
            {label}
          </T>
          <Disc>
            <Icon size={20} stroke={1.5} />
          </Disc>
        </View>
        {children}
      </HubCard>
    </PressRow>
  );
}

function Big({ children }: { children: ReactNode }) {
  return (
    <T num size={40} weight={500} lh={40} tracking={-0.045}>
      {children}
    </T>
  );
}

function bookAgainPrice(tile: Extract<HomeRightTile, { kind: 'book_again' }>): string {
  if (tile.price === null) return t('Price at checkout');
  // A no-fee inspection (0073): nothing is priced yet, never "Inspection fee ₹0".
  if (tile.pricedOnInspection && !(Number(tile.price) > 0)) return t('Price on inspection');
  const amount = formatRupees(Number(tile.price));
  return tile.pricedOnInspection ? t('Inspection fee {amount}', { amount }) : amount;
}

/** RightTile: what is next for this car. The server decides which; this draws it. */
export function RightTile({ tile, onBook }: { tile: HomeRightTile; onBook?: () => void }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const open = (href: string, book?: boolean) => () => {
    if (book) onBook?.();
    if (href === '/garages') router.navigate(href as Href);
    else router.push(href as Href);
  };
  const Foot = ({ big, line }: { big: string; line: string }) => (
    <>
      <View style={styles.spring} />
      <T size={22} lh={25} tracking={-0.022} numberOfLines={2}>
        {big}
      </T>
      <T size={13} lh={17} numberOfLines={2} color={colors.dim} style={styles.foot}>
        {line}
      </T>
    </>
  );

  switch (tile.kind) {
    case 'next_booking': {
      const [time, meridiem] = formatClock(tile.scheduledAt).split(' ');
      const unpaid = tile.paymentStatus === 'unpaid';
      const stage = tile.pickupStage && tile.pickupStage !== 'booked' ? t(PICKUP_STAGE_NOW[tile.pickupStage]) : null;
      return (
        <Tile label={stage ?? (NEXT_LABELS[tile.status] ? t(NEXT_LABELS[tile.status]) : t('Next booking'))} icon={IconCalendarEvent} onPress={open(`/bookings/${tile.bookingId}`)}>
          <View style={styles.noticeSpace}>
            {tile.notice ? (
              <View style={styles.notice}>
                <IconSpeakerphone size={14} stroke={1.5} color={colors.textMuted} />
                <T size={12} lh={16} numberOfLines={2} color={colors.textRead} style={styles.shrink}>
                  {tile.notice.title}
                </T>
              </View>
            ) : null}
          </View>
          <View style={styles.bigRow}>
            <Big>{time}</Big>
            <T size={13} color={colors.dim}>
              {meridiem}
            </T>
          </View>
          {unpaid ? (
            <T size={13} weight={500} lh={17} style={styles.foot}>
              {t('Pay to hold your slot')}
            </T>
          ) : (
            <View style={styles.foot}>
              <T size={13} weight={500} lh={17}>
                {formatDay(tile.scheduledAt)}
              </T>
              <T size={13} lh={17} color={colors.dim}>
                {t(BOOKING_TYPE_LABELS[tile.bookingType])}
              </T>
            </View>
          )}
        </Tile>
      );
    }
    case 'photos': {
      const total = tile.before + tile.after;
      return (
        <Tile label={t('Before & after')} icon={IconPhoto} onPress={open(`/bookings/${tile.bookingId}`)}>
          <Foot big={tn(total, '{count} photo', '{count} photos')} line={`${tile.vendorName} · ${bookingDayLabel(tile.at)}`} />
        </Tile>
      );
    }
    case 'book_again':
      if (!tile.available) {
        return (
          <Tile label={t('Book again')} icon={IconRepeat} onPress={open(withdrawnPathFor(tile), true)}>
            <Foot big={t('Pick a service')} line={t('{name} changed its services', { name: tile.vendorName })} />
          </Tile>
        );
      }
      return (
        <Tile label={t('Book again')} icon={IconRepeat} onPress={open(bookAgainPathFor(tile), true)}>
          <Foot big={tile.serviceLabel} line={`${tile.vendorName} · ${bookAgainPrice(tile)}`} />
        </Tile>
      );
    case 'garage_unavailable':
      return (
        <Tile label={t('Book again')} icon={IconBuildingStore} onPress={open('/garages', true)}>
          <View style={styles.spring} />
          <T size={15} lh={20} numberOfLines={3}>
            {t("{vendorName} isn't taking bookings right now", { vendorName: tile.vendorName })}
          </T>
          <T size={13} weight={500} numberOfLines={1} style={styles.foot}>
            {t('See other garages')}
          </T>
        </Tile>
      );
    case 'nothing_booked':
      return (
        <Tile label={t('Next booking')} icon={IconCalendarEvent} onPress={open('/garages', true)}>
          <Foot big={t('Nothing booked')} line={t('Pick a garage')} />
        </Tile>
      );
  }
}

/** 7, 10, 14, 21 or 30 days, or the default. Saved as soon as one is tapped. */
function WashIntervalSheet({ car, open, onClose }: { car: HomeCar; open: boolean; onClose: () => void }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const save = useUpdateWashInterval();
  const current: WashIntervalDays | null = car.wash.isDefaultInterval ? null : (car.wash.intervalDays as WashIntervalDays);

  const pick = (days: WashIntervalDays | null) => {
    if (save.isPending) return;
    if (days === current) {
      onClose();
      return;
    }
    save.mutate(
      { vehicleId: car.id, days },
      { onSuccess: onClose, onError: (error) => toast.error(errorText(error, t("Couldn't save that. Try again."))) }
    );
  };

  const option = (days: WashIntervalDays | null, label: string) => {
    const chosen = days === current;
    return (
      <Pressable
        key={label}
        accessibilityRole="radio"
        accessibilityState={{ checked: chosen }}
        disabled={save.isPending}
        onPress={() => pick(days)}
        style={[styles.interval, { borderColor: chosen ? colors.textPrimary : colors.line }]}
      >
        <T size={15} color={chosen ? colors.textPrimary : colors.textSecondary}>
          {label}
        </T>
        {chosen ? <IconCheck size={18} stroke={1.8} /> : null}
      </Pressable>
    );
  };

  return (
    <ScSheet open={open} onClose={onClose} dismissible={!save.isPending} accessibilityLabel={t('How often to wash')} horizontalPadding={16}>
      <T size={19} weight={500}>
        {t('How often to wash')}
      </T>
      <T size={13} color={colors.textSecondary} style={styles.sheetLine}>
        {car.make} {car.model}. {t(WASH_INTERVAL_DEFAULT_NOTE)}
      </T>
      <View style={styles.intervals}>
        {WASH_INTERVAL_CHOICES.map((days) => option(days, t('Every {days} days', { days })))}
        {option(null, t('Default'))}
      </View>
    </ScSheet>
  );
}

/** WashStatusTile: all the server's reckoning, in IST. A tap picks how often. */
export function WashStatusTile({ car, now }: { car: HomeCar; now: Date }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const { wash } = car;
  const meter = washMeter(wash);
  const line = washLine(wash, now);
  const days = wash.daysSinceWash;
  return (
    <>
      <Tile label={t('Last wash')} icon={IconDroplet} onPress={() => setOpen(true)}>
        <View style={styles.meterSpace}>
          {/* The dashboard start-up (moment 7): the needle sweeps once and settles. */}
          <WashGauge daysSinceWash={days} intervalDays={wash.intervalDays} over={meter.over} />
        </View>
        <View style={styles.bigRow}>
          {days === null ? (
            <Big>–</Big>
          ) : days === 0 ? (
            <T size={22} lh={22} tracking={-0.022}>
              {t('Today')}
            </T>
          ) : (
            <>
              <Big>{days}</Big>
              <T size={13} color={colors.dim}>
                {days === 1 ? t('day ago') : t('days ago')}
              </T>
            </>
          )}
        </View>
        <View style={[styles.washLine, styles.foot]}>
          {wash.state === 'booked' ? <IconCheck size={14} stroke={1.6} /> : null}
          <T size={13} lh={17} numberOfLines={2} color={colors.dim} style={styles.shrink}>
            {line.lead ? (
              <T size={13} lh={17} weight={500} color={wash.state === 'overdue' ? colors.warning : colors.textPrimary}>
                {line.lead}
              </T>
            ) : null}
            {line.rest}
          </T>
        </View>
      </Tile>
      <WashIntervalSheet car={car} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

const useStyles = createStyles((c) => ({
  shrink: { flexShrink: 1, minWidth: 0 },
  tileWrap: { flex: 1, minWidth: 0 },
  tile: { flex: 1, minHeight: 164, paddingTop: 14, paddingRight: 14, paddingBottom: 18, paddingLeft: 20 },
  tileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  spring: { flex: 1 },
  foot: { marginTop: 8 },
  noticeSpace: { flex: 1, minHeight: 0, justifyContent: 'flex-end', paddingBottom: 12 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginRight: -6 },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  meterSpace: { flex: 1, justifyContent: 'flex-end', paddingRight: 6, paddingBottom: 12 },
  meter: { flexDirection: 'row', gap: 3 },
  step: { flex: 1, height: 6, borderRadius: 3 },
  washLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  sheetLine: { marginTop: 4 },
  intervals: { marginTop: 16, gap: 8 },
  interval: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, borderWidth: 1, paddingHorizontal: 16 },
}));
