import { useGaragePickupFee, useSetGaragePickupFee } from '@repo/core/api/hooks/use-pickup-fee';
import type { GaragePickupFeeView } from '@repo/core/api/pickup-fee';
import { useT } from '@repo/core/i18n';
import {
  ABOVE_SUGGESTION_BODY,
  ABOVE_SUGGESTION_TITLE,
  DETLIO_NUMBERS_LINE,
  DISTANCE_MODE_LINE,
  FIXED_MODE_LINE,
  FREE_MODE_LINE,
  GARAGE_KEEPS_FEE_LINE,
  PICKUP_FEE_INTRO,
  PICKUP_FEE_MODE_LABELS,
  PICKUP_FEE_MODES,
  SET_BY_DETLIO_TITLE,
  changeRuleLine,
  feeCell,
  feePreviewRows,
  isAboveSuggestion,
  limitHint,
  lockedLine,
  nextChangeLine,
  sentLine,
  type PickupFeeMode,
  type PickupFeePlan,
} from '@repo/core/pickup-fee';
import {
  draftIsSaved,
  draftOf,
  draftPlan,
  draftProblems,
  feeBoxText,
  feeOfDraft,
  feeSettingsOf,
  isDetliosDraft,
  keptLine,
  roadKmFootnote,
  type FeeBox,
  type FeeDraft,
} from '@repo/core/pickup-fee-garage';
import { useState } from 'react';
import { View } from 'react-native';

import { ScButton } from '@repo/native-ui/button';
import { IconCircleCheck, IconLock } from '@repo/native-ui/icons';
import { ScInput } from '@repo/native-ui/inputs';
import { Notice, ScSegmented } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { errorText } from '@/lib/error-text';

/**
 * Settings → Hours → Pickup & drop → Pickup fee (0079), the garage portal's
 * apps/vendors/app/settings/pickup-fee-part.tsx in the app: the same words, limits and
 * order. Free saves on tap; a fixed fee or By distance saves with "Save pickup fee". A
 * fee above Detlio's suggestion waits for Detlio; locked to Detlio's fee it reads
 * "Set by Detlio"; the garage changes its fee once every 7 days.
 */
export function PickupFeePart({ vendorId }: { vendorId: string }) {
  const query = useGaragePickupFee(vendorId);
  if (!query.data) return null;
  return <FeeEditor key={JSON.stringify(query.data.fee)} vendorId={vendorId} view={query.data} />;
}

function FeeEditor({ vendorId, view }: { vendorId: string; view: GaragePickupFeeView }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const settings = feeSettingsOf(view);
  const save = useSetGaragePickupFee(vendorId);
  const [draft, setDraft] = useState<FeeDraft>(() => draftOf(view.fee, view.suggested));
  const problems = draftProblems(draft, settings);
  const saved = draftIsSaved(draft, view.fee, settings);
  const blocked = view.nextChangeAt !== null;
  const detlio = view.detlioPlan;

  const submit = async (next: FeeDraft) => {
    try {
      await save.mutateAsync(feeOfDraft(next));
      toast.success(t('Saved successfully'));
    } catch (err) {
      // Within 7 days, locked or outside the limits: the server says which.
      toast.error(errorText(err, t('Something went wrong')));
    }
  };

  const onMode = (mode: PickupFeeMode) => {
    if (save.isPending) return;
    const next = { ...draft, mode };
    setDraft(next);
    // Free saves on tap, like the switches above.
    if (mode === 'free' && view.fee.mode !== 'free') {
      if (blocked && view.nextChangeAt) {
        toast.error(nextChangeLine(view.nextChangeAt));
        return;
      }
      void submit(next);
    }
  };

  const setBox = (box: FeeBox, text: string) =>
    setDraft((current) => ({ ...current, [box]: feeBoxText(text, box === 'freeKm') }));

  if (view.locked) {
    return (
      <FeeShell>
        <View style={styles.greyed} pointerEvents="none" accessibilityState={{ disabled: true }}>
          <ModeChoice value="distance" onChange={() => {}} />
        </View>
        <View style={styles.lockBox}>
          <IconLock size={18} color={colors.textSecondary} />
          <View style={styles.flex}>
            <T size={13} weight={500}>
              {t(SET_BY_DETLIO_TITLE)}
            </T>
            <T size={12} color={colors.textSecondary}>
              {lockedLine(detlio)}
            </T>
          </View>
        </View>
        <FeeTable mine={detlio} detlio={detlio} compare={false} />
        <KeepLine />
      </FeeShell>
    );
  }

  const mine = draftPlan(draft, settings);
  const canPreview = Object.keys(problems).length === 0;
  const above = canPreview && draft.mode !== 'free' && isAboveSuggestion(feeOfDraft(draft), settings);
  const showAbove = saved ? view.waiting !== null : above;

  return (
    <FeeShell>
      <ModeChoice value={draft.mode} onChange={onMode} />

      {view.decision?.status === 'kept' && saved ? (
        <Notice tone="neutral" title={t('Detlio’s fee')}>
          {keptLine(view.decision.reason)}
        </Notice>
      ) : null}

      {draft.mode === 'free' ? (
        <T size={12} color={colors.textSecondary}>
          {t(FREE_MODE_LINE)}
        </T>
      ) : null}

      {draft.mode === 'fixed' ? (
        <>
          <FeeBoxField
            label={t('Fee for any pickup (₹)')}
            value={draft.fixed}
            onChange={(text) => setBox('fixed', text)}
            hint={limitHint('fixed', view.limits)}
            problem={problems.fixed}
          />
          <T size={12} color={colors.textSecondary}>
            {t(FIXED_MODE_LINE)}
          </T>
        </>
      ) : null}

      {draft.mode === 'distance' ? (
        <>
          <T size={12} color={colors.textSecondary}>
            {t(DISTANCE_MODE_LINE)}
          </T>
          <View style={styles.grid}>
            <View style={styles.cell}>
              <FeeBoxField
                label={t('Free up to (km)')}
                decimal
                value={draft.freeKm}
                onChange={(text) => setBox('freeKm', text)}
                hint={limitHint('freeKm', view.limits)}
                problem={problems.freeKm}
              />
            </View>
            <View style={styles.cell}>
              <FeeBoxField
                label={t('Then per km (₹)')}
                value={draft.perKm}
                onChange={(text) => setBox('perKm', text)}
                hint={limitHint('perKm', view.limits)}
                problem={problems.perKm}
              />
            </View>
            <View style={styles.cell}>
              <FeeBoxField
                label={t('Lowest charge (₹)')}
                value={draft.minCharge}
                onChange={(text) => setBox('minCharge', text)}
                hint={limitHint('minCharge', view.limits)}
                problem={problems.minCharge}
              />
            </View>
            <View style={styles.cell}>
              <FeeBoxField
                label={t('Highest charge (₹)')}
                value={draft.maxCharge}
                onChange={(text) => setBox('maxCharge', text)}
                hint={limitHint('maxCharge', view.limits)}
                problem={problems.maxCharge}
              />
            </View>
          </View>
          {isDetliosDraft(draft, view.suggested) ? (
            <T size={11} color={colors.textMuted}>
              {t(DETLIO_NUMBERS_LINE)}
            </T>
          ) : null}
        </>
      ) : null}

      {showAbove ? <Notice title={t(ABOVE_SUGGESTION_TITLE)}>{t(ABOVE_SUGGESTION_BODY)}</Notice> : null}

      {draft.mode === 'distance' && canPreview ? <FeeTable mine={mine} detlio={detlio} compare={showAbove} /> : null}

      {draft.mode === 'distance' ? (
        <T size={11} color={colors.textMuted}>
          {roadKmFootnote(view.suggested)}
        </T>
      ) : null}

      {draft.mode !== 'free' ? <KeepLine /> : null}

      {saved && view.waiting ? (
        <T size={11} color={colors.textMuted}>
          {sentLine(view.waiting.sentAt, view.nextChangeAt)}
        </T>
      ) : blocked && view.nextChangeAt ? (
        <T size={11} color={colors.textMuted}>
          {`${changeRuleLine(view.limits.changeEveryDays)} ${nextChangeLine(view.nextChangeAt)}`}
        </T>
      ) : draft.mode === 'distance' ? (
        <T size={11} color={colors.textMuted}>
          {changeRuleLine(view.limits.changeEveryDays)}
        </T>
      ) : null}

      {draft.mode !== 'free' && !saved ? (
        <ScButton variant="outline" disabled={!canPreview || blocked || save.isPending} onPress={() => void submit(draft)}>
          {save.isPending ? t('Saving...') : t('Save pickup fee')}
        </ScButton>
      ) : null}
    </FeeShell>
  );
}

function FeeShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={[styles.part, styles.divided]}>
      <View>
        <T size={13} weight={500}>
          {t('Pickup fee')}
        </T>
        <T size={11} color={colors.textSecondary}>
          {t(PICKUP_FEE_INTRO)}
        </T>
      </View>
      {children}
    </View>
  );
}

function ModeChoice({ value, onChange }: { value: PickupFeeMode; onChange: (mode: PickupFeeMode) => void }) {
  const t = useT();
  return (
    <ScSegmented<PickupFeeMode>
      accessibilityLabel={t('Pickup fee')}
      value={value}
      minHeight={44}
      labelSize={13}
      onChange={onChange}
      options={PICKUP_FEE_MODES.map((mode) => ({ value: mode, label: t(PICKUP_FEE_MODE_LABELS[mode]) }))}
    />
  );
}

function FeeBoxField({
  label,
  value,
  onChange,
  hint,
  problem,
  decimal,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  hint: string;
  problem?: string;
  decimal?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={{ gap: 4 }}>
      <ScInput
        label={label}
        numeric
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        value={value}
        onChangeText={onChange}
        style={problem ? { borderColor: colors.warning } : undefined}
      />
      {problem ? (
        <T accessibilityRole="alert" size={11} color={colors.warning}>
          {problem}
        </T>
      ) : (
        <T num size={11} color={colors.textMuted}>
          {hint}
        </T>
      )}
    </View>
  );
}

/** "What customers pay": the plan at sample road km, or Detlio's next to the garage's. */
function FeeTable({ mine, detlio, compare }: { mine: PickupFeePlan; detlio: PickupFeePlan; compare: boolean }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const rows = feePreviewRows(mine, detlio);
  return (
    <View style={styles.table}>
      <View style={styles.tableRow}>
        <T size={11} color={colors.textMuted} style={styles.flex}>
          {compare ? t('What customers would pay') : t('What customers pay')}
        </T>
        {compare ? (
          <>
            <T size={11} color={colors.textMuted} style={styles.feeCol}>
              {t('Detlio')}
            </T>
            <T size={11} color={colors.textMuted} style={styles.feeCol}>
              {t('Yours')}
            </T>
          </>
        ) : null}
      </View>
      {rows.map((row) => (
        <View key={row.km} style={[styles.tableRow, styles.tableLine]}>
          <T size={12} color={colors.textSecondary} style={styles.flex}>
            {row.label}
          </T>
          {compare ? (
            <>
              <T num size={12} color={colors.textSecondary} style={styles.feeCol}>
                {feeCell(row.detlio)}
              </T>
              <T num size={12} weight={500} color={row.garage > row.detlio ? colors.warning : colors.textPrimary} style={styles.feeCol}>
                {feeCell(row.garage)}
              </T>
            </>
          ) : (
            <T num size={12} weight={500}>
              {feeCell(row.garage, mine, true)}
            </T>
          )}
        </View>
      ))}
    </View>
  );
}

function KeepLine() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.keep}>
      <IconCircleCheck size={16} color={colors.success} />
      <T size={12} style={styles.flex}>
        {t(GARAGE_KEEPS_FEE_LINE)}
      </T>
    </View>
  );
}

const useStyles = createStyles((colors) => ({
  flex: { flex: 1, minWidth: 0 },
  part: { gap: 12 },
  divided: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, rowGap: 8 },
  cell: { width: '50%', paddingHorizontal: 6 },
  greyed: { opacity: 0.5 },
  lockBox: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
  },
  table: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tableLine: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 6 },
  feeCol: { width: 56, textAlign: 'right' },
  keep: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
}));
