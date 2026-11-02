import type { GarageRequest } from '@repo/core/api/booking-requests';
import { countdownLabel, istClock, istStartLabel, REQUEST_RULES, travelFeeLabel, type TravelFee } from '@repo/core/booking-requests';
import { formatINR } from '@repo/core/format';
import { useNow } from '@repo/core/hooks/use-now';
import { router, useLocalSearchParams } from 'expo-router';
import { type ComponentRef, useRef, useState } from 'react';
import { Pressable, type ScrollView, View } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';

import { AppShell, garageScreen } from '@/components/app-shell';
import { ScButton } from '@repo/native-ui/button';
import { FocusFrame } from '@/components/focus-frame';
import { ScBadge } from '@/components/form-controls';
import { IconMapPin } from '@repo/native-ui/icons';
import { EmptyState, LoadError, ScCard, ScSegmented, SkeletonList } from '@repo/native-ui/primitives';
import { TopBar } from '@/components/rows';
import { ConfirmSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import { errorText } from '@/lib/error-text';
import { itemIdParam, REQUEST_MISSING, type ScopeLookup } from '@/lib/focus-item';
import {
  useAcceptRequest,
  useDeclineRequest,
  useGarageRequestsInbox,
  useRequestStartTimes,
  useWithdrawRequest,
} from '@/lib/requests-api';
import {
  ACCEPT_FAILED,
  acceptedLine,
  acceptedToast,
  canAccept,
  chosenStart,
  closedBadge,
  DECLINE_FAILED,
  declineToast,
  EMPTY_SUBTITLE,
  EMPTY_TITLE,
  needsStartHint,
  reachGeometry,
  REQUESTS_FOOTER,
  REQUESTS_INTRO,
  servicesLine,
  startTimeHeading,
  waitingLabel,
  WITHDRAW_BODY,
  WITHDRAW_FAILED,
  WITHDRAWN_TOAST,
  whenWhereLine,
} from '@/lib/requests-view';
import { useItemFocus } from '@/lib/use-item-focus';
import { createStyles, useColors } from '@repo/native-ui/theme';

/**
 * apps/vendors/app/requests/page.tsx: Requests (customer reach, 0062). Customers just outside
 * this garage's reach asking it to come (or collect) anyway. Nothing is paid until the garage
 * says yes, with a start time inside the customer's window and an optional travel fee it keeps
 * whole. "Can't" passes it to the next nearest garage. Two hours to answer; Detlio phones after
 * 30 minutes with no answer. What one earns shows to the owner seat only (the server sends null
 * to an operator), and the page itself is every seat's.
 */
function RequestsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const [scope, setScope] = useState<'open' | 'closed'>('open');
  const openRequests = useGarageRequestsInbox('open', scope === 'open');
  const closedRequests = useGarageRequestsInbox('closed', scope === 'closed');
  const requests = scope === 'open' ? openRequests : closedRequests;
  const items = requests.data?.items ?? [];

  // A notification or link for one request (/requests#request-<id>): the scope that has it,
  // scrolled to and flashed. Once per id named.
  const params = useLocalSearchParams<{ request?: string }>();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const { onListLayout, frameProps } = useItemFocus({
    id: itemIdParam(params.request),
    ready: true,
    open: lookupOf(openRequests),
    closed: lookupOf(closedRequests),
    refetch: () => {
      void openRequests.refetch();
      void closedRequests.refetch();
    },
    onScope: setScope,
    missing: REQUEST_MISSING,
    scrollRef: scroll,
  });

  return (
    <AppShell gap={16} scrollRef={scroll}>
      <TopBar title="Requests" onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
      <T size={12} color={colors.textSecondary}>
        {REQUESTS_INTRO}
      </T>
      <ScSegmented
        accessibilityLabel="Which requests"
        value={scope}
        onChange={setScope}
        options={[
          { value: 'open', label: 'Open' },
          { value: 'closed', label: 'Closed' },
        ]}
      />
      {requests.isLoading ? (
        <SkeletonList count={2} height={320} />
      ) : requests.isError && !requests.data ? (
        <LoadError what="your requests" onRetry={() => void requests.refetch()} retrying={requests.isFetching} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<IconMapPin size={28} stroke={1.5} color={colors.textSecondary} />}
          title={EMPTY_TITLE}
          subtitle={EMPTY_SUBTITLE}
        />
      ) : (
        <View style={styles.list} onLayout={onListLayout}>
          {items.map((request) => (
            <FocusFrame key={request.id} {...frameProps(request.id)}>
              {scope === 'closed' ? (
                <ClosedRequestCard request={request} />
              ) : request.status === 'pending' ? (
                <WaitingRequestCard request={request} />
              ) : (
                <AcceptedRequestCard request={request} />
              )}
            </FocusFrame>
          ))}
          {scope === 'open' ? (
            <T size={12} color={colors.textSecondary} align="center">
              {REQUESTS_FOOTER}
            </T>
          ) : null}
        </View>
      )}
    </AppShell>
  );
}

/** One scope's list as lib/focus-item.ts reads it. */
function lookupOf(query: ReturnType<typeof useGarageRequestsInbox>): ScopeLookup {
  return {
    ids: query.data?.items.map((request) => request.id),
    updatedAt: query.dataUpdatedAt,
    failedAt: query.errorUpdatedAt,
  };
}

/** A radio chip: the fee and the start times. White when chosen, as the web's. */
function RadioChip({
  label,
  selected,
  disabled,
  onPress,
  numeric,
  grow,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  numeric?: boolean;
  grow?: boolean;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, grow && styles.chipGrow, selected ? styles.chipOn : styles.chipOff, disabled && { opacity: 0.6 }]}
    >
      <T num={numeric} size={14} weight={grow ? 500 : 400} color={selected ? colors.chosenText : colors.textPrimary}>
        {label}
      </T>
    </Pressable>
  );
}

function WaitingRequestCard({ request }: { request: GarageRequest }) {
  const colors = useColors();
  const styles = useStyles();
  // Live to the second, like the web's page-wide ticker.
  const now = useNow(1000);
  const [fee, setFee] = useState<TravelFee>(0);
  const [startAt, setStartAt] = useState<string | null>(null);
  const startTimes = useRequestStartTimes(request.id);
  const accept = useAcceptRequest();
  const decline = useDeclineRequest();
  const starts = startTimes.data?.starts ?? [];
  const left = countdownLabel(Date.parse(request.respondBy) - now);
  const busy = accept.isPending || decline.isPending;
  const chosen = chosenStart(startAt, starts);

  const onAccept = async () => {
    if (!chosen) return;
    try {
      const accepted = await accept.mutateAsync({ id: request.id, startAt: chosen, travelFee: fee });
      toast.success(acceptedToast(accepted.confirmBy));
    } catch (error) {
      toast.error(errorText(error, ACCEPT_FAILED));
    }
  };

  const onDecline = async () => {
    try {
      const result = await decline.mutateAsync(request.id);
      toast.success(declineToast(result.outcome));
    } catch (error) {
      toast.error(errorText(error, DECLINE_FAILED));
    }
  };

  return (
    <ScCard style={[styles.card, styles.cardWaiting]}>
      <View style={styles.head}>
        <T size={11} weight={600} color={colors.warning} uppercase tracking={0.08} style={styles.flex}>
          {waitingLabel(request)}
        </T>
        <T num size={13} weight={600} color={colors.warning} accessibilityLabel={`Time left to answer: ${left}`}>
          {left}
        </T>
      </View>
      <View>
        <T accessibilityRole="header" size={17} weight={600}>
          {servicesLine(request)}
        </T>
        <T size={13} style={styles.lineGap}>
          {whenWhereLine(request)}
        </T>
        <T size={13} color={colors.textSecondary}>
          {`${request.beyond} · ${request.distanceKm} km from you`}
        </T>
        {request.earn !== null ? (
          <T size={13} style={styles.lineGap}>
            {'You earn '}
            <T num size={13} weight={600}>
              {formatINR(request.earn)}
            </T>
            {' + any travel fee'}
          </T>
        ) : null}
      </View>

      <ReachSketch coverKm={request.coverKm} distanceKm={request.distanceKm} outsideKm={request.outsideKm} />

      <View style={styles.group}>
        <T size={12} color={colors.textSecondary}>
          Travel fee (the customer sees it before paying)
        </T>
        <View accessibilityRole="radiogroup" accessibilityLabel="Travel fee" style={styles.feeRow}>
          {REQUEST_RULES.travelFees.map((value) => (
            <RadioChip
              key={value}
              grow
              label={travelFeeLabel(value)}
              selected={fee === value}
              disabled={busy}
              onPress={() => setFee(value)}
            />
          ))}
        </View>
      </View>

      <View style={styles.group}>
        <T size={12} color={colors.textSecondary}>
          {startTimeHeading(request)}
        </T>
        {startTimes.isLoading ? (
          <T size={13} color={colors.textSecondary}>
            Finding your free times…
          </T>
        ) : starts.length === 0 ? (
          <T size={13} color={colors.textSecondary}>
            No free start time left in this window
          </T>
        ) : (
          <View accessibilityRole="radiogroup" accessibilityLabel="Start time" style={styles.startRow}>
            {starts.map((iso) => (
              <RadioChip
                key={iso}
                numeric
                label={istClock(iso)}
                selected={chosen === iso}
                disabled={busy}
                onPress={() => setStartAt(iso)}
              />
            ))}
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <ScButton variant="outline" fullWidth={false} style={styles.flex} onPress={() => void onDecline()} disabled={busy}>
          {"Can't"}
        </ScButton>
        <ScButton
          variant="main"
          fullWidth={false}
          style={styles.flex}
          onPress={() => void onAccept()}
          disabled={!canAccept(chosen, busy)}
        >
          Accept
        </ScButton>
      </View>
      {needsStartHint(chosen, starts.length) ? (
        <T size={12} color={colors.textSecondary}>
          Pick a start time to accept.
        </T>
      ) : null}
    </ScCard>
  );
}

function AcceptedRequestCard({ request }: { request: GarageRequest }) {
  const colors = useColors();
  const styles = useStyles();
  const withdraw = useWithdrawRequest();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();
  return (
    <ScCard style={[styles.card, styles.cardAccepted]}>
      <View style={styles.head}>
        <T accessibilityRole="header" size={15} weight={600} style={styles.flex}>
          {servicesLine(request)}
        </T>
        <ScBadge variant="success">Accepted</ScBadge>
      </View>
      <T size={13}>{acceptedLine(request, istStartLabel)}</T>
      <T size={12} color={colors.textSecondary}>
        It becomes a booking on your Bookings page once the customer pays.
      </T>
      {/* Until the customer pays (0066): the yes can be taken back. */}
      {request.canWithdraw !== false ? (
        <ScButton
          variant="outline"
          size="md"
          accessibilityLabel={`Withdraw your yes to ${servicesLine(request)}`}
          onPress={() => setConfirming(true)}
        >
          Withdraw
        </ScButton>
      ) : null}
      <ConfirmSheet
        open={confirming}
        onClose={() => {
          setConfirming(false);
          setError(undefined);
        }}
        onConfirm={async () => {
          try {
            await withdraw.mutateAsync(request.id);
            toast.success(WITHDRAWN_TOAST);
            setConfirming(false);
          } catch (err) {
            // The customer is paying right now, or it moved on: said here.
            setError(errorText(err, WITHDRAW_FAILED));
          }
        }}
        level="firm"
        title="Withdraw your yes?"
        body={
          <T size={14} lh={19} color={colors.textSecondary}>
            {WITHDRAW_BODY}
          </T>
        }
        confirmLabel="Withdraw"
        cancelLabel="Keep it"
        busy={withdraw.isPending}
        error={error}
      />
    </ScCard>
  );
}

function ClosedRequestCard({ request }: { request: GarageRequest }) {
  const colors = useColors();
  const styles = useStyles();
  const badge = closedBadge(request);
  return (
    <ScCard style={[styles.card, styles.cardClosed]}>
      <View style={styles.head}>
        <T accessibilityRole="header" size={15} weight={600} style={styles.flex}>
          {servicesLine(request)}
        </T>
        <ScBadge variant={badge.variant}>{badge.label}</ScBadge>
      </View>
      <T size={13} color={colors.textSecondary}>
        {whenWhereLine(request)}
      </T>
    </ScCard>
  );
}

/**
 * A sketch, not a map: the garage at the centre of its reach and the customer as a dot at
 * their distance, to scale. No location is sent to the garage before a booking, so none is
 * drawn. The same 300 x 96 drawing as the web's, scaled to the card.
 */
function ReachSketch({
  coverKm,
  distanceKm,
  outsideKm,
}: {
  coverKm: number | null;
  distanceKm: number;
  outsideKm: number;
}) {
  const colors = useColors();
  const styles = useStyles();
  const g = reachGeometry({ coverKm, distanceKm, outsideKm });
  return (
    <View accessibilityRole="image" accessibilityLabel={g.label} style={styles.sketch}>
      <Svg width="100%" height={96} viewBox={`0 0 ${g.width} ${g.height}`}>
        <Circle
          cx={g.cx}
          cy={g.cy}
          r={g.r}
          fill={colors.successMuted}
          stroke={colors.reachStroke}
          strokeDasharray="4 3"
        />
        <Circle cx={g.cx} cy={g.cy} r={4} fill={colors.successFill} />
        <Line
          x1={g.cx}
          y1={g.cy}
          x2={g.dot}
          y2={g.cy}
          stroke={colors.reachLine}
          strokeDasharray="3 3"
        />
        <Circle cx={g.dot} cy={g.cy} r={5} fill={colors.redFill} />
        <SvgText x={g.cx} y={g.cy + 18} textAnchor="middle" fontSize="10" fill={colors.reachLabel}>
          {g.youLabel}
        </SvgText>
        <SvgText x={g.dot} y={g.cy - 10} textAnchor="end" fontSize="10" fill={colors.reachLabel}>
          customer
        </SvgText>
      </Svg>
    </View>
  );
}

export default garageScreen(RequestsScreen);

const useStyles = createStyles((colors) => ({
  flex: { flex: 1, minWidth: 0 },
  list: { gap: 12 },
  card: { gap: 12 },
  cardWaiting: { borderColor: colors.waitingBorder },
  cardAccepted: { gap: 8 },
  cardClosed: { gap: 4 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  lineGap: { marginTop: 4 },
  group: { gap: 8 },
  feeRow: { flexDirection: 'row', gap: 8 },
  startRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  chipGrow: { flex: 1 },
  chipOn: { borderColor: colors.chosenBg, backgroundColor: colors.chosenBg },
  chipOff: { borderColor: colors.border, backgroundColor: colors.surface },
  actions: { flexDirection: 'row', gap: 8 },
  sketch: { height: 96, overflow: 'hidden', borderRadius: 12, backgroundColor: colors.surfaceElevated },
}));
