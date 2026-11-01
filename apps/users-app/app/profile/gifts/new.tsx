import { ApiError } from '@repo/core/api/client';
import { makeGiftLink, verifyGiftPayment, type GiftLink, type SentGift } from '@repo/core/api/gifts';
import { giftsEnabled, invalidateGiftData, useGiftsConfig } from '@repo/core/api/hooks/use-gifts';
import { useUserStore } from '@repo/core/stores/user-store';
import { Label, ScButton } from '@repo/native-ui/button';
import { Chip } from '@repo/native-ui/chip';
import { ScInput, ScTextarea } from '@repo/native-ui/inputs';
import { ScCard, Skeleton, Spinner } from '@repo/native-ui/primitives';
import { ConfirmSheet } from '@repo/native-ui/sheet';
import { FigureLine, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { useQueryClient } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GiftShare } from '@/components/gifts/gift-share';
import { GiftsUnavailable } from '@/components/gifts/gifts-unavailable';
import { PageHeader } from '@/components/page-header';
import { PremiumCard } from '@/components/premium-card/premium-card';
import { useAuth } from '@/lib/auth';
import { startGiftPayment } from '@/lib/charge-payment';
import { openCheckout } from '@/lib/checkout';
import { confirmOrderTotal } from '@/lib/checkout-maths';
import { errorText } from '@/lib/error-text';
import { GIFT_ART_LABELS, GIFT_ARTS, giftAmountProblem, giftRupees, parseGiftAmount, type GiftArt } from '@/lib/gifts';
import { pendingKey, pendingPayment, setPaymentFlowOnScreen, usePendingKeys } from '@/lib/pending-payment';
import { giftCardSpec } from '@/lib/premium-card';

const NAME_MAX = 60;
const MESSAGE_MAX = 200;

type Phase = { kind: 'form' } | { kind: 'confirming' } | { kind: 'shared'; gift: SentGift; link: GiftLink } | { kind: 'unconfirmed'; paid: boolean };

/** apps/users/app/profile/gifts/new/page.tsx, with the bills' guard against paying twice. */
export default function NewGiftScreen() {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const profile = useUserStore((s) => s.profile);
  const config = useGiftsConfig();
  const pendingKeys = usePendingKeys();
  const [preset, setPreset] = useState<number | 'other'>(1000);
  const [otherAmount, setOtherAmount] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [message, setMessage] = useState('');
  const [art, setArt] = useState<GiftArt>('shine');
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const [totalCheck, setTotalCheck] = useState<{ rupees: number; resolve: (agreed: boolean) => void } | null>(null);
  const title = phase.kind === 'shared' ? 'Share your gift' : 'Gift a wash';
  const page = (children: React.ReactNode) => (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title={title} backTo="/profile/gifts" />
      {children}
    </View>
  );
  if (!user) {
    return page(
      <View style={styles.center}>
        <T size={15} weight={600} align="center">
          Sign in to gift a wash
        </T>
        <ScButton variant="main" fullWidth={false} paddingX={32} onPress={() => router.push(`/login?next=${encodeURIComponent('/profile/gifts/new')}` as Href)}>
          Sign in
        </ScButton>
      </View>
    );
  }
  if (config.isPending) {
    return page(
      <View style={styles.body}>
        <Skeleton height={160} />
        <Skeleton height={160} />
      </View>
    );
  }
  if (!giftsEnabled(config.data)) return page(<GiftsUnavailable />);

  const limits = config.data;
  const arts = GIFT_ARTS.filter((value) => limits.designs.includes(value));
  const amount = preset === 'other' ? parseGiftAmount(otherAmount) : preset;
  const amountProblem = giftAmountProblem(amount, limits);
  const name = recipientName.trim();
  const checking = pendingKeys.some((key) => key.startsWith('gift:')) && !paying;
  const canPay = !amountProblem && name.length > 0 && !paying && !checking;

  const pay = async () => {
    if (!canPay || amount === null) return;
    setPaying(true);
    setPaymentFlowOnScreen(true);
    setError(null);
    try {
      const started = await startGiftPayment({ amount, recipientName: name, message: message.trim() || undefined, design: art });
      if (started.kind !== 'order') {
        if (started.kind === 'checking') toast.info("We're still checking your last gift payment. There's no need to pay again.");
        else if (started.kind === 'failed') toast.error(started.message);
        else {
          toast.success('Your gift is paid. Get its link in Gifts you sent.');
          router.replace('/profile/gifts' as Href);
        }
        return;
      }
      const { order } = started;
      const key = pendingKey({ kind: 'gift', giftId: order.giftId, startedAt: 0 });
      const agreed = await confirmOrderTotal(order.amount, amount, (rupees) => new Promise((resolve) => setTotalCheck({ rupees, resolve })));
      if (!agreed) {
        pendingPayment.clear(key);
        toast.info('Nothing was charged.');
        return;
      }
      const result = await openCheckout({ orderId: order.orderId, amount: order.amount, currency: order.currency, keyId: order.keyId }, { description: `Detlio gift for ${name}`, name: profile?.name, phone: profile?.phone });
      if (result.kind === 'cancelled') {
        pendingPayment.clear(key);
        toast.info('Payment cancelled. Nothing was charged.');
        return;
      }
      if (result.kind === 'failed') {
        pendingPayment.clear(key);
        toast.error(result.message);
        return;
      }
      setPhase({ kind: 'confirming' });
      let gift: SentGift;
      try {
        gift = (await verifyGiftPayment(order.giftId, { razorpayOrderId: result.orderId, razorpayPaymentId: result.paymentId, razorpaySignature: result.signature })).gift;
      } catch {
        // Razorpay took the money; its webhook marks the gift paid. The record stays until it does.
        void invalidateGiftData(queryClient);
        setPhase({ kind: 'unconfirmed', paid: false });
        return;
      }
      pendingPayment.clear(key);
      void invalidateGiftData(queryClient);
      try {
        // Once, here: a second call would end this link.
        const link = await makeGiftLink(gift.id);
        setPhase({ kind: 'shared', gift: { ...gift, linkMade: true }, link });
      } catch {
        setPhase({ kind: 'unconfirmed', paid: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : errorText(err, 'Could not start the payment. Please try again.'));
    } finally {
      setPaymentFlowOnScreen(false);
      setPaying(false);
    }
  };

  if (phase.kind === 'shared') {
    return page(
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        <GiftShare gift={phase.gift} link={phase.link} />
        <Pressable accessibilityRole="link" onPress={() => router.replace('/profile/gifts' as Href)} style={styles.done}>
          <T size={13} weight={500} lh={18} color={colors.textSecondary}>
            Done
          </T>
        </Pressable>
      </ScrollView>
    );
  }
  if (phase.kind === 'confirming' || phase.kind === 'unconfirmed') {
    return page(
      <View style={styles.body}>
        {phase.kind === 'confirming' ? (
          <View style={styles.status}>
            <Spinner size={16} />
            <T size={13} lh={18} color={colors.textSecondary}>
              Payment received. Getting your gift ready…
            </T>
          </View>
        ) : (
          <ScCard style={styles.gap12}>
            <T size={13} lh={18}>
              {phase.paid ? "Your gift is paid, but we couldn't make its link just now." : "Payment received. We couldn't confirm it here yet."}
            </T>
            <T size={12} lh={16} color={colors.textSecondary}>
              Your gift shows in Gifts you sent once the payment is confirmed, usually within a few minutes. Tap Get the link there to share it. You won&apos;t be charged again.
            </T>
            <ScButton variant="outline" onPress={() => router.replace('/profile/gifts' as Href)}>
              Go to Gifts you sent
            </ScButton>
          </ScCard>
        )}
      </View>
    );
  }
  return page(
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.preview}>
        <PremiumCard key={art} spec={giftCardSpec({ design: art, amount, recipientName: name, validMonths: limits.validMonths })} />
      </View>

      <View style={styles.section}>
        <T size={14} weight={600} lh={20}>
          Card
        </T>
        <View accessibilityRole="radiogroup" style={styles.swatches}>
          {arts.map((value) => (
            <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: art === value }} onPress={() => setArt(value)} style={styles.swatch}>
              <View style={[styles.swatchCard, art === value && styles.swatchOn]}>
                <PremiumCard spec={giftCardSpec({ design: value, amount, validMonths: limits.validMonths })} size="mini" animate={false} />
              </View>
              <T size={12} weight={art === value ? 600 : 400} lh={16} color={art === value ? colors.textPrimary : colors.textSecondary}>
                {GIFT_ART_LABELS[value]}
              </T>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <T size={14} weight={600} lh={20}>
          Amount
        </T>
        <View style={styles.chips}>
          {limits.presets.map((value) => (
            <Chip key={value} label={giftRupees(value)} selected={preset === value} onPress={() => setPreset(value)} />
          ))}
          <Chip label="Other amount" selected={preset === 'other'} onPress={() => setPreset('other')} />
        </View>
        {preset === 'other' ? (
          <View style={styles.gap4}>
            <ScInput label={`Amount (${giftRupees(limits.min)} to ${giftRupees(limits.max)})`} keyboardType="number-pad" placeholder={String(limits.min)} value={otherAmount} onChangeText={(t) => setOtherAmount(t.replace(/[^\d]/g, '').slice(0, 5))} />
            {otherAmount && amountProblem ? (
              <T size={11} lh={15} color={colors.error}>
                {amountProblem}
              </T>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.gap12}>
        <T size={14} weight={600} lh={20}>
          Who it&apos;s for
        </T>
        <ScInput label="Their name" autoComplete="off" autoCorrect={false} maxLength={NAME_MAX} value={recipientName} onChangeText={setRecipientName} />
        <View style={styles.gap4}>
          <ScTextarea label="Message (optional)" rows={3} maxLength={MESSAGE_MAX} value={message} onChangeText={(t) => setMessage(t.replace(/[\r\n]+/g, ' '))} />
          <T num size={11} lh={15} align="right" color={colors.textMuted}>{`${message.length}/${MESSAGE_MAX}`}</T>
        </View>
      </View>

      <FigureLine size={12} lh={16} color={colors.textSecondary} text={`They can use it on any booking on Detlio for ${limits.validMonths} months from today. You get a link to send them after paying. Up to ${giftRupees(limits.dailyLimit)} of gifts a day.`} />
      {error ? (
        <T accessibilityRole="alert" size={12} lh={16} color={colors.error}>
          {error}
        </T>
      ) : null}
      {checking ? (
        <ScButton variant="quiet" height={52} disabled>
          <Spinner size={16} />
          <Label>Checking your payment…</Label>
        </ScButton>
      ) : (
        <ScButton variant="hero" disabled={!canPay} onPress={() => void pay()}>
          <Label color={colors.white}>
            <FigureLine color={colors.white} size={15} weight={700} text={paying ? 'Opening payment…' : amount !== null && !amountProblem ? `Pay ${giftRupees(amount)}` : 'Pay'} />
          </Label>
        </ScButton>
      )}
      <ConfirmSheet
        open={totalCheck !== null}
        level="firm"
        title="The total has changed"
        body={totalCheck ? `The total to pay is now ${giftRupees(totalCheck.rupees)}. Nothing has been charged.` : undefined}
        confirmLabel={totalCheck ? `Pay ${giftRupees(totalCheck.rupees)}` : 'Pay'}
        cancelLabel="Don't pay"
        onConfirm={() => {
          totalCheck?.resolve(true);
          setTotalCheck(null);
        }}
        onClose={() => {
          totalCheck?.resolve(false);
          setTotalCheck(null);
        }}
      />
    </ScrollView>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 16 },
  body: { gap: 16, paddingHorizontal: 16, paddingTop: 16 },
  preview: { width: '100%', maxWidth: 300, alignSelf: 'center' },
  section: { gap: 8 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, marginHorizontal: -5 },
  swatch: { width: '33.33%', paddingHorizontal: 5, gap: 6 },
  swatchCard: { borderRadius: 8, borderWidth: 2, borderColor: 'transparent' },
  swatchOn: { borderColor: c.textPrimary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gap4: { gap: 4 },
  gap12: { gap: 12 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 32 },
  done: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
}));
