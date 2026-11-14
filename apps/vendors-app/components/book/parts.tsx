import type { BookJob } from '@repo/core/api/garage-book';
import { carName, detlioJobStatus, initials, jobTime, ownJobStatus, type StatusTone } from '@repo/core/garage-book';
import { t as translateNow, useT } from '@repo/core/i18n';
import { formatIndianPlate, washGaugeAngle, washGaugeShare } from '@repo/core/moments';
import { type Href, router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, type StyleProp, TextInput, type TextInputProps, View, type ViewStyle } from 'react-native';

import { Edge, Pearl, Raised, Recessed, RedLight } from '@repo/native-ui/finish';
import { IconChevronLeft, IconX } from '@repo/native-ui/icons';
import { PressScale } from '@repo/native-ui/motion';
import { PlateDrawing } from '@repo/native-ui/number-plate';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { WashGaugeDial } from '@repo/native-ui/wash-gauge';

/**
 * The parts every Garage Book screen of the app is built from: the native twins of the web
 * portal's components/book/parts.tsx, drawn as the approved mockup draws them (SPEC.md; the
 * finish of PR #120). Read the web file first when changing one.
 */

export const go = (path: string) => router.push(path as Href);

/** The tone colours of a job's status line, as the web's. */
export const TONE: Record<StatusTone, string> = {
  done: '#4ADE80',
  working: '#8DB8FF',
  owed: '#FF8A95',
  quiet: '#A8A8B2',
};

export function Overline({ children, red }: { children: ReactNode; red?: boolean }) {
  const colors = useColors();
  return (
    <T variant="over" color={red ? '#FF8A95' : colors.textMuted}>
      {children}
    </T>
  );
}

/** A page title with a raised Back (or Close) button and a quiet line under it. */
export function BackHeader({
  title,
  sub,
  right,
  close = false,
  onBack,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
  close?: boolean;
  onBack?: () => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={close ? t('Close') : t('Back')}
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : go('/home')))}
      >
        <Raised radius={12} style={styles.square}>
          {close ? <IconX size={18} /> : <IconChevronLeft size={20} />}
        </Raised>
      </PressScale>
      <View style={styles.flex}>
        <T accessibilityRole="header" variant="title" numberOfLines={1}>
          {title}
        </T>
        {sub ? (
          <T variant="t4" weight={400} color={colors.textSecondary} numberOfLines={1}>
            {sub}
          </T>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/**
 * All / Detlio / My own, and the other recessed switches (When, Payment). The label and each
 * option's label are English (msg), translated here.
 */
export function Seg<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: ReadonlyArray<{ value: V; label: string; count?: number }>;
  onChange: (value: V) => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <Recessed radius={18} accessibilityLabel={t(label)} innerStyle={styles.seg}>
      {options.map((option) => {
        const on = option.value === value;
        const label = (
          <View style={styles.segLabel}>
            <T size={13} weight={on ? 600 : 500} color={on ? colors.textPrimary : colors.textSecondary}>
              {t(option.label)}
            </T>
            {option.count !== undefined ? (
              <T num size={13} weight={600} color={on ? colors.textSecondary : colors.textMuted}>
                {option.count}
              </T>
            ) : null}
          </View>
        );
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(option.value)}
            style={styles.segCell}
          >
            {on ? (
              <Raised radius={14} style={styles.segOn} innerStyle={styles.segOnInner}>
                {label}
                <RedLight width={22} style={styles.segLight} />
              </Raised>
            ) : (
              label
            )}
          </Pressable>
        );
      })}
    </Recessed>
  );
}

export function Tag({ detlio, children }: { detlio?: boolean; children?: string }) {
  const styles = useStyles();
  return detlio ? (
    <View style={styles.tagD}>
      <T size={10} weight={700} tracking={0.06} color="#FF8A95">
        DETLIO
      </T>
    </View>
  ) : (
    <View style={styles.tagO}>
      <T size={11} weight={500} color="#C8C8D0">
        {children}
      </T>
    </View>
  );
}

export function jobLine(job: BookJob): string {
  const labels = job.lines.map((line) => ('qty' in line && line.qty > 1 ? `${line.label} ×${line.qty}` : line.label)).join(', ');
  return [labels, job.car?.model || carName(job.car)].filter(Boolean).join(' · ');
}

export function jobStatus(job: BookJob) {
  if (job.source === 'own' && job.pending) return { text: translateNow('Waiting to send · no signal'), tone: 'owed' as const };
  return job.source === 'own'
    ? ownJobStatus({ status: job.status, payment: job.payment, visitNumber: job.visitNumber, totalPaise: job.totalPaise })
    : detlioJobStatus({ status: job.status, paymentMethod: job.paymentMethod, amount: job.amount });
}

/** One job on Today and Jobs: time, who, DETLIO or Walk-in, what, and how it stands. */
export function JobCard({ job, onPress }: { job: BookJob; onPress: () => void }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const status = jobStatus(job);
  return (
    <PressScale accessibilityRole="button" accessibilityLabel={`${jobTime(job.scheduledAt)}, ${job.name}`} onPress={onPress}>
      <Edge radius={18} innerStyle={styles.job}>
        <T num size={17} weight={600} lh={22} style={styles.jobTime}>
          {jobTime(job.scheduledAt)}
        </T>
        <View style={styles.flex}>
          <View style={styles.jobName}>
            <T variant="t3" weight={600} numberOfLines={1} style={styles.shrink}>
              {job.name}
            </T>
            {job.source === 'detlio' ? <Tag detlio /> : <Tag>{t('Walk-in')}</Tag>}
          </View>
          <T variant="t4" weight={400} color={colors.textSecondary} numberOfLines={1} style={styles.jobLine}>
            {jobLine(job)}
          </T>
          {status ? (
            <T size={12} weight={600} color={TONE[status.tone]} style={styles.jobStatus}>
              {status.text}
            </T>
          ) : null}
        </View>
      </Edge>
    </PressScale>
  );
}

export function Tile({ label, value, sub, style }: { label: string; value: ReactNode; sub?: string; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Edge radius={22} style={[styles.tile, style]} innerStyle={styles.tileInner}>
      <Overline>{label}</Overline>
      {typeof value === 'string' || typeof value === 'number' ? (
        <T num size={24} weight={600} lh={30} style={styles.tileValue}>
          {String(value)}
        </T>
      ) : (
        <View style={styles.tileValue}>{value}</View>
      )}
      {sub ? (
        <T size={12} color={colors.textSecondary} numberOfLines={1}>
          {sub}
        </T>
      ) : null}
    </Edge>
  );
}

/** A two-line pick from the price list, its red light waiting or on. */
export function PickTile({ title, sub, on, onPress }: { title: string; sub: string; on: boolean; onPress: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <PressScale accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={styles.pickCell}>
      <Raised radius={18} innerStyle={styles.pick}>
        <T size={14} weight={600} numberOfLines={1}>
          {title}
        </T>
        <T size={12} color={colors.textSecondary} numberOfLines={1}>
          {sub}
        </T>
        <RedLight state={on ? 'on' : 'dim'} style={styles.pickLight} />
      </Raised>
    </PressScale>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked }} onPress={() => onChange(!checked)}>
      <Recessed radius={14} style={styles.switch}>
        {checked ? <RedLight width={12} style={styles.switchLight} /> : null}
        <View style={[styles.knob, checked && styles.knobOn]}>
          <Pearl size={24} />
        </View>
      </Recessed>
    </Pressable>
  );
}

export function Disc({ name, size = 40 }: { name: string; size?: number }) {
  const styles = useStyles();
  return (
    <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }]}>
      <T size={13} weight={600} color="#D4D4DA">
        {initials(name)}
      </T>
    </View>
  );
}

export function IconWell({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.well}>{children}</View>;
}

export function Footnote({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <T size={12} lh={17} color={colors.textSecondary}>
      {children}
    </T>
  );
}

export function Empty({ children }: { children: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Edge radius={18} innerStyle={styles.empty}>
      <T variant="t4" weight={400} color={colors.textSecondary}>
        {children}
      </T>
    </Edge>
  );
}

/** A raised button of the finish (never the red one). */
export function RaisedButton({
  label,
  onPress,
  disabled,
  height = 48,
  radius = 18,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  height?: number;
  radius?: number;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <PressScale accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={style}>
      <Raised radius={radius} style={{ height }} innerStyle={styles.raisedButton}>
        {icon}
        <T size={height <= 40 ? 13 : 14} weight={600} color={disabled ? colors.textMuted : colors.textPrimary}>
          {label}
        </T>
      </Raised>
    </PressScale>
  );
}

/** A recessed text field of the finish, with an icon before it if given. */
export function BookInput(props: TextInputProps & { height?: number; leading?: ReactNode }) {
  const colors = useColors();
  const styles = useStyles();
  const { height = 48, style, leading, ...rest } = props;
  return (
    <Recessed radius={18} style={[{ height }, style as StyleProp<ViewStyle>]} innerStyle={styles.inputWrap}>
      {leading}
      <TextInput placeholderTextColor="#8A8A94" style={[styles.input, { color: colors.textPrimary }]} {...rest} />
    </Recessed>
  );
}

/** The car's plate, as core lays it out. */
export function Plate({ plate, size = 'sm' }: { plate: string; size?: 'sm' | 'md' }) {
  return <PlateDrawing text={formatIndianPlate(plate)} size={size} />;
}

/** The customer app's wash gauge (moment 8), read with core's washGaugeAngle and washGaugeShare. */
export function CarGauge({ days, interval, over }: { days: number | null; interval: number; over: boolean }) {
  return <WashGaugeDial angle={washGaugeAngle(days, interval)} share={washGaugeShare(days, interval)} over={over} />;
}

export const useStyles = createStyles((c) => ({
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  square: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', padding: 4, gap: 4 },
  // At least 38; a longer Tamil option wraps to two lines inside it.
  segCell: { flex: 1, minHeight: 38, paddingVertical: 4, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  segLabel: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 4 },
  segOn: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  segOnInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  segLight: { position: 'absolute', bottom: 4, alignSelf: 'center' },
  tagD: {
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 999,
    justifyContent: 'center',
    backgroundColor: 'rgba(228,0,43,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,45,74,0.3)',
  },
  tagO: { height: 20, paddingHorizontal: 7, borderRadius: 999, justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  job: { flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  jobTime: { width: 48 },
  jobName: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  jobLine: { marginTop: 2 },
  jobStatus: { marginTop: 4 },
  tile: { flex: 1 },
  tileInner: { paddingHorizontal: 14, paddingVertical: 12 },
  tileValue: { marginTop: 4 },
  pickCell: { width: '48.8%', flexGrow: 1, flexBasis: '45%' },
  pick: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, gap: 2 },
  pickLight: { marginTop: 6, alignSelf: 'stretch', width: 'auto' },
  switch: { width: 48, height: 28 },
  switchLight: { position: 'absolute', left: 9, top: 12 },
  knob: { position: 'absolute', top: 2, left: 2 },
  knobOn: { left: 22 },
  disc: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1B1B1F', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  well: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1B1B1F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  empty: { paddingHorizontal: 16, paddingVertical: 16 },
  raisedButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  input: { flex: 1, fontSize: 15, padding: 0 },
  canvasNote: { color: c.textSecondary },
}));
