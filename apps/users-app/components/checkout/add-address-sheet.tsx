import { createAddress } from '@repo/core/api/users';
import { useUserStore } from '@repo/core/stores/user-store';
import type { Address } from '@repo/core/types';
import { ScButton } from '@repo/native-ui/button';
import { Chip } from '@repo/native-ui/chip';
import { ScInput } from '@repo/native-ui/inputs';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { LocationPicker, type PickedLocation } from '@/components/location-picker';
import type { DraftAddress } from '@/lib/booking-draft';
import { errorText } from '@/lib/error-text';
import { NO_PIN_TEXT, type PinText, refillFromPin } from '@/lib/pin-autofill';

const LABELS = ['Home', 'Office', 'Other'] as const;
const EMPTY = { label: 'Home' as string, address: '', city: '', pin: null as PickedLocation | null };

/** AddAddressSheet (apps/users/components/add-address-sheet.tsx). */
export function AddAddressSheet({
  open,
  onClose,
  onAdded,
  pickup = false,
  onSaveLocal,
}: {
  open: boolean;
  onClose: () => void;
  onAdded?: (address: Address) => void;
  pickup?: boolean;
  /** A guest: kept on the phone until sign-in. */
  onSaveLocal?: (address: DraftAddress) => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const [form, setForm] = useState(EMPTY);
  const pinText = useRef<PinText>(NO_PIN_TEXT);
  const addresses = useUserStore((s) => s.addresses);

  const save = useMutation({
    mutationFn: (pin: PickedLocation) =>
      createAddress({
        label: form.label,
        address: form.address.trim(),
        city: form.city.trim(),
        lat: pin.lat,
        lng: pin.lng,
        geoSource: pin.source,
        isDefault: addresses.length === 0,
      }),
    onSuccess: (created) => {
      useUserStore.setState((s) => ({ addresses: [...s.addresses, created] }));
      setForm(EMPTY);
      pinText.current = NO_PIN_TEXT;
      onAdded?.(created);
      onClose();
      toast.success('Address added');
    },
    onError: (error) => toast.error(errorText(error, 'Failed to add address')),
  });

  const isValid = form.pin !== null && form.address.trim().length > 0 && form.city.trim().length > 0;
  const close = () => {
    if (save.isPending) return;
    setForm(EMPTY);
    pinText.current = NO_PIN_TEXT;
    onClose();
  };

  return (
    <ScSheet open={open} onClose={close} dismissible={!save.isPending} accessibilityLabel="Add an address">
      <T size={19} weight={600} lh={26}>
        Add an address
      </T>
      <T size={13} lh={18} color={colors.textSecondary} style={styles.sub}>
        {pickup
          ? 'Drop the pin where the car will be. We use it to check the garage collects from you, and the driver uses it to find your car.'
          : 'Drop the pin where the car will be. We use it to check the garage travels to you.'}
      </T>
      <View style={styles.form}>
        <View style={styles.chips}>
          {LABELS.map((label) => (
            <Chip key={label} label={label} selected={form.label === label} onPress={() => setForm({ ...form, label })} />
          ))}
        </View>
        <LocationPicker
          showSearch
          value={form.pin ? { lat: form.pin.lat, lng: form.pin.lng } : null}
          onChange={(picked) => {
            const previous = pinText.current;
            pinText.current = { address: picked.address, city: picked.city };
            setForm((current) => refillFromPin({ ...current, pin: picked }, picked, previous));
          }}
        />
        <ScInput
          label="Address"
          placeholder="Flat, building, street"
          autoComplete="street-address"
          value={form.address}
          onChangeText={(address) => setForm((f) => ({ ...f, address }))}
        />
        <ScInput
          label="City"
          placeholder="e.g. Chennai"
          autoComplete="off"
          value={form.city}
          onChangeText={(city) => setForm((f) => ({ ...f, city }))}
        />
        <View style={styles.actions}>
          <View style={styles.grow}>
            <ScButton
              variant="main"
              disabled={!isValid || save.isPending}
              onPress={() => {
                if (!form.pin) return;
                if (onSaveLocal) {
                  onSaveLocal({
                    label: form.label,
                    address: form.address.trim(),
                    city: form.city.trim(),
                    lat: form.pin.lat,
                    lng: form.pin.lng,
                    geoSource: form.pin.source,
                  });
                  setForm(EMPTY);
                  pinText.current = NO_PIN_TEXT;
                  onClose();
                  return;
                }
                save.mutate(form.pin);
              }}
            >
              {save.isPending ? 'Saving…' : 'Save address'}
            </ScButton>
          </View>
          <View style={styles.grow}>
            <ScButton variant="outline" disabled={save.isPending} onPress={close}>
              Cancel
            </ScButton>
          </View>
        </View>
      </View>
    </ScSheet>
  );
}

const useStyles = createStyles(() => ({
  sub: { marginTop: 4 },
  form: { marginTop: 16, gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { marginTop: 4, flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
}));
