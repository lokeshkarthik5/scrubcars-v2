import type { OwnJob } from '@repo/core/api/garage-book';
import { useUpdateWalkIn } from '@repo/core/api/hooks/use-garage-book';
import { carName, jobTime, plateText, rupees, type JobPayment } from '@repo/core/garage-book';
import { useState } from 'react';
import { View } from 'react-native';

import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';

import { go, Overline, Plate, RaisedButton, Seg } from './parts';

const PAYMENTS = [
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'later', label: 'Pay later' },
] as const;

/** A walk-in's sheet (the web's components/book/job-sheet.tsx): what, payment, Start, Mark done (moment 3), Cancel. */
export function JobSheet({ job, open, onClose, onDone }: { job: OwnJob | null; open: boolean; onClose: () => void; onDone: (job: OwnJob) => void }) {
  const styles = useStyles();
  const colors = useColors();
  const update = useUpdateWalkIn();
  const [confirmCancel, setConfirmCancel] = useState(false);
  if (!job) return null;
  const plate = plateText(job.car?.plate);
  const live = job.status !== 'done' && job.status !== 'cancelled' && !job.pending;
  const change = (patch: Parameters<typeof update.mutate>[0]['patch'], after?: (next: OwnJob) => void) =>
    update.mutate(
      { id: job.id, patch },
      {
        onSuccess: (next) => after?.(next),
        onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't save that. Try again."),
      }
    );
  return (
    <ScSheet open={open} onClose={onClose} accessibilityLabel={`${job.name}'s job`} horizontalPadding={16}>
      <View style={styles.body}>
        <View style={styles.head}>
          <View style={styles.flex}>
            <Overline>{`Walk-in · ${jobTime(job.scheduledAt)}`}</Overline>
            <T variant="t2" numberOfLines={1} style={styles.name}>
              {job.name}
            </T>
            <T variant="t4" weight={400} color={colors.textSecondary}>
              {carName(job.car) || 'Car not noted'}
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
                Total
              </T>
              <T num variant="t3" weight={600}>
                {rupees(job.totalPaise) ?? ''}
              </T>
            </View>
          ) : null}
        </View>
        {job.pending ? (
          <T variant="t4" weight={400} color="#FF8A95">
            Saved on this phone. It sends when you are back online.
          </T>
        ) : null}
        {live ? (
          <View style={styles.group}>
            <T variant="t4" weight={600} color="#D4D4DA">
              Payment
            </T>
            <Seg<JobPayment> label="Payment" value={job.payment} options={PAYMENTS} onChange={(payment) => change({ payment })} />
          </View>
        ) : null}
        {live ? (
          <View style={styles.row}>
            {job.status === 'booked' ? (
              <RaisedButton label="Start" disabled={update.isPending} onPress={() => change({ status: 'in_progress' })} style={styles.flex} />
            ) : null}
            <RaisedButton
              label="Mark done"
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
            {`Open ${job.name.split(' ')[0]}'s page`}
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
            {confirmCancel ? 'Tap again to cancel this job' : 'Cancel this job'}
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
  row: { flexDirection: 'row', gap: 8 },
  cancel: { minHeight: 44, paddingTop: 12 },
}));
