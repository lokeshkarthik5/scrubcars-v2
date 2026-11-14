import { jobRef, type OwnJob } from '@repo/core/api/garage-book';
import { useBookTeam, useSetJobWorkers, useUpdateWalkIn } from '@repo/core/api/hooks/use-garage-book';
import { carName, jobTime, plateText, rupees, type JobPayment } from '@repo/core/garage-book';
import { msg, useT } from '@repo/core/i18n';
import { useState } from 'react';
import { View } from 'react-native';

import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';

import { useIsVendorAdmin } from '@/lib/auth';
import { toggleWorker } from '@/lib/garage-book-2';

import { go, LitChoice, Overline, Plate, RaisedButton, Seg } from './parts';

const PAYMENTS = [
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: msg('Cash') },
  { value: 'later', label: msg('Pay later') },
] as const;

/**
 * A walk-in's sheet (the web's components/book/job-sheet.tsx): what, payment, Start, Mark done
 * (moment 3), Cancel. Stage 2 adds "Done by" (any seat picks who did it) and the owner's Bill.
 */
export function JobSheet({ job, open, onClose, onDone }: { job: OwnJob | null; open: boolean; onClose: () => void; onDone: (job: OwnJob) => void }) {
  const t = useT();
  const styles = useStyles();
  const colors = useColors();
  const update = useUpdateWalkIn();
  const isOwner = useIsVendorAdmin();
  const team = useBookTeam(undefined, open);
  const setWorkers = useSetJobWorkers();
  const [workers, setWorkerIds] = useState<string[]>(() => job?.workers?.map((worker) => worker.id) ?? []);
  const [confirmCancel, setConfirmCancel] = useState(false);
  if (!job) return null;
  const plate = plateText(job.car?.plate);
  const live = job.status !== 'done' && job.status !== 'cancelled' && !job.pending;
  const change = (patch: Parameters<typeof update.mutate>[0]['patch'], after?: (next: OwnJob) => void) =>
    update.mutate(
      { id: job.id, patch },
      {
        onSuccess: (next) => {
          // Moment 5: this customer came back after a reminder.
          if (next.reminderPaidBack) {
            toast.success(
              t('{name} came back after your reminder · {amount}', { name: next.name.split(' ')[0] ?? next.name, amount: rupees(next.reminderPaidBack.amountPaise) ?? '' })
            );
          }
          after?.(next);
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : t("Couldn't save that. Try again.")),
      }
    );
  return (
    <ScSheet open={open} onClose={onClose} accessibilityLabel={t("{name}'s job", { name: job.name })} horizontalPadding={16}>
      <View style={styles.body}>
        <View style={styles.head}>
          <View style={styles.flex}>
            <Overline>{t('Walk-in · {time}', { time: jobTime(job.scheduledAt) })}</Overline>
            <T variant="t2" numberOfLines={1} style={styles.name}>
              {job.name}
            </T>
            <T variant="t4" weight={400} color={colors.textSecondary}>
              {carName(job.car) || t('Car not noted')}
            </T>
          </View>
          {plate ? <Plate plate={plate} /> : null}
        </View>
        <View>
          {job.lines.map((line, index) => (
            <View key={index} style={styles.line}>
              <T variant="t3" weight={400}>{line.qty > 1 ? `${line.label} ×${line.qty}` : line.label}</T>
              {line.pricePaise !== undefined ? (
                <T num variant="t3" weight={400}>
                  {rupees(line.pricePaise * line.qty) ?? ''}
                </T>
              ) : null}
            </View>
          ))}
          {job.totalPaise !== undefined ? (
            <View style={[styles.line, styles.total]}>
              <T variant="t3" weight={600}>
                {t('Total')}
              </T>
              <T num variant="t3" weight={600}>
                {rupees(job.totalPaise) ?? ''}
              </T>
            </View>
          ) : null}
        </View>
        {job.pending ? (
          <T variant="t4" weight={400} color="#FF8A95">
            {t('Saved on this phone. It sends when you are back online.')}
          </T>
        ) : null}
        {live ? (
          <View style={styles.group}>
            <T variant="t4" weight={600} color="#D4D4DA">
              {t('Payment')}
            </T>
            <Seg<JobPayment> label={msg('Payment')} value={job.payment} options={PAYMENTS} onChange={(payment) => change({ payment })} />
          </View>
        ) : null}
        {live ? (
          <View style={styles.row}>
            {job.status === 'booked' ? (
              <RaisedButton label={t('Start')} disabled={update.isPending} onPress={() => change({ status: 'in_progress' })} style={styles.flex} />
            ) : null}
            <RaisedButton
              label={t('Mark done')}
              disabled={update.isPending}
              onPress={() =>
                change({ status: 'done' }, (next) => {
                  onClose();
                  onDone(next);
                })
              }
              style={styles.flex}
            />
          </View>
        ) : null}
        {!job.pending && job.status !== 'cancelled' && team.data && team.data.members.length > 0 ? (
          <View style={styles.group}>
            <T variant="t4" weight={600} color="#D4D4DA">
              {t('Done by')}
            </T>
            <View accessibilityLabel={t('Done by')} style={styles.chips}>
              {team.data.members.map((member) => (
                <LitChoice
                  key={member.id}
                  label={member.name.split(' ')[0] ?? member.name}
                  on={workers.includes(member.id)}
                  onPress={() => {
                    const next = toggleWorker(workers, member.id);
                    setWorkerIds(next);
                    setWorkers.mutate(
                      { ref: jobRef(job), memberIds: next },
                      {
                        onError: (error) => {
                          setWorkerIds(workers);
                          toast.error(error instanceof Error ? error.message : t("Couldn't save that. Try again."));
                        },
                      }
                    );
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}
        {isOwner && !job.pending && job.status !== 'cancelled' ? (
          <RaisedButton
            label={t('Bill')}
            onPress={() => {
              onClose();
              go(`/book/bill/${encodeURIComponent(jobRef(job))}`);
            }}
          />
        ) : null}
        {!job.pending ? (
          <T
            variant="t4"
            color={colors.textSecondary}
            align="center"
            onPress={() => {
              onClose();
              go(`/book/customers/${encodeURIComponent(job.customerId)}`);
            }}
          >
            {t("Open {name}'s page", { name: job.name.split(' ')[0] ?? '' })}
          </T>
        ) : null}
        {live ? (
          <T
            variant="t4"
            color="#FF8A95"
            align="center"
            style={styles.cancel}
            onPress={() => (confirmCancel ? change({ status: 'cancelled' }, onClose) : setConfirmCancel(true))}
          >
            {confirmCancel ? t('Tap again to cancel this job') : t('Cancel this job')}
          </T>
        ) : null}
      </View>
    </ScSheet>
  );
}

const useStyles = createStyles(() => ({
  flex: { flex: 1, minWidth: 0 },
  body: { gap: 16, paddingBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  name: { marginTop: 4 },
  line: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#1D1D23', paddingVertical: 8 },
  total: { borderBottomWidth: 0 },
  group: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  row: { flexDirection: 'row', gap: 8 },
  cancel: { minHeight: 44, paddingTop: 12 },
}));
