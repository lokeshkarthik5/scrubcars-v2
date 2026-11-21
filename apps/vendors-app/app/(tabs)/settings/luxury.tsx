import type { GarageLuxury, LuxuryApplication } from '@repo/core/api/luxury';
import { brandChipLabel, LUXURY_BRANDS, LUXURY_LIMITS } from '@repo/core/luxury';
import { TIER_LABELS } from '@repo/core/tiers';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { type Href, router } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { Image, Pressable, TextInput, View } from 'react-native';

import { AppShell, garageScreen } from '@/components/app-shell';
import { TopBar } from '@/components/rows';
import { IconCircle } from '@/components/settings/settings-icons';
import { TierMedalIcon } from '@/components/tier-card';
import { ScButton } from '@repo/native-ui/button';
import { Chip } from '@repo/native-ui/chip';
import {
  IconAlertTriangle,
  IconCameraPlus,
  IconCircleCheck,
  IconClock,
  IconInfoCircle,
  IconX,
} from '@repo/native-ui/icons';
import { ScInput, ScTextarea } from '@repo/native-ui/inputs';
import { LoadError, ScCard, SkeletonList } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useAuth, useIsVendorAdmin } from '@/lib/auth';
import { errorText } from '@/lib/error-text';
import { useGarageTier } from '@/lib/garage-api';
import { luxuryQueryKey, sendLuxuryApplication, uploadLuxuryPhoto, useGarageLuxury } from '@/lib/luxury-api';
import {
  formFromApplication,
  formPayload,
  istShortDay,
  type LuxuryForm,
  reapplyLabel,
  shownScreen,
  toggleBrand,
} from '@repo/core/luxury-form';
import { prepareForUpload } from '@/lib/photo-prepare';
import { photoProblem } from '@/lib/photos-view';
import { discardCached } from '@/lib/private-cache';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';
import { fill, useT } from '@repo/core/i18n';

// The web's back arrow goes to /settings; in the tab bar `back` would land on Home instead.
const goBack = () => router.navigate('/settings');

/** What a Bronze garage gets ready while it works towards Silver. */
const NEEDS = [
  'The brands you work on',
  'At least 3 photos of past luxury jobs',
  'A covered or indoor bay',
  'The products you use',
  'Who does the work',
] as const;

const INTRO =
  'Customers who drive a luxury car see specialist garages first. The Detlio team checks every application before the badge shows.';

/**
 * Settings > Luxury car specialist (apps/vendors/app/settings/luxury/page.tsx, 0083): where a
 * Silver or Gold garage applies for the badge and reads the team's answer; a Bronze garage
 * sees it locked, with its steps to Silver. The owner seat only (the API refuses an operator).
 * Photos are re-encoded as JPEGs by photo-prepare.ts, which drops their location.
 */
function LuxuryScreen() {
  const t = useT();
  const isVendorAdmin = useIsVendorAdmin();
  const vendorId = useAuth((s) => s.activeVendorId) ?? undefined;
  const luxury = useGarageLuxury(vendorId, isVendorAdmin);
  useRefreshOnFocus(luxuryQueryKey(vendorId));
  const [editing, setEditing] = useState(false);

  // The gate sends an operator home already; this is the web's own redirect.
  useEffect(() => {
    if (!isVendorAdmin) router.replace('/home');
  }, [isVendorAdmin]);

  const data = luxury.data;
  const screen = data ? shownScreen(data, editing) : null;

  return (
    <AppShell>
      <TopBar title={t('Luxury car specialist')} onBack={goBack} />
      {luxury.isError ? (
        <LoadError onRetry={() => void luxury.refetch()} retrying={luxury.isFetching} />
      ) : !data || !screen ? (
        <SkeletonList count={3} height={128} />
      ) : screen === 'locked' ? (
        <Locked vendorId={vendorId} />
      ) : screen === 'form' || screen === 'more' ? (
        <ApplyForm
          key={`${data.application?.updatedAt ?? 'new'}-${screen}`}
          data={data}
          asked={screen === 'more' ? data.application : null}
          onSent={() => setEditing(false)}
        />
      ) : (
        <Answered data={data} screen={screen} onEdit={() => setEditing(true)} />
      )}
    </AppShell>
  );
}

export default garageScreen(LuxuryScreen);

// ─── Pieces ──────────────────────────────────────────────────────────────────

type BoxTone = 'neutral' | 'warning' | 'success';

function StateBox({ tone, icon, title, children }: { tone: BoxTone; icon: ReactNode; title: string; children?: ReactNode }) {
  const styles = useStyles();
  return (
    <View
      accessibilityRole="summary"
      style={[styles.box, tone === 'warning' ? styles.boxWarning : tone === 'success' ? styles.boxSuccess : styles.boxNeutral]}
    >
      <View style={styles.boxIcon}>{icon}</View>
      <View style={styles.flex}>
        <T size={13} weight={500}>
          {title}
        </T>
        {children ? <View style={styles.boxBody}>{children}</View> : null}
      </View>
    </View>
  );
}

function Quiet({ children, color }: { children: ReactNode; color?: string }) {
  const colors = useColors();
  return (
    <T size={12} color={color ?? colors.textSecondary}>
      {children}
    </T>
  );
}

function CardHead({ title, line }: { title: string; line?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.head}>
      <T accessibilityRole="header" size={15} weight={600}>
        {title}
      </T>
      {line ? <Quiet>{line}</Quiet> : null}
    </View>
  );
}

function Intro() {
  const t = useT();
  return <CardHead title={t('Apply for the badge')} line={t(INTRO)} />;
}

/** A Bronze garage: today's tier card, what to get ready, and a grey Send for review. */
function Locked({ vendorId }: { vendorId: string | undefined }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const { data: tier } = useGarageTier(vendorId);
  const next = tier?.next;
  const percent = next && next.total > 0 ? Math.round((next.done / next.total) * 100) : 0;
  return (
    <>
      <Intro />
      <ScCard accessibilityLabel={t('For Silver and Gold garages')} style={styles.card}>
        <View style={styles.tierHead}>
          <View style={[styles.medal, !tier?.tier && styles.medalNone]}>
            <TierMedalIcon tier={tier?.tier ?? 'bronze'} size={26} grey={!tier?.tier} />
          </View>
          <View style={styles.flex}>
            <T size={11} weight={600} tracking={0.07} uppercase color={colors.textMuted}>
              {t('For Silver and Gold garages')}
            </T>
            <T size={16} weight={600}>
              {tier?.tier ? t("You're {tier}", { tier: t(TIER_LABELS[tier.tier]) }) : t('No tier yet')}
            </T>
            <Quiet>
              {t('Reach Silver, then apply here.')}
              {next ? (
                <>
                  {' '}
                  {fill(t('Next: {tier}, {done} of {total} done', { tier: t(TIER_LABELS[next.tier]) }), {
                    done: (
                      <T num size={12} color={colors.textSecondary}>
                        {next.done}
                      </T>
                    ),
                    total: (
                      <T num size={12} color={colors.textSecondary}>
                        {next.total}
                      </T>
                    ),
                  })}
                </>
              ) : null}
            </Quiet>
          </View>
        </View>
        {next ? (
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={t('Progress to {tier}', { tier: t(TIER_LABELS[next.tier]) })}
            accessibilityValue={{ min: 0, max: next.total, now: next.done }}
            style={styles.track}
          >
            <View style={[styles.fill, { width: `${percent}%` }]} />
          </View>
        ) : null}
        <ScButton variant="outline" onPress={() => router.navigate('/home' as Href)}>
          {t('See your steps to Silver')}
        </ScButton>
      </ScCard>

      <ScCard style={styles.card}>
        <CardHead title={t('What you’ll need')} line={t('Get these ready while you work towards Silver.')} />
        <View style={styles.needs}>
          {NEEDS.map((need) => (
            <View key={need} style={styles.need}>
              <IconCircle size={16} color={colors.textMuted} />
              <Quiet>{t(need)}</Quiet>
            </View>
          ))}
        </View>
      </ScCard>

      <ScButton variant="main" size="lg" disabled>
        {t('Send for review')}
      </ScButton>
    </>
  );
}

/** The form, empty or filled in from what was sent ("Asked for more", "Edit application"). */
function ApplyForm({ data, asked, onSent }: { data: GarageLuxury; asked: LuxuryApplication | null; onSent: () => void }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const queryClient = useQueryClient();
  const vendorId = useAuth((s) => s.activeVendorId) ?? undefined;
  const [form, setForm] = useState<LuxuryForm>(() =>
    formFromApplication(data.application?.status === 'review' || asked ? data.application : null)
  );
  const [uploading, setUploading] = useState(false);
  const payload = formPayload(form);
  const roomLeft = LUXURY_LIMITS.maxPhotos - form.photos.length;

  const send = useMutation({
    mutationFn: sendLuxuryApplication,
    onSuccess: (next) => {
      queryClient.setQueryData(luxuryQueryKey(vendorId), next);
      toast.success(t('Sent for review'));
      onSent();
    },
    onError: (error) => toast.error(errorText(error, t('Couldn’t send it. Please try again.'))),
  });

  const addPhotos = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      selectionLimit: roomLeft,
      exif: false,
    });
    if (result.canceled || result.assets.length === 0) return;
    setUploading(true);
    const assets = result.assets.slice(0, roomLeft);
    discardCached(result.assets.slice(roomLeft).map((a) => a.uri));
    try {
      for (const [index, asset] of assets.entries()) {
        const name = asset.fileName ?? t('Photo {n}', { n: index + 1 });
        const problem = photoProblem({ name, mimeType: asset.mimeType, size: asset.fileSize });
        if (problem) {
          discardCached([asset.uri]);
          toast.error(problem);
          continue;
        }
        let preparedUri: string | null = null;
        try {
          const prepared = await prepareForUpload(asset.uri, name);
          preparedUri = prepared.uri;
          const url = await uploadLuxuryPhoto(prepared.bytes);
          setForm((current) =>
            current.photos.length >= LUXURY_LIMITS.maxPhotos
              ? current
              : { ...current, photos: [...current.photos, { url, caption: null }] }
          );
        } finally {
          discardCached([asset.uri, preparedUri]);
        }
      }
    } catch (error) {
      // The pictures after the one that failed were never read: their copies go too.
      discardCached(assets.map((a) => a.uri));
      toast.error(errorText(error, t('Upload failed. Please try again.')));
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {asked ? (
        <StateBox tone="warning" icon={<IconAlertTriangle size={18} color={colors.warning} />} title={t('Detlio asked for more')}>
          {asked.teamNote ? <Quiet>{`“${asked.teamNote}”`}</Quiet> : null}
          <Quiet>
            {t('{who}, {date}. Add it and send again.', {
              who: asked.decidedBy ?? 'Detlio',
              date: asked.decidedAt ? istShortDay(asked.decidedAt) : '',
            })}
          </Quiet>
        </StateBox>
      ) : null}

      <View style={styles.introBlock}>
        <Intro />
        <View style={styles.pillRow}>
          {data.tier ? (
            <View style={styles.pill}>
              <TierMedalIcon tier={data.tier} size={13} />
              <T size={12} weight={500}>
                {t("You're {tier}", { tier: t(TIER_LABELS[data.tier]) })}
              </T>
            </View>
          ) : null}
          {/* Editing while under review below Silver (the API allows it): on hold, not "can apply". */}
          <Quiet>
            {data.silverOrGold
              ? t('You can apply.')
              : t('On hold while you’re below Silver. The team looks at it once you’re Silver again.')}
          </Quiet>
        </View>
      </View>

      <ScCard style={styles.card}>
        <CardHead title={t('Brands you work on')} line={t('Pick the ones you’ve worked on many times. Customers see these.')} />
        <View style={styles.chips}>
          {LUXURY_BRANDS.map((brand) => (
            <Chip
              key={brand}
              label={brandChipLabel(brand)}
              selected={form.brands.includes(brand)}
              onPress={() => setForm((current) => toggleBrand(current, brand))}
            />
          ))}
        </View>
      </ScCard>

      <ScCard style={styles.card}>
        <CardHead
          title={t('Photos of past luxury jobs')}
          line={t('At least 3. Show the car and the finished work. You can hide number plates.')}
        />
        <View style={styles.grid}>
          {form.photos.map((photo, index) => (
            <View key={photo.url} style={styles.tile}>
              <Image source={{ uri: photo.url }} style={styles.tileImage} accessibilityIgnoresInvertColors />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Remove photo {n}', { n: index + 1 })}
                hitSlop={10}
                onPress={() =>
                  setForm((current) => ({ ...current, photos: current.photos.filter((p) => p.url !== photo.url) }))
                }
                style={styles.remove}
              >
                <IconX size={14} color="#FFFFFF" />
              </Pressable>
              <TextInput
                accessibilityLabel={t('Car in photo {n}', { n: index + 1 })}
                placeholder={t('Add the car')}
                placeholderTextColor="rgba(255,255,255,0.6)"
                maxLength={LUXURY_LIMITS.captionMax}
                value={photo.caption ?? ''}
                onChangeText={(caption) =>
                  setForm((current) => ({
                    ...current,
                    photos: current.photos.map((p) => (p.url === photo.url ? { ...p, caption } : p)),
                  }))
                }
                style={styles.caption}
              />
            </View>
          ))}
          {roomLeft > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: uploading }}
              disabled={uploading}
              onPress={() => void addPhotos()}
              style={[styles.tile, styles.addTile]}
            >
              <IconCameraPlus size={18} color={colors.textSecondary} />
              <Quiet>{uploading ? t('Uploading…') : t('Add photo')}</Quiet>
            </Pressable>
          ) : null}
        </View>
        <Quiet color={colors.textMuted}>{t('{count} added', { count: form.photos.length })}</Quiet>
      </ScCard>

      <ScCard style={styles.card}>
        <CardHead title={t('Covered or indoor bay')} line={t('Where the car is worked on, out of the sun and rain.')} />
        <View accessibilityRole="radiogroup" style={styles.yesNo}>
          {([true, false] as const).map((value) => {
            const chosen = form.coveredBay === value;
            return (
              <Pressable
                key={String(value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: chosen }}
                onPress={() => setForm((current) => ({ ...current, coveredBay: value }))}
                style={[styles.yesNoButton, chosen ? styles.yesNoOn : styles.yesNoOff]}
              >
                <T size={14} weight={500} color={chosen ? colors.chosenText : colors.textPrimary}>
                  {value ? t('Yes') : t('No')}
                </T>
              </Pressable>
            );
          })}
        </View>
      </ScCard>

      <ScCard style={styles.card}>
        <CardHead title={t('Products you use')} />
        <ScTextarea
          accessibilityLabel={t('Products you use')}
          rows={3}
          maxLength={LUXURY_LIMITS.productsMax}
          value={form.products}
          onChangeText={(products) => setForm((current) => ({ ...current, products }))}
        />
        <Quiet color={colors.textMuted}>{t('For example your ceramic, PPF and polish brands.')}</Quiet>
      </ScCard>

      <ScCard style={styles.card}>
        <CardHead title={t('Trained staff')} />
        <ScInput
          accessibilityLabel={t('Trained staff')}
          maxLength={LUXURY_LIMITS.staffMax}
          value={form.staff}
          onChangeText={(staff) => setForm((current) => ({ ...current, staff }))}
        />
        <Quiet color={colors.textMuted}>{t('Who does the work, and any training they have.')}</Quiet>
      </ScCard>

      <View style={styles.sendBlock}>
        <ScButton
          variant="main"
          size="lg"
          disabled={!payload || send.isPending || uploading}
          onPress={() => payload && send.mutate(payload)}
        >
          {send.isPending ? t('Sending…') : t('Send for review')}
        </ScButton>
        <T size={11} color={colors.textMuted} align="center">
          {t('Your prices don’t change: customers still pay your hatchback, sedan or SUV price.')}
        </T>
      </View>
    </>
  );
}

/** Sent: under review, approved, hidden, declined or removed, with what was sent. */
function Answered({
  data,
  screen,
  onEdit,
}: {
  data: GarageLuxury;
  screen: 'review' | 'approved' | 'hidden' | 'declined' | 'removed';
  onEdit: () => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const app = data.application;
  return (
    <>
      {screen === 'review' && app ? (
        <StateBox tone="neutral" icon={<IconClock size={18} color={colors.textSecondary} />} title={t('Under review')}>
          <Quiet>
            {t('Sent on {date}. The Detlio team usually replies within 3 working days. We’ll send you a notification.', {
              date: istShortDay(app.sentAt),
            })}
          </Quiet>
          {!data.silverOrGold ? (
            <Quiet color={colors.warning}>
              {t('On hold while you’re below Silver. The team looks at it once you’re Silver again.')}
            </Quiet>
          ) : null}
        </StateBox>
      ) : null}
      {screen === 'approved' ? (
        <StateBox tone="success" icon={<IconCircleCheck size={18} color={colors.success} />} title={t("You're a Luxury car specialist")}>
          <Quiet>{t('Customers now see the badge and your brands on your listing. Detlio can remove it if standards slip.')}</Quiet>
        </StateBox>
      ) : null}
      {screen === 'hidden' ? (
        <StateBox tone="warning" icon={<IconAlertTriangle size={18} color={colors.warning} />} title={t('Your badge is hidden for now')}>
          <Quiet>
            {t('Customers see the Luxury specialist badge only on Silver and Gold garages. It comes back when you’re Silver again.')}
          </Quiet>
        </StateBox>
      ) : null}
      {screen === 'declined' && app ? (
        <StateBox tone="warning" icon={<IconInfoCircle size={18} color={colors.warning} />} title={t('Not this time')}>
          {app.teamNote ? <Quiet>{`“${app.teamNote}”`}</Quiet> : null}
          {data.reapplyOn ? <Quiet>{t('You can apply again on {date}.', { date: reapplyLabel(data.reapplyOn) })}</Quiet> : null}
        </StateBox>
      ) : null}
      {screen === 'removed' && app ? (
        <StateBox tone="warning" icon={<IconInfoCircle size={18} color={colors.warning} />} title={t('Detlio removed your badge')}>
          {app.teamNote ? <Quiet>{`“${app.teamNote}”`}</Quiet> : null}
          <Quiet>{data.silverOrGold ? t('Put it right, then apply again.') : t('Reach Silver, then apply again.')}</Quiet>
        </StateBox>
      ) : null}

      {app ? <WhatYouSent app={app} /> : null}

      {screen === 'review' ? (
        <View style={styles.sendBlock}>
          <ScButton variant="outline" onPress={onEdit}>
            {t('Edit application')}
          </ScButton>
          <Quiet color={colors.textMuted}>{t('Editing keeps your place in the queue.')}</Quiet>
        </View>
      ) : null}
      {screen === 'removed' && data.silverOrGold ? (
        <ScButton variant="outline" onPress={onEdit}>
          {t('Apply again')}
        </ScButton>
      ) : null}
    </>
  );
}

function WhatYouSent({ app }: { app: LuxuryApplication }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const rows: Array<[string, string]> = [
    [t('Brands'), app.brands.map(brandChipLabel).join(', ')],
    [t('Covered bay'), app.coveredBay ? t('Yes') : t('No')],
    [t('Products'), app.products ?? '—'],
    [t('Staff'), app.staff ?? '—'],
  ];
  return (
    <ScCard style={styles.card}>
      <CardHead title={t('What you sent')} />
      <View style={styles.thumbs}>
        {app.photos.map((photo) => (
          <View key={photo.url} style={styles.thumb}>
            <Image source={{ uri: photo.url }} style={styles.tileImage} accessibilityIgnoresInvertColors />
            {photo.caption ? (
              <T size={10} color="#FFFFFF" numberOfLines={2} style={styles.thumbCaption}>
                {photo.caption}
              </T>
            ) : null}
          </View>
        ))}
      </View>
      <View>
        {rows.map(([label, value], index) => (
          <View key={label} style={[styles.row, index > 0 && styles.rowDivider]}>
            <T size={13} color={colors.textSecondary} style={styles.rowLabel}>
              {label}
            </T>
            <T size={13} style={styles.flex}>
              {value}
            </T>
          </View>
        ))}
      </View>
    </ScCard>
  );
}

const useStyles = createStyles((colors) => ({
  flex: { flex: 1, minWidth: 0 },
  card: { gap: 12 },
  head: { gap: 2 },
  introBlock: { gap: 8 },
  box: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  boxNeutral: { borderColor: colors.border, backgroundColor: colors.surface },
  boxWarning: { borderColor: colors.warning, backgroundColor: colors.warningMuted },
  boxSuccess: { borderColor: colors.success, backgroundColor: colors.successMuted },
  boxIcon: { marginTop: 1 },
  boxBody: { marginTop: 2, gap: 2 },
  tierHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  medal: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalNone: { opacity: 0.6 },
  track: { height: 6, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.surfaceElevated },
  fill: { height: '100%', borderRadius: 999, backgroundColor: colors.textPrimary },
  needs: { gap: 8 },
  need: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 6,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: '31.5%',
    aspectRatio: 1.1,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  addTile: { alignItems: 'center', justifyContent: 'center', gap: 4, borderStyle: 'dashed', backgroundColor: 'transparent' },
  tileImage: { width: '100%', height: '100%' },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 6,
    fontSize: 11,
    color: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  yesNo: { flexDirection: 'row', gap: 8 },
  yesNoButton: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  yesNoOn: { borderColor: colors.chosenBg, backgroundColor: colors.chosenBg },
  yesNoOff: { borderColor: colors.border, backgroundColor: colors.surface },
  sendBlock: { gap: 8 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  thumb: { width: '23%', aspectRatio: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surfaceElevated },
  thumbCaption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 8 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.line },
  rowLabel: { width: 110 },
}));
