import { useAnswerRepairQuote, useGarageRepairQuotes } from '@repo/core/api/hooks/use-repair-quotes';
import { useT } from '@repo/core/i18n';
import { REPAIR_QUOTE_RULES } from '@repo/core/repair-quotes';
import { ScButton } from '@repo/native-ui/button';
import { IconTool } from '@repo/native-ui/icons';
import { ScInput, ScTextarea } from '@repo/native-ui/inputs';
import { EmptyState, LoadError, SkeletonList } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AnswerDeadline } from '@/components/answer-deadline';
import { AppShell, garageScreen } from '@/components/app-shell';
import { carLine } from '@/components/repair-quote-card';
import { ScSwitch, TopBar } from '@/components/rows';
import { errorText } from '@/lib/error-text';
import { quoteProblem, rupees } from '@/lib/repair-quote-view';

const R = REPAIR_QUOTE_RULES;

/**
 * apps/vendors/app/requests/repair/[id]/page.tsx: "Your quote" (0075). The garage's estimate
 * for a repair request — price from and to, days needed, whether it must see the car first,
 * and a note — under the same answer timer as a new booking. Only while it waits for this
 * garage, in time; the API refuses anything else.
 */
function RepairQuoteAnswerScreen() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const list = useGarageRepairQuotes('open');
  const answer = useAnswerRepairQuote();
  const quote = list.data?.items.find((item) => item.id === id);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [days, setDays] = useState<number | null>(null);
  const [moreDays, setMoreDays] = useState('4');
  const [needsInspection, setNeedsInspection] = useState(true);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const priceFrom = rupees(from);
  const priceTo = rupees(to);
  const dayCount = days === 4 ? rupees(moreDays) : days;
  const problemKey = quoteProblem({ from: priceFrom, to: priceTo, days: dayCount });
  const problem = problemKey ? t(problemKey) : null;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/requests' as Href));

  const send = async () => {
    if (problem || priceFrom === null || priceTo === null || dayCount === null || !id) return;
    setError(null);
    try {
      await answer.mutateAsync({
        quoteId: id,
        answer: { canDo: true, priceFrom, priceTo, days: dayCount, needsInspection, ...(note.trim() ? { note: note.trim() } : {}) },
      });
      toast.success(t('Quote sent. We’ll tell you if they book a visit.'));
      router.replace('/requests' as Href);
    } catch (err) {
      setError(errorText(err, t('Could not send the quote. Please try again.')));
    }
  };

  return (
    <AppShell hasNav={false} gap={16}>
      <TopBar title={t('Your quote')} onBack={back} />
      {list.isLoading ? (
        <SkeletonList count={2} height={200} />
      ) : list.isError && !list.data ? (
        <LoadError what={t('this request')} onRetry={() => void list.refetch()} retrying={list.isFetching} />
      ) : !quote ? (
        <EmptyState
          icon={<IconTool size={28} stroke={1.5} color={colors.textSecondary} />}
          title={t('This request isn’t waiting for you')}
          subtitle={t('It was answered, closed, or its time ran out.')}
        />
      ) : (
        <>
          <View style={styles.clock}>
            <AnswerDeadline deadline={{ respondBy: quote.respondBy, enforced: true, windowMins: quote.answerWindowMins }} />
            <T size={15} color={colors.textSecondary} style={styles.clockLine}>
              {`${quote.title} · ${carLine(quote, t)}`}
            </T>
          </View>

          <View style={styles.prices}>
            <View style={styles.flex}>
              <ScInput label={t('Price from (₹)')} keyboardType="number-pad" numeric value={from} onChangeText={setFrom} placeholder="4,000" />
            </View>
            <View style={styles.flex}>
              <ScInput label={t('Price to (₹)')} keyboardType="number-pad" numeric value={to} onChangeText={setTo} placeholder="5,500" />
            </View>
          </View>

          <View style={styles.group}>
            <T size={12} color={colors.textSecondary}>
              {t('Days needed')}
            </T>
            <View accessibilityRole="radiogroup" accessibilityLabel={t('Days needed')} style={styles.days}>
              {[1, 2, 3, 4].map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: days === value }}
                  onPress={() => setDays(value)}
                  style={[styles.day, days === value ? styles.dayOn : styles.dayOff]}
                >
                  <T num size={14} weight={500} color={days === value ? colors.chosenText : colors.textPrimary}>
                    {value === 4 ? '4+' : String(value)}
                  </T>
                </Pressable>
              ))}
            </View>
            {days === 4 ? <ScInput label={t('How many days?')} keyboardType="number-pad" numeric value={moreDays} onChangeText={setMoreDays} /> : null}
          </View>

          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <T size={15}>{t('Need to see the car first')}</T>
              <T size={12} color={colors.textSecondary}>
                {t('The customer sees this before booking.')}
              </T>
            </View>
            <ScSwitch checked={needsInspection} onChange={setNeedsInspection} label={t('Need to see the car first')} />
          </View>

          <ScTextarea
            label={t('Note for the customer (optional)')}
            value={note}
            maxLength={R.garageNoteMax}
            rows={3}
            onChangeText={setNote}
            placeholder={t('Can match the paint and polish the rest of the bumper.')}
          />

          <T size={12} color={colors.textSecondary}>
            {t('This is an estimate. You set the final bill at the garage. Anything above it goes to the customer as extra work for their OK.')}
          </T>
          {error ? (
            <T accessibilityRole="alert" size={13} color={colors.error}>
              {error}
            </T>
          ) : null}
          <ScButton variant="main" size="lg" onPress={() => void send()} disabled={Boolean(problem) || answer.isPending} disabledReason={problem ?? undefined}>
            {answer.isPending ? t('Sending…') : t('Send quote')}
          </ScButton>
        </>
      )}
    </AppShell>
  );
}

export default garageScreen(RepairQuoteAnswerScreen);

const useStyles = createStyles((c) => ({
  flex: { flex: 1, minWidth: 0 },
  clock: { overflow: 'hidden', borderRadius: 20, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  clockLine: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  prices: { flexDirection: 'row', gap: 12 },
  group: { gap: 8 },
  days: { flexDirection: 'row', gap: 8 },
  day: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1 },
  dayOn: { borderColor: c.chosenBg, backgroundColor: c.chosenBg },
  dayOff: { borderColor: c.border, backgroundColor: c.surface },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
}));
