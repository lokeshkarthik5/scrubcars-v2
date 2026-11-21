import { useLocalSearchParams } from 'expo-router';

import { AppShell, garageScreen } from '@/components/app-shell';
import { BackToJob, CheckTheMarks } from '@/components/check-the-marks';
import { useConditionReader } from '@/lib/condition-reader';
import { useVendorBookings } from '@/lib/use-vendor-bookings';
import { EmptyState, LoadError, SkeletonList } from '@repo/native-ui/primitives';
import { useT } from '@repo/core/i18n';

/**
 * Check the marks (apps/vendors/app/bookings/[id]/condition/page.tsx, 0075): opened
 * from the job screen once a car-check photo is taken; the screen itself is
 * components/check-the-marks.tsx. Detlio keeps looking at any photo it has not read
 * yet while it is open.
 */
function CheckTheMarksScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bookings, loaded, failed, retrying, reload } = useVendorBookings();
  const booking = bookings.find((b) => b.id === id);
  useConditionReader(booking, reload);

  if (!booking || !booking.conditionCheck) {
    return (
      <AppShell hasNav={false} gap={16}>
        <BackToJob id={id} />
        {!loaded ? (
          <SkeletonList count={3} height={128} />
        ) : failed ? (
          <LoadError what={t('this job')} onRetry={reload} retrying={retrying} />
        ) : (
          <EmptyState
            title={t("This job isn't on your list")}
            subtitle={t('It may belong to another garage, or the link is old.')}
          />
        )}
      </AppShell>
    );
  }

  return <CheckTheMarks booking={booking} onChanged={reload} />;
}

export default garageScreen(CheckTheMarksScreen);
