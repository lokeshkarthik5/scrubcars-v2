import type { BookOwed } from '@repo/core/api/garage-book';
import { useBookOwed, useMarkPaid } from '@repo/core/api/hooks/use-garage-book';
import { whatsAppHref } from '@repo/core/contact-links';
import { owedMessage, owedSummary, rupees, shortDate } from '@repo/core/garage-book';
import { msg, useT } from '@repo/core/i18n';
import { useState } from 'react';
import { View } from 'react-native';

import { Edge } from '@repo/native-ui/finish';
import { LoadError, SkeletonList } from '@repo/native-ui/primitives';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';

import { garageScreen } from '@/components/app-shell';
import { BookScreen } from '@/components/book/book-screen';
import { BackHeader, BookInput, Empty, Overline, RaisedButton, Seg } from '@/components/book/parts';
import { useAuth, useIsVendorAdmin } from '@/lib/auth';
import { openLink } from '@/lib/open-link';

/** Money owed (S5, the owner's; the web's app/book/owed/page.tsx). A record only. */
function OwedScreen() {
  const t = useT();
  const styles = useStyles();
  const colors = useColors();
  const isOwner = useIsVendorAdmin();
  const owed = useBookOwed(isOwner);
  // The name in the WhatsApp the customer gets, which stays English.
  const garage = useAuth((s) => s.vendor?.businessName) ?? 'your garage';
  const [paying, setPaying] = useState<BookOwed['customers'][number] | null>(null);
  const data = owed.data;
  return (
    <BookScreen>
      <BackHeader title={t('Money owed')} />
      {!isOwner ? (
        <Empty>{t('Only the garage’s owner sees money.')}</Empty>
      ) : !data ? (
        owed.isError ? <LoadError what={t('money owed')} onRetry={() => void owed.refetch()} /> : <SkeletonList count={3} height={112} />
      ) : (
        <>
          <Edge radius={22} innerStyle={styles.total}>
            <Overline>{t('Owed to you')}</Overline>
            <T num size={34} weight={600} lh={42}>
              {rupees(data.totalPaise) ?? '₹0'}
            </T>
            <T size={12} color={colors.textSecondary}>
              {data.customers.length ? owedSummary(data.customers.length, data.oldestAt) : t('No one owes you anything.')}
            </T>
          </Edge>
          <View style={styles.list}>
            {data.customers.map((row) => {
              const ask = whatsAppHref(row.phone, owedMessage({ name: row.name, garage, amountPaise: row.balancePaise, payLine: data.payLine }));
              return (
                <Edge key={row.customerId} radius={18} innerStyle={styles.card}>
                  <View style={styles.cardHead}>
                    <View style={styles.flex}>
                      <T variant="t3" weight={600} numberOfLines={1}>
                        {row.name}
                      </T>
                      <T size={12} color={colors.textSecondary} numberOfLines={1}>
                        {[row.lastLabel, row.jobs > 1 ? t('{count} jobs', { count: row.jobs }) : null, row.oldestAt ? t('since {date}', { date: shortDate(row.oldestAt) }) : null].filter(Boolean).join(' · ')}
                      </T>
                    </View>
                    <T num size={18} weight={600}>
                      {rupees(row.balancePaise) ?? ''}
                    </T>
                  </View>
                  <View style={styles.row}>
                    <RaisedButton label={ask ? t('Ask on WhatsApp') : t('No mobile')} height={40} radius={12} disabled={!ask} onPress={() => ask && openLink(ask)} style={styles.flex} />
                    <RaisedButton label={t('Mark paid')} height={40} radius={12} onPress={() => setPaying(row)} style={styles.flex} />
                  </View>
                </Edge>
              );
            })}
          </View>
          {data.recent.length > 0 ? (
            <View>
              <Overline>{t('Paid back recently')}</Overline>
              {data.recent.map((row, index) => (
                <View key={index} style={styles.paid}>
                  <T size={14}>{`${row.name} · ${shortDate(row.at)}`}</T>
                  <T num size={14} color="#4ADE80">
                    {rupees(row.amountPaise) ?? ''}
                  </T>
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}
      <MarkPaidSheet row={paying} onClose={() => setPaying(null)} />
    </BookScreen>
  );
}

function MarkPaidSheet({ row, onClose }: { row: BookOwed['customers'][number] | null; onClose: () => void }) {
  const t = useT();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'upi' | 'cash'>('upi');
  const pay = useMarkPaid();
  if (!row) return null;
  const paise = Math.round((amount === '' ? row.balancePaise / 100 : Number(amount)) * 100);
  const ok = Number.isFinite(paise) && paise >= 100 && paise <= row.balancePaise;
  return (
    <ScSheet open onClose={onClose} accessibilityLabel={t('{name} paid', { name: row.name })} horizontalPadding={16}>
      <View style={{ gap: 16, paddingBottom: 8 }}>
        <T variant="t2">{t('{name} paid', { name: row.name })}</T>
        <T variant="t4" weight={600} color="#D4D4DA">
          {t('How much (₹)')}
        </T>
        <BookInput value={amount} onChangeText={(text) => setAmount(text.replace(/[^\d.]/g, ''))} placeholder={String(row.balancePaise / 100)} keyboardType="numeric" accessibilityLabel={t('How much')} />
        <Seg<'upi' | 'cash'>
          label={msg('Paid by')}
          value={method}
          onChange={setMethod}
          options={[
            { value: 'upi', label: 'UPI' },
            { value: 'cash', label: msg('Cash') },
          ]}
        />
        <RaisedButton
          label={pay.isPending ? t('Saving…') : t('Mark {amount} paid', { amount: ok ? (rupees(paise) ?? '') : '' })}
          disabled={!ok || pay.isPending}
          onPress={() =>
            pay.mutate(
              { customerId: row.customerId, amountPaise: paise, method },
              {
                onSuccess: () => {
                  toast.success(t('{amount} marked paid', { amount: rupees(paise) ?? '' }));
                  setAmount('');
                  onClose();
                },
                onError: (error) => toast.error(error instanceof Error ? error.message : t("Couldn't save. Try again.")),
              }
            )
          }
        />
      </View>
    </ScSheet>
  );
}

export default garageScreen(OwedScreen);

const useStyles = createStyles(() => ({
  flex: { flex: 1, minWidth: 0 },
  total: { padding: 16 },
  list: { gap: 8 },
  card: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  paid: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1D1D23' },
}));
