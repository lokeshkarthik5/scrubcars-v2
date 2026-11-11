import { updateAddress, updateProfile, updateVehicle } from '@repo/core/api/users';
import { useT } from '@repo/core/i18n';
import { useUserStore } from '@repo/core/stores/user-store';
import type { Address, User, Vehicle } from '@repo/core/types';
import { ScButton } from '@repo/native-ui/button';
import { ScInput } from '@repo/native-ui/inputs';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/error-text';

function SheetShell({
  open,
  onClose,
  title,
  busy,
  canSave,
  onSave,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  busy: boolean;
  canSave: boolean;
  onSave: () => void;
  children: ReactNode;
}) {
  const t = useT();
  const styles = useStyles();
  return (
    <ScSheet horizontalPadding={16} open={open} onClose={onClose} dismissible={!busy} accessibilityLabel={title}>
      <View style={styles.form}>
        <T size={19} weight={600} lh={26}>
          {title}
        </T>
        {children}
        <View style={styles.row}>
          <View style={styles.grow}>
            <ScButton variant="main" disabled={!canSave || busy} onPress={onSave}>
              {busy ? t('Saving...') : t('Save')}
            </ScButton>
          </View>
          <View style={styles.grow}>
            <ScButton variant="outline" disabled={busy} onPress={onClose}>
              {t('Cancel')}
            </ScButton>
          </View>
        </View>
      </View>
    </ScSheet>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** EditProfileSheet (apps/users/components/profile/edit-sheets.tsx). */
export function EditProfileSheet({ user, open, onClose }: { user: User; open: boolean; onClose: () => void }) {
  const t = useT();
  const colors = useColors();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? '');
  const [busy, setBusy] = useState(false);
  const emailOk = email.trim() === '' || EMAIL_RE.test(email.trim());
  const canSave = name.trim().length > 0 && emailOk;
  const save = async () => {
    setBusy(true);
    try {
      const updated = await updateProfile({ name: name.trim(), email: email.trim() === '' ? null : email.trim() });
      useUserStore.setState((s) => ({ profile: s.profile ? { ...s.profile, ...updated, area: s.profile.area, pincode: s.profile.pincode } : updated }));
      useAuth.getState().setName(updated.name);
      toast.success(t('Profile updated'));
      onClose();
    } catch (err) {
      toast.error(errorText(err, t('Could not save your profile')));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SheetShell open={open} onClose={onClose} title={t('Edit your details')} busy={busy} canSave={canSave} onSave={() => void save()}>
      <ScInput label={t('Name')} autoComplete="name" autoCorrect={false} value={name} onChangeText={setName} />
      <ScInput label={t('Email (optional)')} autoComplete="email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={email} onChangeText={setEmail} />
      {!emailOk ? (
        <T accessibilityRole="alert" size={12} lh={16} color={colors.error}>
          {t('Enter an email like name@example.com, or leave it empty.')}
        </T>
      ) : null}
      <T size={12} lh={16} color={colors.textMuted}>
        {t("Your phone number is how you sign in, so it can't be changed here.")}
      </T>
    </SheetShell>
  );
}

export function EditVehicleSheet({ vehicle, open, onClose, onSaved }: { vehicle: Vehicle; open: boolean; onClose: () => void; onSaved?: () => void }) {
  const t = useT();
  const styles = useStyles();
  const [make, setMake] = useState(vehicle.make);
  const [model, setModel] = useState(vehicle.model);
  const [plate, setPlate] = useState(vehicle.plate);
  const [color, setColor] = useState(vehicle.color ?? '');
  const [busy, setBusy] = useState(false);
  const canSave = make.trim().length > 0 && model.trim().length > 0;
  const save = async () => {
    setBusy(true);
    try {
      const updated = await updateVehicle(vehicle.id, {
        make: make.trim(),
        model: model.trim(),
        licensePlate: plate.trim() === '' ? null : plate.trim(),
        color: color.trim() === '' ? null : color.trim(),
      });
      useUserStore.setState((s) => ({ vehicles: s.vehicles.map((v) => (v.id === vehicle.id ? updated : v)) }));
      onSaved?.();
      toast.success(t('Vehicle updated'));
      onClose();
    } catch (err) {
      toast.error(errorText(err, t('Could not save this vehicle')));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SheetShell open={open} onClose={onClose} title={t('Edit vehicle')} busy={busy} canSave={canSave} onSave={() => void save()}>
      <View style={styles.row}>
        <View style={styles.grow}>
          <ScInput label={t('Make')} autoCorrect={false} value={make} onChangeText={setMake} />
        </View>
        <View style={styles.grow}>
          <ScInput label={t('Model')} autoCorrect={false} value={model} onChangeText={setModel} />
        </View>
      </View>
      <ScInput label={t('License plate (optional)')} placeholder={t('e.g. TN 01 AB 1234')} autoCapitalize="characters" autoCorrect={false} value={plate} onChangeText={(text) => setPlate(text.toUpperCase())} />
      <ScInput label={t('Colour (optional)')} placeholder={t('e.g. White')} value={color} onChangeText={setColor} />
    </SheetShell>
  );
}

export function EditAddressSheet({ address, open, onClose }: { address: Address; open: boolean; onClose: () => void }) {
  const t = useT();
  const colors = useColors();
  const [label, setLabel] = useState(address.label);
  const [street, setStreet] = useState(address.street ?? address.address);
  const [city, setCity] = useState(address.city ?? '');
  const [busy, setBusy] = useState(false);
  const canSave = label.trim().length > 0 && street.trim().length > 0 && city.trim().length > 0;
  const save = async () => {
    setBusy(true);
    try {
      const updated = await updateAddress(address.id, { label: label.trim(), address: street.trim(), city: city.trim() });
      useUserStore.setState((s) => ({ addresses: s.addresses.map((a) => (a.id === address.id ? updated : a)) }));
      toast.success(t('Address updated'));
      onClose();
    } catch (err) {
      toast.error(errorText(err, t('Could not save this address')));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SheetShell open={open} onClose={onClose} title={t('Edit address')} busy={busy} canSave={canSave} onSave={() => void save()}>
      <ScInput label={t('Label')} value={label} onChangeText={setLabel} />
      <ScInput label={t('Address')} placeholder={t('Street, area, pincode')} value={street} onChangeText={setStreet} />
      <ScInput label={t('City')} value={city} onChangeText={setCity} />
      <T size={12} lh={16} color={colors.textMuted}>
        {t('The pin on the map stays where it is. To move it, remove this address and add it again.')}
      </T>
    </SheetShell>
  );
}

const useStyles = createStyles(() => ({
  form: { gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1, minWidth: 0 },
}));
