import { shineOn, useCreateShineScan, useShineConfig, useShineStatus } from '@repo/core/api/hooks/use-shine-score';
import { useT } from '@repo/core/i18n';
import {
  SHINE_AREA_LABELS,
  SHINE_AREA_SHORT,
  SHINE_AREAS,
  SHINE_OUTLINE_PATHS,
  SHINE_STEP_GUIDES,
  scansLeftLine,
  type ShineArea,
} from '@repo/core/shine-score';
import { ScButton } from '@repo/native-ui/button';
import { Glass, RedButton } from '@repo/native-ui/finish';
import { IconCamera, IconCheck, IconRefresh } from '@repo/native-ui/icons';
import { ScModal } from '@repo/native-ui/sheet';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/error-text';
import { pickShinePhoto, prepareShinePhoto, type ShinePhoto } from '@/lib/shine-photo';

type Photos = Partial<Record<ShineArea, ShinePhoto>>;

function Progress({ upTo }: { upTo: number }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.progress} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {SHINE_AREAS.map((area, i) => (
        <View key={area} style={[styles.segment, { backgroundColor: i <= upTo ? colors.textPrimary : 'rgba(255,255,255,0.15)' }]} />
      ))}
    </View>
  );
}

function Outline({ area }: { area: ShineArea }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 320 200" pointerEvents="none">
      <Path d={SHINE_OUTLINE_PATHS[area]} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={2.5} strokeDasharray="7 7" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Shine Score's guided photos and check (0075; the web's app/shine/page.tsx): four photos,
 * each re-encoded on the phone without its metadata, then Get my score. Signed in to scan;
 * three free scans a day (the server counts). The web's dark/blurry warning needs the
 * picture's pixels, which this app has no way to read, so the phone shows the photos to
 * check by eye and the server says when it can't see the car.
 */
export default function ShineScanScreen() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const config = useShineConfig();
  const on = shineOn(config.data);
  const status = useShineStatus(on && !!user);
  const scan = useCreateShineScan();

  const [photos, setPhotos] = useState<Photos>({});
  const [step, setStep] = useState(0);
  const [checking, setChecking] = useState(false);
  const [retaking, setRetaking] = useState<ShineArea | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ShineArea | null>(null);

  const page = (children: React.ReactNode, right?: React.ReactNode) => (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <View style={styles.grow}>
          <PageHeader title={t('Shine Score')} backTo="/home" />
        </View>
        {right}
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>{children}</ScrollView>
    </View>
  );

  if (!user) {
    return page(
      <View style={styles.center}>
        <T size={15} weight={600} lh={21}>
          {t('Sign in to get your Shine Score')}
        </T>
        <T size={13} lh={18} color={colors.textSecondary}>
          {t('Free · 4 photos')}
        </T>
        <ScButton height={48} onPress={() => router.push('/login?next=/shine' as Href)}>
          {t('Sign in')}
        </ScButton>
      </View>
    );
  }
  if (!config.isLoading && !on) {
    return page(
      <T size={15} lh={21} color={colors.textSecondary} style={styles.unavailable}>
        {t("Shine Score isn't available right now.")}
      </T>
    );
  }

  const area = SHINE_AREAS[step]!;
  const current = retaking ?? area;

  const take = async (from: 'camera' | 'gallery') => {
    setPickError(null);
    const uri = await pickShinePhoto(from);
    if (!uri) return;
    setPreparing(true);
    try {
      const photo = await prepareShinePhoto(uri);
      const next = { ...photos, [current]: photo };
      setPhotos(next);
      if (retaking) {
        setRetaking(null);
        setChecking(true);
        return;
      }
      const missing = SHINE_AREAS.findIndex((a) => !next[a]);
      if (missing === -1) setChecking(true);
      else setStep(missing);
    } catch (error) {
      setPickError(errorText(error, t("Couldn't read that photo. Try another one.")));
    } finally {
      setPreparing(false);
    }
  };

  // ─── Check and retake ──────────────────────────────────────────────────────
  if (checking && SHINE_AREAS.every((a) => photos[a])) {
    const left = status.data?.scansLeft;
    const perDay = status.data?.scansPerDay ?? config.data?.scansPerDay ?? 3;
    const noneLeft = left === 0;
    const error = scan.error ? errorText(scan.error, t("Couldn't get your score just now. Try again; it didn't use a free scan.")) : null;
    const leftLine = left === undefined ? null : scansLeftLine(left, perDay);
    const retake = (a: ShineArea) => {
      setViewing(null);
      setChecking(false);
      setRetaking(a);
      scan.reset();
    };
    const submit = async () => {
      if (scan.isPending || noneLeft) return;
      try {
        const result = await scan.mutateAsync(SHINE_AREAS.map((a) => ({ area: a, mimeType: photos[a]!.mimeType, dataBase64: photos[a]!.dataBase64 })));
        router.replace(`/shine/${result.scan.id}` as Href);
      } catch {
        // Shown from scan.error; the photos stay for another go.
      }
    };
    return page(
      <View style={styles.column}>
        <Progress upTo={3} />
        <View>
          <T size={24} weight={600} lh={30} tracking={-0.02} accessibilityRole="header">
            {t('Check your photos')}
          </T>
          <T size={15} lh={21} color={colors.textSecondary} style={styles.mt6}>
            {t('Tap a photo to see it bigger. Retake any that are blurry or dark.')}
          </T>
        </View>
        <View style={styles.grid} accessibilityLabel={t('Your photos')}>
          {SHINE_AREAS.map((a) => (
            <View key={a} style={styles.cell}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('View {name}', { name: t(SHINE_AREA_LABELS[a]).toLowerCase() })}
                onPress={() => setViewing(a)}
                style={styles.fill}
              >
                <Image source={{ uri: photos[a]!.uri }} style={styles.fill} resizeMode="cover" />
              </Pressable>
              <View style={styles.cellLabel} pointerEvents="none">
                <T size={12} weight={500} color="#fff">
                  {t(SHINE_AREA_SHORT[a])}
                </T>
              </View>
              <View style={styles.tick} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <IconCheck size={15} stroke={2.4} color="#fff" />
              </View>
            </View>
          ))}
        </View>
        {error ? (
          <T size={13} lh={18} accessibilityRole="alert" style={styles.errorBox}>
            {error}
          </T>
        ) : null}
        <RedButton onPress={() => void submit()} disabled={scan.isPending || noneLeft || left === undefined} accessibilityLabel={t('Get my score')}>
          <T size={16} weight={600} color="#fff">
            {scan.isPending ? t('Scoring your photos…') : error ? t('Try again') : t('Get my score')}
          </T>
        </RedButton>
        <T size={12} lh={16} color={colors.textMuted} style={styles.centerText}>
          {noneLeft
            ? t("You've used today's {count} free scans. Come back tomorrow.", { count: perDay })
            : leftLine
              ? `${t('Free')} · ${t(leftLine.key, { left: leftLine.left, perDay: leftLine.perDay })} · ${t('your photos stay private')}`
              : t('your photos stay private')}
        </T>
        <ScModal open={viewing !== null} onClose={() => setViewing(null)} accessibilityLabel={viewing ? t(SHINE_AREA_LABELS[viewing]) : t('Photo')}>
          {viewing ? (
            <View style={styles.column}>
              <T size={13} weight={500} lh={18}>
                {t(SHINE_AREA_LABELS[viewing])}
              </T>
              <Image source={{ uri: photos[viewing]!.uri }} resizeMode="contain" style={styles.big} />
              <View style={styles.row}>
                <View style={styles.grow}>
                  <ScButton variant="outline" height={44} onPress={() => retake(viewing)}>
                    {t('Retake')}
                  </ScButton>
                </View>
                <View style={styles.grow}>
                  <ScButton variant="outline" height={44} onPress={() => setViewing(null)}>
                    {t('Close')}
                  </ScButton>
                </View>
              </View>
            </View>
          ) : null}
        </ScModal>
      </View>
    );
  }

  // ─── One guided photo ──────────────────────────────────────────────────────
  const guide = SHINE_STEP_GUIDES[current];
  const shown = photos[current];
  const index = SHINE_AREAS.indexOf(current);
  return page(
    <View style={styles.column}>
      <Progress upTo={index} />
      <View style={styles.frame}>
        {shown ? <Image source={{ uri: shown.uri }} style={styles.absolute} resizeMode="cover" /> : null}
        <View style={styles.outline}>
          <Outline area={current} />
        </View>
        <Glass radius={999} style={styles.glassLabel}>
          <T size={12} weight={500} color="#fff">
            {t(SHINE_AREA_LABELS[current])}
          </T>
        </Glass>
        <T size={13} weight={500} color="#fff" style={styles.fit}>
          {t(guide.fit)}
        </T>
      </View>
      <T size={15} lh={21} color={colors.textSecondary}>
        {t(guide.hint)}
      </T>
      <View style={styles.slots}>
        {SHINE_AREAS.map((a, i) => {
          const photo = photos[a];
          const isCurrent = a === current;
          return (
            <View key={a} style={styles.slotWrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t(SHINE_AREA_SHORT[a])}${photo ? `, ${t('taken')}` : ''}`}
                accessibilityState={{ selected: isCurrent, disabled: !photo && !isCurrent }}
                disabled={!photo && !isCurrent}
                onPress={() => (retaking ? setRetaking(a) : setStep(i))}
                style={[styles.slot, isCurrent ? styles.slotCurrent : photo ? styles.slotDone : styles.slotEmpty]}
              >
                {photo ? (
                  <Image source={{ uri: photo.uri }} style={styles.fill} resizeMode="cover" />
                ) : (
                  <IconCamera size={16} stroke={1.6} color={isCurrent ? '#fff' : colors.textMuted} />
                )}
              </Pressable>
              <T size={11} lh={14} color={colors.textSecondary} style={styles.centerText}>
                {t(SHINE_AREA_SHORT[a])}
              </T>
            </View>
          );
        })}
      </View>
      {pickError ? (
        <T size={13} lh={18} accessibilityRole="alert" style={styles.centerText}>
          {pickError}
        </T>
      ) : null}
      <RedButton onPress={() => void take('camera')} disabled={preparing} accessibilityLabel={t('Take photo')}>
        <View style={styles.row}>
          <IconCamera size={17} stroke={1.6} color="#fff" />
          <T size={16} weight={600} color="#fff">
            {preparing ? t('Getting the photo ready…') : t('Take photo')}
          </T>
        </View>
      </RedButton>
      <Pressable accessibilityRole="button" disabled={preparing} onPress={() => void take('gallery')} style={styles.gallery}>
        <T size={15} color={colors.textSecondary}>
          {t('Choose from gallery')}
        </T>
      </Pressable>
    </View>,
    <View style={styles.right}>
      <T size={13} color={colors.dim}>
        <Figures size={13} color={colors.dim} text={t('Photo {number} of {total}', { number: index + 1, total: SHINE_AREAS.length })} />
      </T>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  right: { paddingRight: 16 },
  body: { paddingHorizontal: 16, paddingTop: 4 },
  column: { gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  center: { alignItems: 'center', gap: 12, paddingTop: 80 },
  centerText: { textAlign: 'center' },
  unavailable: { textAlign: 'center', paddingTop: 40 },
  mt6: { marginTop: 6 },
  progress: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 3, borderRadius: 2 },
  frame: { aspectRatio: 4 / 4.4, borderRadius: 22, overflow: 'hidden', backgroundColor: '#1d1c20' },
  absolute: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  outline: { position: 'absolute', left: 24, right: 24, top: '25%', bottom: '25%' },
  glassLabel: { position: 'absolute', top: 12, left: 12, paddingHorizontal: 10, paddingVertical: 4 },
  fit: { position: 'absolute', left: 0, right: 0, bottom: 16, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  slots: { flexDirection: 'row', gap: 8 },
  slotWrap: { flex: 1, alignItems: 'center', gap: 6 },
  slot: { width: '100%', aspectRatio: 4 / 3, borderRadius: 10, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  slotCurrent: { borderStyle: 'dashed', borderColor: '#FF2D4A', backgroundColor: 'rgba(255,45,74,0.1)' },
  slotDone: { borderColor: c.line },
  slotEmpty: { borderStyle: 'dashed', borderColor: c.line },
  fill: { width: '100%', height: '100%' },
  gallery: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '48.5%', aspectRatio: 4 / 3.3, borderRadius: 16, overflow: 'hidden', backgroundColor: c.surface },
  cellLabel: { position: 'absolute', left: 8, bottom: 8, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, paddingVertical: 2 },
  tick: { position: 'absolute', top: 8, right: 8, height: 24, width: 24, borderRadius: 12, backgroundColor: c.success, alignItems: 'center', justifyContent: 'center' },
  errorBox: { borderWidth: 1, borderColor: c.line, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  big: { width: '100%', height: 320, borderRadius: 12 },
}));
