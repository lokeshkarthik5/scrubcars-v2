import type { OpeningDay } from '@repo/core/opening-hours';
import { fill, useT } from '@repo/core/i18n';
import type { Booking } from '@repo/core/types';
import { type Href, router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { ClosedCard, Dot, Hatch } from '@/components/calendar-parts';
import {
  type CalendarClosure,
  type CalendarJob,
  type CalendarKind,
  type Gap,
  type GarageRoom,
  HOUR_PX,
  KIND_LABELS,
  answerLine,
  blockLabel,
  closedDay,
  dayButtonLabel,
  dayHours,
  dayOfMonth,
  daySummary,
  freeGaps,
  hourLabel,
  minuteClock,
  nextQuarter,
  nowMinute,
  packLanes,
  shortClock,
  shortName,
  stripNote,
  timelineFor,
  weekdayShort,
} from '@/lib/jobs';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import type { Tokens } from '@repo/native-ui/tokens';

const LABELS_PX = 44;
const LANES_LEFT_PX = 50;
const MIN_LANE_PX = 64;
const LANE_GAP_PX = 6;

/**
 * CalendarDay (apps/vendors/components/calendar-day.tsx): the week's seven days,
 * then the chosen day's opening hours as a timeline, an hour to 56 points; the
 * at-garage lanes as many as the garage's bays, and an "On the road" lane.
 */
export function CalendarDay({
  day,
  today,
  now,
  week,
  bookings,
  jobsByDay,
  hours,
  closures,
  room,
  onPick,
}: {
  day: string;
  today: string;
  now: number;
  week: string[];
  /** The whole list, for what holds the garage's room (the Free boxes). */
  bookings: readonly Booking[];
  jobsByDay: Map<string, CalendarJob[]>;
  hours: readonly OpeningDay[];
  closures: readonly CalendarClosure[];
  room: GarageRoom;
  onPick: (day: string) => void;
}) {
  const styles = useStyles();
  const jobs = jobsByDay.get(day) ?? [];
  const closed = closedDay(day, hours, closures);
  return (
    <>
      <View style={styles.strip}>
        {week.map((d) => (
          <StripDay
            key={d}
            day={d}
            today={today}
            selected={d === day}
            jobs={jobsByDay.get(d)}
            closed={closedDay(d, hours, closures) !== null}
            onPick={onPick}
          />
        ))}
      </View>
      {closed ? <ClosedCard closed={closed} /> : null}
      {!closed || jobs.length > 0 ? (
        <Timeline
          day={day}
          today={today}
          now={now}
          bookings={bookings}
          jobs={jobs}
          hours={hours}
          room={room}
          closed={closed !== null}
        />
      ) : null}
    </>
  );
}

function StripDay({
  day,
  today,
  selected,
  jobs,
  closed,
  onPick,
}: {
  day: string;
  today: string;
  selected: boolean;
  jobs: CalendarJob[] | undefined;
  closed: boolean;
  onPick: (day: string) => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const summary = daySummary(jobs);
  const note = stripNote(day, today, summary, closed);
  const isToday = day === today;
  const ink = closed && !selected ? colors.dim : colors.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dayButtonLabel(day, { today, summary, closed, long: true })}
      accessibilityState={{ selected }}
      onPress={() => onPick(day)}
      style={[
        styles.stripDay,
        selected ? styles.stripSelected : closed ? styles.stripClosed : null,
        isToday && styles.stripToday,
      ]}
    >
      {closed && !selected ? <Hatch /> : null}
      <T
        size={11}
        lh={14}
        weight={isToday ? 600 : 400}
        color={isToday ? colors.tones.new.text : closed ? ink : colors.textMuted}
      >
        {isToday ? t('Today') : weekdayShort(day)}
      </T>
      <T num size={18} lh={22} weight={isToday || selected ? 700 : 600} color={ink}>
        {dayOfMonth(day)}
      </T>
      <View style={styles.note}>
        {note?.kind === 'closed' ? (
          <T size={11} lh={14} color={ink}>
            {t('Closed')}
          </T>
        ) : null}
        {note?.kind === 'done' ? (
          <T size={11} lh={14} color={colors.tones.done.text}>
            {fill(t('{count} done'), {
              count: (
                <T num size={11} lh={14} color={colors.tones.done.text}>
                  {note.count}
                </T>
              ),
            })}
          </T>
        ) : null}
        {note?.kind === 'today' ? (
          <T size={11} lh={14}>
            {fill(note.count === 1 ? t('{count} job') : t('{count} jobs'), {
              count: (
                <T num size={11} lh={14}>
                  {note.count}
                </T>
              ),
            })}
          </T>
        ) : null}
        {note?.kind === 'count' ? (
          <>
            <Dot kind={note.tone} />
            <T num size={11} lh={14} color={colors.textSecondary}>
              {note.count}
            </T>
          </>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Each state's block, as the web draws it. */
function blockTone(colors: Tokens, kind: CalendarKind) {
  switch (kind) {
    case 'done':
      return { border: colors.successBorder, fill: colors.tones.done.tint, text: colors.tones.done.text, dashed: false };
    case 'working':
      return { border: colors.progressBorder, fill: colors.tones.progress.tint, text: colors.tones.progress.text, dashed: false };
    case 'accepted':
      return { border: colors.progressSoftBorder, fill: colors.progressSoftFill, text: colors.tones.progress.text, dashed: false };
    case 'answer':
      return { border: colors.red, fill: colors.tones.new.tint, text: colors.tones.new.text, dashed: true };
  }
}

function Timeline({
  day,
  today,
  now,
  bookings,
  jobs,
  hours: weekly,
  room,
  closed,
}: {
  day: string;
  today: string;
  now: number;
  bookings: readonly Booking[];
  jobs: CalendarJob[];
  hours: readonly OpeningDay[];
  room: GarageRoom;
  closed: boolean;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const { bays } = room;
  const hours = dayHours(day, weekly);
  const line = timelineFor(hours, jobs);
  const garage = packLanes(
    jobs.filter((job) => !job.onTheRoad),
    bays
  );
  const road = packLanes(
    jobs.filter((job) => job.onTheRoad),
    1
  );
  const lanes = [...garage, ...road];
  const px = (minutes: number) => ((minutes - line.startMin) * HOUR_PX) / 60;
  const height = px(line.endMin);
  const bayCount = bays && bays > 0 ? Math.floor(bays) : 1;
  // Only where customers can book, and the whole garage has a bay to spare (freeGaps).
  const offerFree = !closed && hours.known && day >= today;
  const free = offerFree
    ? freeGaps({ lanes: garage, bookings, day, hours, fromMin: day === today ? nextQuarter(now) : 0, room })
    : [];
  const nowAt = day === today ? nowMinute(now) : null;
  const minWidth = LANES_LEFT_PX + lanes.length * MIN_LANE_PX + (lanes.length - 1) * LANE_GAP_PX;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.grow}>
      <View style={[styles.grow, { minWidth }]}>
        <View style={styles.heads}>
          <View style={{ width: LABELS_PX - LANE_GAP_PX }} />
          {/* Detlio doesn't put bookings in bays, so the lanes say none. */}
          <View style={[styles.headCell, { flex: garage.length }]}>
            <T size={12} weight={600} color={colors.textSecondary} align="center" numberOfLines={1}>
              {`${t('At the garage')} `}
              <T size={12} color={colors.textMuted}>
                {'· '}
                {fill(bayCount === 1 ? t('{count} bay') : t('{count} bays'), {
                  count: (
                    <T num size={12} color={colors.textMuted}>
                      {bayCount}
                    </T>
                  ),
                })}
              </T>
            </T>
          </View>
          <View style={[styles.headCell, { flex: road.length }]}>
            <T size={12} weight={600} color={colors.textSecondary} align="center" numberOfLines={1}>
              {t('On the road')}
            </T>
          </View>
        </View>

        <View style={{ height }}>
          {line.hours.map((mark, i) => (
            <View key={mark} pointerEvents="none" style={[styles.hourRow, { top: px(mark) }]}>
              <View style={styles.hourLine} />
              <T num size={11} lh={14} color={colors.textMuted} style={styles.hourLabel}>
                {hourLabel(mark, i === 0)}
              </T>
            </View>
          ))}

          {hours.known && !closed && hours.closeMin < line.endMin ? (
            <View
              style={[styles.closeBand, { top: px(hours.closeMin), height: px(line.endMin) - px(hours.closeMin) }]}
            >
              <Hatch />
              <T size={11} lh={14} color={colors.dim}>
                {t('Closes {time}', { time: minuteClock(hours.closeMin) })}
              </T>
            </View>
          ) : null}

          <View style={styles.lanes}>
            {lanes.map((lane, i) => (
              <View key={i} style={styles.lane}>
                {/* Road lanes come after the garage's, so have no list here. */}
                {(free[i] ?? []).map((gap) => (
                  <FreeBox key={gap.startMin} gap={gap} top={px(gap.startMin)} />
                ))}
                {lane.map((job, j) => {
                  const next = lane[j + 1]?.startMin;
                  return (
                    <Block
                      key={job.booking.id}
                      job={job}
                      now={now}
                      top={px(job.startMin) + 1}
                      trueHeight={px(job.endMin) - px(job.startMin) - 2}
                      room={next === undefined ? Infinity : px(next) - px(job.startMin) - 4}
                    />
                  );
                })}
              </View>
            ))}
          </View>

          {nowAt !== null && nowAt >= line.startMin && nowAt <= line.endMin ? (
            <View pointerEvents="none" style={[styles.now, { top: px(nowAt) }]}>
              <View style={styles.nowLine} />
              <View style={styles.nowDot} />
              <T num size={10} lh={14} weight={700} color={colors.tones.new.text} style={styles.nowLabel}>
                {shortClock(nowAt)}
              </T>
            </View>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

/** One job; at least 44 points tall to tap, unless the next job in its lane starts sooner. */
function Block({
  job,
  now,
  top,
  trueHeight,
  room,
}: {
  job: CalendarJob;
  now: number;
  top: number;
  trueHeight: number;
  room: number;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const b = job.booking;
  const height = Math.max(trueHeight, Math.min(44, room));
  const tone = blockTone(colors, job.kind);
  const status = job.kind === 'answer' ? answerLine(b, now) : t(KIND_LABELS[job.kind]);
  const service = b.items[0]?.name ?? b.serviceSummary;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={blockLabel(job, now)}
      onPress={() => router.push(`/bookings/${b.id}` as Href)}
      style={[
        styles.block,
        { top, height, borderColor: tone.border, backgroundColor: tone.fill, borderStyle: tone.dashed ? 'dashed' : 'solid' },
      ]}
    >
      <T size={12} lh={16} weight={600} numberOfLines={1}>
        {shortName(b.customerName)}
      </T>
      {height >= 96 ? (
        <>
          <T size={11} lh={14} color={colors.textSecondary} numberOfLines={1}>
            {service}
          </T>
          {b.vehicle ? (
            <T size={11} lh={14} color={colors.textSecondary} numberOfLines={1}>
              {`${b.vehicle.make} ${b.vehicle.model}`}
            </T>
          ) : null}
          <T num size={11} lh={14} color={colors.textMuted}>
            {`${shortClock(job.startMin)} – ${shortClock(job.endMin)}`}
          </T>
        </>
      ) : null}
      <T
        size={11}
        lh={14}
        weight={job.kind === 'answer' || job.kind === 'working' ? 600 : 400}
        color={tone.text}
        numberOfLines={1}
        style={height >= 96 ? styles.bottom : null}
      >
        {status}
      </T>
      {height >= 56 && height < 96 ? (
        <T size={11} lh={14} color={colors.textSecondary} numberOfLines={1}>
          {service}
        </T>
      ) : null}
    </Pressable>
  );
}

/** A stretch of free time in a lane: "Free 1:00 – 3:30". */
function FreeBox({ gap, top }: { gap: Gap; top: number }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const height = ((gap.endMin - gap.startMin) * HOUR_PX) / 60 - 2;
  return (
    <View pointerEvents="none" style={[styles.free, { top: top + 1, height }]}>
      <T size={11} lh={14} weight={600} color={colors.textSecondary}>
        {t('Free')}
      </T>
      <T num size={11} lh={14} color={colors.textMuted}>
        {`${shortClock(gap.startMin)} – ${shortClock(gap.endMin)}`}
      </T>
    </View>
  );
}

const useStyles = createStyles((colors) => ({
  strip: { flexDirection: 'row', gap: 4 },
  stripDay: {
    flex: 1,
    minWidth: 0,
    height: 66,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    overflow: 'hidden',
  },
  stripSelected: { backgroundColor: colors.surfaceElevated },
  stripClosed: { backgroundColor: colors.canvas },
  stripToday: { borderColor: colors.red },
  note: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 16 },
  grow: { flexGrow: 1 },
  heads: { flexDirection: 'row', gap: LANE_GAP_PX, paddingTop: 2, paddingBottom: 8 },
  headCell: { minWidth: 0 },
  hourRow: { position: 'absolute', left: 0, right: 0 },
  hourLine: { position: 'absolute', left: 0, right: 0, top: 0, height: 1, backgroundColor: colors.line },
  hourLabel: { position: 'absolute', left: 0, top: -7, width: 40, backgroundColor: colors.canvas },
  closeBand: {
    position: 'absolute',
    left: LANES_LEFT_PX,
    right: 0,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  lanes: { position: 'absolute', top: 0, bottom: 0, left: LANES_LEFT_PX, right: 0, flexDirection: 'row', gap: LANE_GAP_PX },
  lane: { flex: 1, minWidth: 0 },
  block: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 5,
    gap: 2,
    overflow: 'hidden',
  },
  bottom: { marginTop: 'auto' },
  free: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.outlineSoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  now: { position: 'absolute', left: 0, right: 0, zIndex: 2 },
  nowLine: { position: 'absolute', left: 40, right: 0, top: -1, height: 2, borderRadius: 1, backgroundColor: colors.red },
  nowDot: { position: 'absolute', left: 34, top: -5, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.red },
  nowLabel: { position: 'absolute', left: 0, top: -7, paddingRight: 2, backgroundColor: colors.canvas },
}));
