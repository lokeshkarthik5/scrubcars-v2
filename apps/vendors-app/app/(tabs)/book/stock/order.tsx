import type { SupplySuggestions } from '@repo/core/api/garage-book';
import { useReceiveSupplyOrder, useSendSupplyOrder, useSupplyOrders, useSupplySuggestions } from '@repo/core/api/hooks/use-garage-book';
import { rupees, shortDate } from '@repo/core/garage-book';
import { useT } from '@repo/core/i18n';
import { useState } from 'react';
import { View } from 'react-native';

import { Edge, RedButton } from '@repo/native-ui/finish';
import { IconBrandWhatsapp, IconTruckDelivery } from '@repo/native-ui/icons';
import { LoadError, SkeletonList } from '@repo/native-ui/primitives';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors, useFinish } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';

import { garageScreen } from '@/components/app-shell';
import { BookScreen } from '@/components/book/book-screen';
import { BackHeader, Empty, Footnote, IconWell, Overline, RaisedButton, Row, Stepper } from '@/components/book/parts';
import { useIsVendorAdmin } from '@/lib/auth';
import { changePacks, orderLineName, orderLines, orderPayload, orderTotal, supplierLine, type OrderLine } from '@/lib/garage-book-2';
import { openLink } from '@/lib/open-link';

type Group = SupplySuggestions['groups'][number];

/**
 * Order supplies (K3, the owner's; the web's app/book/stock/order/page.tsx): what is running
 * low, filled in by supplier, sent on WhatsApp; then Received puts the stock up and the bill
 * into Expenses, once.
 */
function OrderScreen() {
  const t = useT();
  const isOwner = useIsVendorAdmin();
  const suggest = useSupplySuggestions(isOwner);
  const orders = useSupplyOrders(isOwner);
  const [pick, setPick] = useState(0);
  const groups = suggest.data?.groups ?? [];
  const group = groups[pick] ?? groups[0] ?? null;
  return !isOwner ? (
    <BookScreen>
      <BackHeader title={t('Order supplies')} />
      <Empty>{t('Only the garage’s owner orders supplies.')}</Empty>
    </BookScreen>
  ) : !suggest.data ? (
    <BookScreen>
      <BackHeader title={t('Order supplies')} />
      {suggest.isError ? <LoadError what={t('supplies')} onRetry={() => void suggest.refetch()} /> : <SkeletonList count={3} height={72} />}
    </BookScreen>
  ) : (
    <OrderBody
      key={group ? `${group.supplier?.id ?? 'none'}-${pick}` : 'empty'}
      groups={groups}
      group={group}
      onPick={setPick}
      waiting={(orders.data ?? []).filter((order) => order.status === 'sent')}
    />
  );
}

function OrderBody({
  groups,
  group,
  onPick,
  waiting,
}: {
  groups: Group[];
  group: Group | null;
  onPick: (index: number) => void;
  waiting: NonNullable<ReturnType<typeof useSupplyOrders>['data']>;
}) {
  const t = useT();
  const styles = useStyles();
  const colors = useColors();
  const { scheme } = useFinish();
  const send = useSendSupplyOrder();
  const receive = useReceiveSupplyOrder();
  const [lines, setLines] = useState<OrderLine[]>(() => (group ? orderLines(group) : []));
  const [choosing, setChoosing] = useState(false);
  const supplier = group?.supplier ?? null;
  const total = orderTotal(lines);
  const payload = supplier ? orderPayload(supplier.id, lines) : null;
  const failed = (error: unknown) => toast.error(error instanceof Error ? error.message : t("Couldn't send. Try again."));

  const sendNow = () => {
    if (!payload || payload.lines.length === 0) return;
    send.mutate(payload, {
      onSuccess: (answer) => {
        if (answer.whatsappUrl) {
          toast.success(t('Order written down. Press Send in WhatsApp.'));
          openLink(answer.whatsappUrl);
        } else {
          toast.info(t('Order written down. {name} has no WhatsApp number, so tell them yourself.', { name: answer.order.supplier.name }));
        }
      },
      onError: failed,
    });
  };

  return (
    <BookScreen
      gap={14}
      hasNav={false}
      footer={
        group && supplier ? (
          <RedButton onPress={sendNow} disabled={!payload || payload.lines.length === 0 || send.isPending} height={52} radius={18}>
            <View style={styles.redLabel}>
              <IconBrandWhatsapp size={18} color="#FFFFFF" />
              <T variant="t3" weight={600} color="#FFFFFF">
                {send.isPending ? t('Sending…') : t('Send order on WhatsApp')}
              </T>
            </View>
          </RedButton>
        ) : undefined
      }
    >
      <BackHeader title={t('Order supplies')} />
      {!group ? (
        <Empty>{t('Nothing is running low. Your stock is fine.')}</Empty>
      ) : (
        <>
          <Edge radius={20} innerStyle={styles.supplier}>
            <IconWell>
              <IconTruckDelivery size={19} metal={scheme === 'dark'} />
            </IconWell>
            <View style={styles.flex}>
              <T size={15} weight={600} numberOfLines={2}>
                {supplier?.name ?? t('No supplier yet')}
              </T>
              <T size={12} color={colors.textSecondary} numberOfLines={1} style={styles.subLine}>
                {supplier ? supplierLine(supplier) : t('Set a supplier on these items to order them')}
              </T>
            </View>
            {groups.length > 1 ? <RaisedButton label={t('Change')} height={36} radius={10} onPress={() => setChoosing(true)} /> : null}
          </Edge>
          <View>
            <Overline>{t('Running low, filled in for you')}</Overline>
            {lines.map((line) => (
              <Row key={line.itemId}>
                <View style={styles.flex}>
                  <T size={14} weight={600} numberOfLines={2}>
                    {orderLineName(line)}
                  </T>
                  <T size={12} color={colors.textSecondary} style={styles.subLine}>
                    {line.packPricePaise !== null ? t('{amount} each', { amount: rupees(line.packPricePaise) ?? '' }) : t('No price yet')}
                  </T>
                </View>
                <Stepper
                  value={String(line.packs)}
                  onLess={() => setLines((current) => changePacks(current, line.itemId, -1))}
                  onMore={() => setLines((current) => changePacks(current, line.itemId, 1))}
                  lessLabel={t('Fewer {name}', { name: line.name })}
                  moreLabel={t('More {name}', { name: line.name })}
                />
                <T num size={14} align="right" style={styles.amount}>
                  {line.packPricePaise !== null ? (rupees(line.packs * line.packPricePaise) ?? '') : '–'}
                </T>
              </Row>
            ))}
          </View>
          <View style={styles.total}>
            <Overline>{t('Total')}</Overline>
            <T num size={22} weight={600}>
              {rupees(total) ?? '₹0'}
            </T>
          </View>
          <Footnote>{t('Your supplier, your prices. When it arrives, tap Received: the stock goes up and the bill goes into Expenses.')}</Footnote>
        </>
      )}
      {waiting.length > 0 ? (
        <View>
          <Overline>{t('On the way')}</Overline>
          {waiting.map((order) => (
            <Row key={order.id}>
              <View style={styles.flex}>
                <T size={14} weight={600} numberOfLines={1}>
                  {order.supplier.name}
                </T>
                <T size={12} color={colors.textSecondary} numberOfLines={1} style={styles.subLine}>
                  {`${t('sent {date}', { date: shortDate(order.sentAt) })} · ${rupees(order.totalPaise) ?? ''}`}
                </T>
              </View>
              <RaisedButton
                label={t('Received')}
                height={44}
                radius={12}
                disabled={receive.isPending}
                onPress={() =>
                  receive.mutate(order.id, {
                    onSuccess: (answer) => toast.success(answer.added ? t('Stock added and {amount} put in Expenses', { amount: rupees(answer.order.totalPaise) ?? '' }) : t('Already marked received')),
                    onError: failed,
                  })
                }
              />
            </Row>
          ))}
        </View>
      ) : null}
      <ScSheet open={choosing} onClose={() => setChoosing(false)} accessibilityLabel={t('Choose a supplier')} horizontalPadding={16}>
        <View style={styles.sheet}>
          <T variant="t2">{t('Choose a supplier')}</T>
          {groups.map((option, index) => (
            <RaisedButton
              key={option.supplier?.id ?? 'none'}
              label={`${option.supplier?.name ?? t('No supplier yet')} · ${option.lines.length}`}
              height={44}
              onPress={() => {
                setChoosing(false);
                onPick(index);
              }}
            />
          ))}
        </View>
      </ScSheet>
    </BookScreen>
  );
}

export default garageScreen(OrderScreen);

const useStyles = createStyles(() => ({
  flex: { flex: 1, minWidth: 0 },
  supplier: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  subLine: { marginTop: 2 },
  amount: { width: 62 },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  redLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheet: { gap: 10, paddingBottom: 8 },
}));
