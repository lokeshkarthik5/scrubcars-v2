import { garageLive } from '@repo/core/api/hooks/use-garage';
import { useRewardExtras } from '@repo/core/api/hooks/use-reward-extras';
import { rewardsEnabled, useMyRewards, useRewardsConfig } from '@repo/core/api/hooks/use-rewards';
import type { RewardExtras } from '@repo/core/api/reward-extras';
import type { MyRewards, RewardVoucher } from '@repo/core/api/rewards';
import { fill, msg, useT, useTn } from '@repo/core/i18n';
import { levelLine, rewardDate, rewardDay, rewardRupees, stampsToGoLine, streakLine, type RewardLevel } from '@repo/core/rewards';
import { ScButton } from '@repo/native-ui/button';
import { IconCake, IconCar, IconCheck, IconChevronDown, IconChevronRight, IconCopy, IconGift, IconSparkles, IconStar, IconStarFilled, IconTicket, IconTrophy, IconUsers } from '@repo/native-ui/icons';
import { EmptyState, ErrorState, PressRow, ScCard, Skeleton } from '@repo/native-ui/primitives';
import { FigureLine, T } from '@repo/native-ui/text';
import { createStyles, ThemeScope, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GarageEntry } from '@/components/collect/garage-album';
import { PageHeader } from '@/components/page-header';
import { BadgeCabinet } from '@/components/rewards/badge-cabinet';
import { BadgeCelebration } from '@/components/rewards/badge-celebration';
import { BirthdayForm } from '@/components/rewards/birthday-form';
import { ChallengeCard } from '@/components/rewards/challenge-card';
import { InviteCard } from '@/components/rewards/invite-card';
import { LevelBadge } from '@/components/rewards/level-badge';
import { ScratchCardPanel } from '@/components/rewards/scratch-card';
import { StampStars } from '@/components/rewards/stamp-stars';
import { useAuth } from '@/lib/auth';
import { BrushedLines, CountUpFigure, FillOnce } from '@/components/moments/metal';

const VOUCHER_STATE_LABELS: Record<RewardVoucher['state'], string> = { available: msg('Ready'), spent: msg('Used'), expired: msg('Ran out'), cancelled: msg('Withdrawn') };
const LEVEL_TINTS: Partial<Record<RewardLevel, string>> = { gold: '227,182,82', platinum: '196,215,235', diamond: '165,210,255', icon: '240,220,170' };
const tintOf = (level: RewardLevel) => LEVEL_TINTS[level] ?? '220,225,236';

/** apps/users/app/profile/rewards/page.tsx: the good stuff first. Every number is the API's. */
export default function RewardsScreen() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ badge?: string; challenge?: string }>();
  const user = useAuth((s) => s.user);
  const config = useRewardsConfig();
  const on = rewardsEnabled(config.data);
  const rewards = useMyRewards(on && !!user);
  const extras = useRewardExtras(on && !!user);
  const [pulling, setPulling] = useState(false);
  const view = rewards.data;
  const settings = config.data?.settings ?? null;
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title="Detlio Rewards" backTo="/profile" />
      {!user ? (
        <View style={styles.center}>
          <T size={15} weight={600} align="center">
            {t('Sign in to see your rewards')}
          </T>
          <ScButton variant="main" fullWidth={false} paddingX={32} onPress={() => router.push(`/login?next=${encodeURIComponent('/profile/rewards')}` as Href)}>
            {t('Sign in')}
          </ScButton>
        </View>
      ) : !config.isPending && !on ? (
        <View style={styles.center}>
          <EmptyState icon={<IconStar size={32} stroke={1.5} color={colors.textSecondary} />} title={t("Rewards aren't available right now")} subtitle={t('You can still book a wash as usual.')} />
          <ScButton variant="outline" fullWidth={false} onPress={() => router.push('/garages' as Href)}>
            {t('Find garages')}
          </ScButton>
        </View>
      ) : config.isPending || rewards.isPending ? (
        <View style={styles.body}>
          <Skeleton height={160} />
          <Skeleton height={160} />
        </View>
      ) : rewards.isError || !view ? (
        <View style={styles.body}>
          <ErrorState message={t("Couldn't load your rewards. Check your connection.")} onRetry={() => void rewards.refetch()} />
        </View>
      ) : (
        <Body
          view={view}
          extras={extras.data ?? null}
          focusBadge={params.badge ?? null}
          focusChallenge={params.challenge ?? null}
          garage={garageLive(config.data)}
          birthdayPerkFrom={settings?.levels.find((l) => l.birthdayVoucher !== null)?.label ?? null}
          refresh={
            <RefreshControl
              refreshing={pulling}
              onRefresh={() => {
                setPulling(true);
                void Promise.all([queryClient.invalidateQueries({ queryKey: ['rewards'] }), rewards.refetch(), extras.refetch()]).finally(() => setPulling(false));
              }}
            />
          }
          bottom={insets.bottom + 24}
        />
      )}
    </View>
  );
}

function Body({ view, extras, focusBadge, focusChallenge, garage, birthdayPerkFrom, refresh, bottom }: { view: MyRewards; extras: RewardExtras | null; focusBadge: string | null; focusChallenge: string | null; garage: boolean; birthdayPerkFrom: string | null; refresh: React.ReactElement<React.ComponentProps<typeof RefreshControl>>; bottom: number }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const { card, level, streak } = view;
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const challengesY = useRef<number | null>(null);
  const [ladderOpen, setLadderOpen] = useState(false);

  // Cards shown waiting stay on the page once scratched, prize and all, until the customer leaves.
  const waitingIds = view.scratchCards.filter((c) => c.state === 'waiting').map((c) => c.id);
  const [pinned, setPinned] = useState<string[]>(waitingIds);
  if (waitingIds.some((id) => !pinned.includes(id))) setPinned([...pinned, ...waitingIds.filter((id) => !pinned.includes(id))]);
  const scratchCards = view.scratchCards.filter((c) => c.state === 'waiting' || pinned.includes(c.id));
  const waitingCount = scratchCards.filter((c) => c.state === 'waiting').length;
  const available = view.vouchers.filter((v) => v.state === 'available');
  const past = view.vouchers.filter((v) => v.state !== 'available').slice(0, 10);
  const next = view.ladder.find((step) => step.key === level.next);
  const prevMin = view.ladder.find((step) => step.key === level.level)?.minBookings ?? 0;
  const nextMin = next?.minBookings ?? null;
  const progress = nextMin === null || level.toNext === null ? 100 : Math.round(((nextMin - level.toNext - prevMin) / Math.max(1, nextMin - prevMin)) * 100);
  const hasMoney = scratchCards.length > 0 || available.length > 0;
  const tint = tintOf(level.level);

  useEffect(() => {
    if (!focusChallenge || !extras) return;
    const timer = setTimeout(() => {
      if (challengesY.current !== null) scroller.current?.scrollTo({ y: Math.max(0, challengesY.current - 80), animated: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [focusChallenge, extras]);

  const shineCard = (
    <ThemeScope scheme="dark">
      <ShineCard view={view} />
    </ThemeScope>
  );

  const vouchers = (
    <View style={styles.section}>
      <View style={styles.head}>
        <T size={14} weight={600} lh={20}>
          {t('Your rewards')}
        </T>
        {available.length > 0 ? (
          <T size={11} lh={15} color={colors.textMuted}>
            {t('One per booking, at checkout')}
          </T>
        ) : null}
      </View>
      {available.length === 0 ? (
        <ScCard style={styles.pad12}>
          <T size={12} lh={16} color={colors.textSecondary}>
            {t('Nothing to use yet. Fill your Shine Card or scratch a card to win one.')}
          </T>
        </ScCard>
      ) : (
        <>
          {available.map((v) => (
            <VoucherRow key={v.id} voucher={v} />
          ))}
          <T size={11} lh={15} color={colors.textMuted}>
            {t('Not with another code; works with Detlio credit. Given back if the booking is cancelled.')}
          </T>
        </>
      )}
    </View>
  );

  return (
    <ScrollView ref={scroller} refreshControl={refresh} contentContainerStyle={[styles.body, { paddingBottom: bottom }]}>
      {scratchCards.length > 0 ? (
        <View style={styles.section}>
          <T size={14} weight={600} lh={20}>
            {waitingCount === 0 ? t('Your scratch card') : waitingCount === 1 ? t('A scratch card for you') : t('{count} scratch cards for you', { count: waitingCount })}
          </T>
          {scratchCards.map((c) => (
            <ScratchCardPanel key={c.id} card={c} />
          ))}
        </View>
      ) : null}

      {hasMoney ? (
        <>
          {vouchers}
          {shineCard}
        </>
      ) : (
        <>
          {shineCard}
          {vouchers}
        </>
      )}

      {garage ? <GarageEntry /> : null}

      {extras && extras.unseen.length > 0 ? <BadgeCelebration badges={extras.unseen} focusId={focusBadge} /> : null}

      <View style={styles.section}>
        <T size={14} weight={600} lh={20}>
          {t('Your level')}
        </T>
        {view.lifetime.washes > 0 ? (
          <View style={styles.tiles}>
            <View style={styles.tile}>
              <T size={11} lh={15} color={colors.textSecondary}>
                {t('Saved with rewards')}
              </T>
              <View style={styles.mt4}>
                <CountUpFigure value={Math.round(Number(view.lifetime.saved))} format={rewardRupees} size={22} lh={26} />
              </View>
            </View>
            <View style={styles.tile}>
              <T size={11} lh={15} color={colors.textSecondary}>
                {view.lifetime.since ? t('Washes since {since}', { since: view.lifetime.since }) : t('Washes')}
              </T>
              <View style={styles.mt4}>
                <CountUpFigure value={view.lifetime.washes} format={(n) => n.toLocaleString('en-IN')} size={22} lh={26} />
              </View>
            </View>
          </View>
        ) : null}
        <ThemeScope scheme="dark">
          <LevelCard view={view} progress={progress} tint={tint} ladderOpen={ladderOpen} toggle={() => setLadderOpen((o) => !o)} level={level} streak={streak} />
        </ThemeScope>
      </View>

      {extras && extras.challenges.length > 0 ? (
        <View style={styles.section} onLayout={(e) => (challengesY.current = e.nativeEvent.layout.y)}>
          <T size={14} weight={600} lh={20}>
            {extras.challenges.length === 1 ? t('Challenge') : t('Challenges')}
          </T>
          {extras.challenges.map((challenge) => (
            <ChallengeCard key={challenge.id} challenge={challenge} highlight={challenge.id === focusChallenge} />
          ))}
        </View>
      ) : null}

      {extras ? <BadgeCabinet extras={extras} /> : null}

      {extras && extras.wrapped.years.length > 0 ? (
        <PressRow onPress={() => router.push(`/profile/rewards/wrapped?year=${extras.wrapped.years[0]}` as Href)} style={styles.wrapped}>
          <IconSparkles size={20} stroke={1.6} color={colors.textPrimary} />
          <View style={styles.grow}>
            <T size={14} weight={600} lh={20}>
              {fill(t('Your {year} Detlio Wrapped'), {
                year: (
                  <T num size={14} weight={600}>
                    {String(extras.wrapped.years[0])}
                  </T>
                ),
              })}
            </T>
            <T size={12} lh={16} color={colors.textSecondary}>
              {t('Your year in washes, garages and shine.')}
            </T>
          </View>
          <IconChevronRight size={18} color={colors.textSecondary} />
        </PressRow>
      ) : null}

      <InviteCard invite={view.invite} />
      {view.referredBy ? (
        <T size={12} lh={16} color={colors.textSecondary}>
          {t("You joined through {name}'s invite.", { name: view.referredBy.firstName })}
          {view.referredBy.status === 'pending' ? ` ${t('Your reward comes with your first booking.')}` : ''}
        </T>
      ) : null}

      <View style={styles.section}>
        <T size={14} weight={600} lh={20}>
          {t('Birthday')}
        </T>
        <ScCard style={styles.pad12}>
          <BirthdayForm birthday={view.birthday} perkFrom={birthdayPerkFrom} />
        </ScCard>
      </View>

      {past.length > 0 ? (
        <View style={styles.section}>
          <T size={14} weight={600} lh={20}>
            {t('Used and past rewards')}
          </T>
          <ScCard style={styles.list}>
            {past.map((v, i) => (
              <View key={v.id} style={[styles.listRow, i > 0 && styles.line]}>
                <View style={styles.grow}>
                  <T size={13} lh={18}>
                    {v.label}
                  </T>
                  <T num size={11} lh={15} color={colors.textMuted}>
                    {rewardDate(v.issuedAt)}
                  </T>
                </View>
                <FigureLine size={12} lh={16} color={colors.textSecondary} text={`${rewardRupees(v.amount)} · ${t(VOUCHER_STATE_LABELS[v.state])}`} />
              </View>
            ))}
          </ScCard>
        </View>
      ) : null}

      <View style={styles.section}>
        <T size={14} weight={600} lh={20}>
          {t('History')}
        </T>
        {view.history.length === 0 ? (
          <ScCard>
            <T size={12} lh={16} color={colors.textSecondary}>
              {t('Your first completed booking through Detlio starts your card.')}
            </T>
          </ScCard>
        ) : (
          <ScCard style={styles.list}>
            {view.history.map((row, i) => {
              const body = (
                <>
                  <T size={13} lh={18}>
                    {row.title}
                  </T>
                  <FigureLine size={11} lh={15} color={colors.textMuted} text={`${rewardDate(row.at)}${row.detail ? ` · ${row.detail}` : ''}`} />
                </>
              );
              return row.bookingId ? (
                <Pressable key={row.id} accessibilityRole="link" onPress={() => router.push(`/bookings/${row.bookingId}` as Href)} style={[styles.historyRow, i > 0 && styles.line]}>
                  {body}
                </Pressable>
              ) : (
                <View key={row.id} style={[styles.historyRow, i > 0 && styles.line]}>
                  {body}
                </View>
              );
            })}
          </ScCard>
        )}
      </View>
    </ScrollView>
  );
}

/** The brushed-metal Shine Card: always dark, as on the web. */
function ShineCard({ view }: { view: MyRewards }) {
  const t = useT();
  const tn = useTn();
  const colors = useColors();
  const styles = useStyles();
  const { card, level } = view;
  return (
    <LinearGradient start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} colors={['#1F2026', '#15161A', '#101114']} locations={[0, 0.6, 1]} style={styles.shine}>
      <View style={styles.between}>
        <View style={styles.grow}>
          <T size={12} lh={16} color={colors.textSecondary}>
            Shine Card
          </T>
          <FigureLine size={18} weight={600} lh={24} text={stampsToGoLine(card.toGo)} />
        </View>
        <LevelBadge level={level.level} label={level.label} />
      </View>
      <View accessibilityRole="image" accessibilityLabel={t('{count} of {goal} stamps', { count: card.onCard, goal: card.goal })} style={styles.stars}>
        <StampStars onCard={card.onCard} goal={card.goal} size={30} remember />
      </View>
      <FigureLine size={12} lh={16} color={colors.textSecondary} text={t('{goal} stamps make {amount} off. One for every booking of {min} or more paid through Detlio.', { goal: card.goal, amount: rewardRupees(card.rewardAmount), min: rewardRupees(view.invite.minAmount) })} />
      {card.nextExpiry ? <FigureLine size={11} lh={15} color={colors.textMuted} text={tn(card.nextExpiry.count, '{count} stamp ends after {day}', '{count} stamps end after {day}', { day: rewardDay(card.nextExpiry.lastDay) })} /> : null}
    </LinearGradient>
  );
}

function LevelCard({ view, progress, tint, ladderOpen, toggle, level, streak }: { view: MyRewards; progress: number; tint: string; ladderOpen: boolean; toggle: () => void; level: MyRewards['level']; streak: MyRewards['streak'] }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <LinearGradient start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} colors={['#1C1D23', '#141519', '#101114']} locations={[0, 0.6, 1]} style={[styles.level, { borderColor: `rgba(${tint},0.18)` }]}>
      {/* Brushed metal in the level's colour (moment 9). */}
      <BrushedLines />
      <View style={styles.between}>
        <LevelBadge level={level.level} label={level.label} large />
        <View style={styles.bookingsLine}>
          <CountUpFigure value={level.bookings} format={String} size={12} weight={400} lh={16} color={colors.textSecondary} />
          <T size={12} lh={16} color={colors.textSecondary}>
            {` ${t('in 12 months')}`}
          </T>
        </View>
      </View>
      <FigureLine size={14} weight={500} lh={20} text={levelLine(level)} />
      {level.next ? (
        <View style={styles.gap6}>
          <View style={styles.bar}>
            {/* Fills to the level once, from the left. */}
            <FillOnce style={[styles.fill, { width: `${Math.max(4, Math.min(100, progress))}%` }]}>
              <LinearGradient start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} colors={[`rgba(${tint},0.55)`, `rgb(${tint})`]} style={styles.fillFace} />
            </FillOnce>
          </View>
          <View style={styles.between}>
            <T size={11} lh={15} color={colors.textMuted}>
              {level.label}
            </T>
            <T size={11} lh={15} color={colors.textMuted}>
              {level.nextLabel}
            </T>
          </View>
        </View>
      ) : null}
      {level.noShowDrops > 0 ? (
        <T size={11} lh={15} color={colors.warning}>
          {t('A missed booking took one level off for 12 months.')}
        </T>
      ) : null}
      <View style={[styles.between, styles.rule]}>
        <View style={styles.grow}>
          <FigureLine size={12} lh={16} text={streakLine(streak)} />
          <FigureLine size={11} lh={15} color={colors.textMuted} text={streak.bonusStamps === 1 ? t('{months} months in a row earn a bonus stamp.', { months: streak.monthsNeeded }) : t('{months} months in a row earn {count} bonus stamps.', { months: streak.monthsNeeded, count: streak.bonusStamps })} />
        </View>
        <View style={styles.dots}>
          {Array.from({ length: streak.monthsNeeded }, (_, i) => (
            <View key={i} style={[styles.dot, i < streak.monthsNeeded - streak.toBonus ? styles.dotOn : styles.dotOff]} />
          ))}
        </View>
      </View>
      <View style={styles.rule}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: ladderOpen }} onPress={toggle} style={styles.ladderHead}>
          <T size={12} weight={500} lh={16}>
            {t('All levels and what they unlock')}
          </T>
          {ladderOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
        </Pressable>
        {ladderOpen ? (
          <View style={styles.ladder}>
            {view.ladder.map((step) => (
              <View key={step.key} style={[styles.step, step.current && styles.stepNow]}>
                <View style={[styles.stepMark, step.reached ? styles.stepOn : styles.stepOff]}>{step.reached ? <IconCheck size={12} stroke={2.5} color="#0A0A0B" /> : null}</View>
                <View style={styles.grow}>
                  <T size={13} weight={step.current ? 600 : 400} lh={18}>
                    {t(step.label)}
                    <T num size={12} lh={18} color={colors.textMuted}>{` · ${step.minBookings === 0 ? t('everyone') : t('{count} washes', { count: step.minBookings })}`}</T>
                    {step.current ? (
                      <T size={12} lh={18} color={colors.textSecondary}>
                        {` ${t('· you')}`}
                      </T>
                    ) : null}
                  </T>
                  {step.unlocks.map((u) => (
                    <FigureLine key={u} size={12} lh={16} color={colors.textSecondary} text={u} />
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </LinearGradient>
  );
}

const VOUCHER_MARKS: Record<RewardVoucher['kind'], { icon: typeof IconCar; tone: 'silver' | 'gold' }> = {
  shine: { icon: IconStarFilled, tone: 'silver' },
  scratch: { icon: IconTicket, tone: 'silver' },
  free_wash: { icon: IconCar, tone: 'gold' },
  referral: { icon: IconUsers, tone: 'silver' },
  birthday: { icon: IconCake, tone: 'gold' },
  annual_detailing: { icon: IconSparkles, tone: 'gold' },
  adjustment: { icon: IconGift, tone: 'silver' },
  challenge: { icon: IconTrophy, tone: 'gold' },
};

function VoucherRow({ voucher }: { voucher: RewardVoucher }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const copy = async () => {
    if (!voucher.code) return;
    try {
      await Clipboard.setStringAsync(voucher.code);
      toast.success(t('Code copied'));
    } catch {
      toast.info(t('Your code is {code}', { code: voucher.code }));
    }
  };
  const mark = VOUCHER_MARKS[voucher.kind] ?? VOUCHER_MARKS.adjustment;
  const Glyph = mark.icon;
  const freeWash = voucher.kind === 'free_wash';
  const gold = mark.tone === 'gold';
  return (
    <View style={styles.voucher}>
      <LinearGradient start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} colors={gold ? ['#F9E3A0', '#E3B652', '#A8782A'] : ['#F1F3F6', '#C9CDD6', '#9DA3AF']} style={[styles.voucherMark]}>
        <Glyph size={20} stroke={1.8} color={gold ? '#2B1B04' : '#121318'} />
      </LinearGradient>
      <View style={styles.grow}>
        {freeWash ? (
          <T size={18} weight={600} lh={24}>
            {t('Free wash')}
          </T>
        ) : (
          <FigureLine size={18} weight={600} lh={24} text={t('{amount} off', { amount: rewardRupees(voucher.amount) })} />
        )}
        {freeWash ? <FigureLine size={12} lh={16} color={colors.textSecondary} text={t('Up to {amount} · scratch card', { amount: rewardRupees(voucher.amount) })} /> : <T size={12} lh={16} color={colors.textSecondary}>{voucher.label}</T>}
        <FigureLine size={11} lh={15} color={colors.textMuted} text={t('Use by {day}', { day: rewardDay(voucher.lastDay) })} />
      </View>
      {voucher.code ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t('Copy code {code}', { code: voucher.code })} onPress={() => void copy()} style={styles.codeChip}>
          <T num size={12} lh={16}>
            {voucher.code}
          </T>
          <IconCopy size={14} />
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 16 },
  body: { gap: 14, paddingHorizontal: 16, paddingTop: 12 },
  section: { gap: 8 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  pad12: { paddingVertical: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  mt4: { marginTop: 4 },
  gap6: { gap: 6 },
  shine: { gap: 10, overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: '#2A2A2E', paddingHorizontal: 16, paddingVertical: 16 },
  stars: { alignItems: 'center', paddingVertical: 6 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 14, paddingVertical: 12 },
  level: { gap: 12, overflow: 'hidden', borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 16 },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.1)' },
  fill: { height: '100%', borderRadius: 3, overflow: 'hidden' },
  fillFace: { flex: 1 },
  bookingsLine: { flexDirection: 'row', alignItems: 'center' },
  rule: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 12 },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotOn: { backgroundColor: '#DCE1EC' },
  dotOff: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  ladderHead: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ladder: { gap: 12, marginTop: 8 },
  step: { flexDirection: 'row', gap: 12 },
  stepNow: { marginHorizontal: -8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 8, paddingVertical: 6 },
  stepMark: { width: 20, height: 20, borderRadius: 10, marginTop: 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  stepOn: { borderColor: '#DCE1EC', backgroundColor: '#DCE1EC' },
  stepOff: { borderColor: c.stroke, backgroundColor: c.surface },
  wrapped: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 16, paddingVertical: 14 },
  list: { paddingHorizontal: 0, paddingVertical: 4 },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  line: { borderTopWidth: 1, borderTopColor: c.border },
  historyRow: { paddingHorizontal: 14, paddingVertical: 10 },
  voucher: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingVertical: 12, paddingLeft: 12, paddingRight: 14 },
  voucherMark: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  codeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, borderWidth: 1, borderColor: c.line, paddingHorizontal: 10, paddingVertical: 4 },
}));
