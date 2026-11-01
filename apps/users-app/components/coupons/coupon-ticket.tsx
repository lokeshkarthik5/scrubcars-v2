import type { CouponReward } from '@repo/core/coupons';
import { formatOfferFigure } from '@repo/core/offer-figure';
import { ScCard } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import type { ReactNode } from 'react';
import { View } from 'react-native';

interface CouponTicketProps {
  reward: CouponReward;
  title: string;
  conditions: string[];
  amountOff?: number | null;
  percentOff?: number | null;
  stamps?: number | null;
  code?: string | null;
  dimmed?: boolean;
  children?: ReactNode;
}

function figureOf(props: CouponTicketProps): { text: string; under: string } {
  switch (props.reward) {
    case 'amount':
      return { text: formatOfferFigure({ kind: 'amount', rupees: props.amountOff ?? 0 }).text, under: 'off' };
    case 'percent':
      return { text: formatOfferFigure({ kind: 'percent', value: props.percentOff ?? 0 }).text, under: 'off' };
    case 'free_wash':
      return { text: 'FREE', under: 'car wash' };
    case 'stamps':
      return { text: `+${props.stamps ?? 0}`, under: props.stamps === 1 ? 'stamp' : 'stamps' };
  }
}

/** CouponTicket (apps/users/components/coupons/coupon-ticket.tsx). */
export function CouponTicket(props: CouponTicketProps) {
  const colors = useColors();
  const styles = useStyles();
  const figure = figureOf(props);
  return (
    <ScCard style={[styles.ticket, props.dimmed && styles.dim]}>
      <View style={styles.stub}>
        <T num size={26} weight={700} lh={28}>
          {figure.text}
        </T>
        <T size={11} lh={15} color={colors.textSecondary}>
          {figure.under}
        </T>
      </View>
      <View style={styles.body}>
        <T size={11} weight={500} lh={15} uppercase tracking={0.05} color={colors.textMuted}>
          Detlio coupon
        </T>
        <T size={15} weight={600} lh={20}>
          {props.title}
        </T>
        <View>
          {props.conditions.map((line) => (
            <T key={line} size={12} lh={16} color={colors.textSecondary}>
              {line}
            </T>
          ))}
        </View>
        {props.code ? (
          <T num size={12} lh={16} tracking={0.05}>
            {props.code}
          </T>
        ) : null}
        {props.children}
      </View>
    </ScCard>
  );
}

const useStyles = createStyles((c) => ({
  ticket: { flexDirection: 'row', alignItems: 'stretch', overflow: 'hidden', padding: 0 },
  dim: { opacity: 0.6 },
  stub: { width: 96, alignItems: 'center', justifyContent: 'center', gap: 2, borderRightWidth: 1, borderRightColor: c.border, borderStyle: 'dashed' },
  body: { flex: 1, minWidth: 0, gap: 6, paddingHorizontal: 16, paddingVertical: 14 },
}));
