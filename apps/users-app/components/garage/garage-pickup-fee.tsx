import { usePickupFeeConfig } from '@repo/core/api/hooks/use-pickup-fee';
import { requestActionLabel } from '@repo/core/booking-requests';
import { useT } from '@repo/core/i18n';
import { insidePickupReach } from '@repo/core/pickup';
import { askSuggestionLine, garagePageFeeLine } from '@repo/core/pickup-fee';
import { addressPickupFee, askSuggestion, noPickupTitle } from '@repo/core/pickup-fee-customer';
import { useUserStore } from '@repo/core/stores/user-store';
import type { Vendor } from '@repo/core/types';
import { HubCard, PressRow } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors, useFinish } from '@repo/native-ui/theme';
import { useEffect, useMemo, useState } from 'react';

import { RequestSheet } from '@/components/reach/request-sheet';
import { useAuth } from '@/lib/auth';
import { isCitywide, useLocationStore } from '@/lib/location';

/** Where the fee is worked out for: the default pinned address, else where they browse from (web garage-pickup-fee.tsx). */
export function useCustomerPin(): { lat: number; lng: number; label: string | null } | null {
  const user = useAuth((s) => s.user);
  const addresses = useUserStore((s) => s.addresses);
  const fetchAddresses = useUserStore((s) => s.fetchAddresses);
  const location = useLocationStore((s) => s.location);
  useEffect(() => {
    if (user) void fetchAddresses().catch(() => undefined);
  }, [user, fetchAddresses]);
  return useMemo(() => {
    const pinned = user ? addresses.filter((a) => a.lat !== null && a.lng !== null) : [];
    const home = pinned.find((a) => a.isDefault) ?? pinned[0];
    if (home) return { lat: home.lat!, lng: home.lng!, label: home.label || null };
    if (location && !isCitywide(location)) return { lat: location.lat, lng: location.lng, label: null };
    return null;
  }, [user, addresses, location]);
}

/** GaragePickupLine (apps/users/components/garage/garage-pickup-fee.tsx): the line under the mode switch (0079). */
export function GaragePickupLine({ vendor }: { vendor: Vendor }) {
  const t = useT();
  const { fx } = useFinish();
  const colors = useColors();
  const styles = useStyles();
  const pin = useCustomerPin();
  const what = t('{name} collects your car from your address, works on it at the garage and brings it back.', { name: vendor.name });
  const plan = vendor.pickupFee;
  const trip = pin ? addressPickupFee(plan, vendor, pin) : null;
  const fee = plan?.mode === 'fixed' && !trip ? Math.round(plan.fixed) : (trip?.fee ?? null);

  if (!plan || plan.mode === 'free' || fee === 0) {
    return (
      <T variant="t5" lh={18} color={fx.quiet} style={styles.note}>
        {t('Free pickup & drop: {name} collects your car from your address, works on it at the garage and brings it back.', { name: vendor.name })}
      </T>
    );
  }
  if (fee === null) {
    return (
      <T variant="t5" lh={18} color={fx.quiet} style={styles.note}>
        {`${t('Pickup & drop: the fee depends on your address.')} ${what}`}
      </T>
    );
  }
  const line = garagePageFeeLine({ fee, roadKm: trip?.roadKm ?? null, placeLabel: pin?.label ?? null });
  return (
    <T variant="t5" lh={18} color={fx.quiet} style={styles.note}>
      <T variant="t5" lh={18} color={colors.textPrimary}>
        {`${line.lead} ${line.amount}`}
      </T>
      {`${line.rest} ${what}`}
    </T>
  );
}

/** AskForPickupCard (web garage-pickup-fee.tsx): a garage that doesn't collect, or whose area stops short (0079). */
export function AskForPickupCard({ vendor, outside }: { vendor: Vendor; outside?: boolean }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const pin = useCustomerPin();
  const config = usePickupFeeConfig();
  const [open, setOpen] = useState(false);
  const suggestion = config.data && pin ? askSuggestion(config.data, vendor, pin) : null;
  const label = requestActionLabel('pickup');
  return (
    <HubCard style={styles.card}>
      <T size={16} weight={500} lh={22}>
        {outside ? t('Your address is outside their pickup area') : noPickupTitle(vendor.name)}
      </T>
      <T size={13} lh={18} color={colors.textSecondary}>
        {suggestion ? askSuggestionLine(suggestion.suggested, suggestion.roadKm) : t('Ask them to collect yours. The garage confirms the fee. Free to ask.')}
      </T>
      <PressRow accessibilityLabel={t('{label} from {name}', { label, name: vendor.name })} onPress={() => setOpen(true)} style={styles.ask}>
        <T size={14} weight={500} color={colors.chosenText}>
          {label}
        </T>
      </PressRow>
      {open ? <RequestSheet open onClose={() => setOpen(false)} garage={{ vendor, coverKm: null, outsideKm: 0 }} mode="pickup" /> : null}
    </HubCard>
  );
}

/** GaragePickupAsk (web): where the garage page offers Ask for pickup. */
export function GaragePickupAsk({ vendor, mode }: { vendor: Vendor; mode: string }) {
  const pin = useCustomerPin();
  if (vendor.lat == null || vendor.lng == null || vendor.bookingsPaused) return null;
  if (!vendor.pickupEnabled) return <AskForPickupCard vendor={vendor} />;
  if (mode === 'pickup' && pin && insidePickupReach(vendor, pin) === false) return <AskForPickupCard vendor={vendor} outside />;
  return null;
}

const useStyles = createStyles((c) => ({
  note: { marginTop: 10 },
  card: { marginTop: 16, gap: 8, padding: 16 },
  ask: { marginTop: 4, minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', borderRadius: 999, backgroundColor: c.chosenBg, paddingHorizontal: 16 },
}));
