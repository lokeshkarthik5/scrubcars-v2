import type { BookExpense } from '@repo/core/api/garage-book';
import { useAddExpense, useBookExpenses, useBookTeam, useRemoveExpense, useUpdateExpense } from '@repo/core/api/hooks/use-garage-book';
import {
  EXPENSE_CATEGORIES,
  expenseCategoryWord,
  GARAGE_BOOK_2_LIMITS,
  istDateKey,
  monthName,
  recentMonths,
  rupees,
  type ExpenseCategory,
  type ExpenseMethod,
} from '@repo/core/garage-book';
import { msg, useT } from '@repo/core/i18n';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Edge, Raised, Recessed, RedButton } from '@repo/native-ui/finish';
import { IconChevronDown, IconPlus } from '@repo/native-ui/icons';
import { PressScale } from '@repo/native-ui/motion';
import { LoadError, SkeletonList } from '@repo/native-ui/primitives';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';

import { garageScreen } from '@/components/app-shell';
import { BackHeader, BookInput, Chip, Empty, FieldLabel, Overline, RaisedButton, Row, Seg, Switch, Tag } from '@/components/book/parts';
import { BookScreen } from '@/components/book/book-screen';
import { DateField } from '@/components/form-controls';
import { useIsVendorAdmin } from '@/lib/auth';
import { categoryChips, dayMonth, expenseSub, expenseTitle, moneyTyping, rupeesToPaise, spentShare } from '@/lib/garage-book-2';

/** Expenses (E1, the owner's; the web's app/book/expenses/page.tsx): spent, profit, every expense. */
function ExpensesScreen() {
  const t = useT();
  const styles = useStyles();
  const colors = useColors();
  const isOwner = useIsVendorAdmin();
  const now = new Date();
  const thisMonth = istDateKey(now).slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<BookExpense | 'new' | null>(null);
  const expenses = useBookExpenses(month === thisMonth ? undefined : month, isOwner);
  const data = expenses.data;
  const share = data ? spentShare(data.takenPaise, data.spentPaise) : null;
  return (
    <BookScreen>
      <BackHeader
        title={t('Expenses')}
        right={
          isOwner ? (
            <PressScale accessibilityRole="button" accessibilityLabel={t('Month: {month}', { month: monthName(month, now) })} onPress={() => setPicking(true)}>
              <Raised radius={12} style={styles.monthButton} innerStyle={styles.monthInner}>
                <T size={13} weight={600} numberOfLines={1}>
                  {monthName(month, now)}
                </T>
                <IconChevronDown size={16} />
              </Raised>
            </PressScale>
          ) : null
        }
      />
      {!isOwner ? (
        <Empty>{t('Only the garage’s owner sees money.')}</Empty>
      ) : !data || !share ? (
        expenses.isError ? <LoadError what={t('expenses')} onRetry={() => void expenses.refetch()} /> : <SkeletonList count={3} height={96} />
      ) : (
        <>
          <Edge radius={22} innerStyle={styles.total}>
            <View style={styles.totalHead}>
              <View style={styles.flex}>
                <Overline>{month === thisMonth ? t('Spent this month') : t('Spent in {month}', { month: monthName(month, now) })}</Overline>
                <T num size={32} weight={600} lh={40}>
                  {rupees(data.spentPaise) ?? '₹0'}
                </T>
              </View>
              <View style={styles.profit}>
                <Overline>{t('Profit')}</Overline>
                <T num size={20} weight={600} lh={28} color={data.profitPaise < 0 ? '#FF8A95' : undefined}>
                  {data.profitPaise < 0 ? `−${rupees(-data.profitPaise) ?? ''}` : (rupees(data.profitPaise) ?? '₹0')}
                </T>
              </View>
            </View>
            <Recessed radius={4} style={styles.bar} innerStyle={styles.barInner}>
              {share.kept > 0 ? <LinearGradient colors={['#F2F2F5', '#A5A5AE']} style={{ width: `${share.kept}%` }} /> : null}
              {share.spent > 0 ? <View style={[styles.spent, { width: `${share.spent}%` }]} /> : null}
            </Recessed>
            <T size={12} color={colors.textSecondary}>
              {t('Taken {taken} − spent {spent}', { taken: rupees(data.takenPaise) ?? '₹0', spent: rupees(data.spentPaise) ?? '₹0' })}
            </T>
            <RedButton onPress={() => setEditing('new')} height={48} radius={16}>
              <View style={styles.redLabel}>
                <IconPlus size={18} color="#FFFFFF" />
                <T variant="t3" weight={600} color="#FFFFFF">
                  {t('Add expense')}
                </T>
              </View>
            </RedButton>
          </Edge>
          {categoryChips(data.totals).length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {categoryChips(data.totals).map((chip) => (
                <Chip key={chip.category} label={expenseCategoryWord(chip.category)} figure={rupees(chip.paise) ?? ''} />
              ))}
            </ScrollView>
          ) : null}
          {data.expenses.length === 0 ? (
            <Empty>{t('Nothing written down for this month yet.')}</Empty>
          ) : (
            <View>
              {data.expenses.map((expense) => (
                <Pressable key={expense.id} accessibilityRole="button" onPress={() => setEditing(expense)}>
                  <Row>
                    <T size={12} color={colors.textSecondary} style={styles.date}>
                      {dayMonth(expense.spentOn)}
                    </T>
                    <View style={styles.flex}>
                      <View style={styles.titleLine}>
                        <T size={14} weight={600} numberOfLines={1} style={styles.shrink}>
                          {expenseTitle(expense)}
                        </T>
                        {expense.everyMonth ? <Tag>{t('Every month')}</Tag> : null}
                      </View>
                      {expenseSub(expense) ? (
                        <T size={12} color={colors.textSecondary} numberOfLines={1} style={styles.subLine}>
                          {expenseSub(expense)}
                        </T>
                      ) : null}
                    </View>
                    <T num size={15} weight={600}>
                      {rupees(expense.amountPaise) ?? ''}
                    </T>
                  </Row>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
      <ScSheet open={picking} onClose={() => setPicking(false)} accessibilityLabel={t('Choose a month')} horizontalPadding={16}>
        <View style={styles.sheet}>
          <T variant="t2">{t('Choose a month')}</T>
          {recentMonths(now).map((key) => (
            <RaisedButton
              key={key}
              label={monthName(key, now)}
              height={44}
              onPress={() => {
                setMonth(key);
                setPicking(false);
              }}
            />
          ))}
        </View>
      </ScSheet>
      {isOwner && editing ? (
        <ExpenseSheet expense={editing === 'new' ? null : editing} defaultDay={month === thisMonth ? istDateKey(now) : `${month}-01`} onClose={() => setEditing(null)} />
      ) : null}
    </BookScreen>
  );
}

const METHODS = [
  { value: 'cash', label: msg('Cash') },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: msg('Bank') },
] as const;

/** Add an expense, or change or delete one. Salary and advance can name the person (they show in Team too). */
function ExpenseSheet({ expense, defaultDay, onClose }: { expense: BookExpense | null; defaultDay: string; onClose: () => void }) {
  const t = useT();
  const styles = useStyles();
  const team = useBookTeam(undefined);
  const add = useAddExpense();
  const update = useUpdateExpense();
  const remove = useRemoveExpense();
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'rent');
  const [amount, setAmount] = useState(expense ? String(expense.amountPaise / 100) : '');
  const [day, setDay] = useState(expense?.spentOn ?? defaultDay);
  const [note, setNote] = useState(expense?.note ?? '');
  const [method, setMethod] = useState<ExpenseMethod>(expense?.method ?? 'cash');
  const [memberId, setMemberId] = useState<string | null>(expense?.member?.id ?? null);
  const [everyMonth, setEveryMonth] = useState(expense?.everyMonth ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const paise = rupeesToPaise(amount);
  const forPerson = category === 'salary' || category === 'advance';
  const busy = add.isPending || update.isPending || remove.isPending;
  const failed = (error: unknown) => toast.error(error instanceof Error ? error.message : t("Couldn't save. Try again."));
  const save = () => {
    if (paise === null || !day) return;
    const fields = {
      category,
      amountPaise: paise,
      spentOn: day,
      method,
      everyMonth,
    };
    if (expense) {
      update.mutate(
        { id: expense.id, patch: { ...fields, note: note.trim() || null, memberId: forPerson ? memberId : null } },
        { onSuccess: onClose, onError: failed }
      );
    } else {
      add.mutate(
        { ...fields, ...(note.trim() ? { note: note.trim() } : {}), ...(forPerson && memberId ? { memberId } : {}) },
        {
          onSuccess: () => {
            toast.success(t('{amount} added to expenses', { amount: rupees(paise) ?? '' }));
            onClose();
          },
          onError: failed,
        }
      );
    }
  };
  return (
    <ScSheet open onClose={onClose} accessibilityLabel={expense ? t('Change expense') : t('Add expense')} horizontalPadding={16}>
      <View style={styles.sheet}>
        <T variant="t2">{expense ? t('Change expense') : t('Add expense')}</T>
        <FieldLabel>{t('What for')}</FieldLabel>
        <View style={styles.wrap}>
          {EXPENSE_CATEGORIES.map((key) => (
            <Chip key={key} label={expenseCategoryWord(key)} on={category === key} onPress={() => setCategory(key)} />
          ))}
        </View>
        <FieldLabel>{t('How much (₹)')}</FieldLabel>
        <BookInput value={amount} onChangeText={(text) => setAmount(moneyTyping(text))} keyboardType="decimal-pad" placeholder="2000" accessibilityLabel={t('How much')} />
        {forPerson && team.data && team.data.members.length > 0 ? (
          <>
            <FieldLabel>{t('Who')}</FieldLabel>
            <View style={styles.wrap}>
              {team.data.members.map((member) => (
                <Chip key={member.id} label={member.name} on={memberId === member.id} onPress={() => setMemberId(memberId === member.id ? null : member.id)} />
              ))}
            </View>
          </>
        ) : null}
        <FieldLabel>{t('Note')}</FieldLabel>
        <BookInput value={note} onChangeText={setNote} maxLength={GARAGE_BOOK_2_LIMITS.expenseNoteMax} placeholder={t('Shop rent')} accessibilityLabel={t('Note')} />
        <DateField label={t('Day')} value={day} onChange={setDay} max={istDateKey(new Date())} />
        <Seg<ExpenseMethod> label={msg('Paid by')} value={method} options={METHODS} onChange={setMethod} />
        <View style={styles.everyRow}>
          <View style={styles.flex}>
            <T variant="t3" weight={500}>
              {t('Every month')}
            </T>
            <T size={12} color="#A8A8B2">
              {t('Written down again each month by itself')}
            </T>
          </View>
          <Switch checked={everyMonth} onChange={setEveryMonth} label={t('Every month')} />
        </View>
        <RaisedButton label={busy ? t('Saving…') : t('Save')} disabled={paise === null || !day || busy} onPress={save} />
        {expense ? (
          <T
            variant="t4"
            color="#FF8A95"
            align="center"
            style={styles.remove}
            onPress={() => (confirmDelete ? remove.mutate(expense.id, { onSuccess: onClose, onError: failed }) : setConfirmDelete(true))}
          >
            {confirmDelete ? t('Tap again to delete it') : t('Delete this expense')}
          </T>
        ) : null}
      </View>
    </ScSheet>
  );
}

export default garageScreen(ExpensesScreen);

const useStyles = createStyles(() => ({
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  monthButton: { height: 40 },
  monthInner: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  total: { padding: 16, gap: 12 },
  totalHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  profit: { alignItems: 'flex-end' },
  bar: { height: 8 },
  barInner: { flexDirection: 'row', overflow: 'hidden', borderRadius: 4 },
  spent: { backgroundColor: '#FF2D4A', shadowColor: '#FF2D4A', shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  redLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { gap: 8 },
  date: { width: 44 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subLine: { marginTop: 2 },
  sheet: { gap: 12, paddingBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 6 },
  everyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  remove: { minHeight: 44, paddingTop: 12 },
}));
