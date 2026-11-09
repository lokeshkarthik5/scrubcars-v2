import { useGiftsConfig, giftsEnabled, useMyCredit } from '@repo/core/api/hooks/use-gifts';
import { invalidateHome } from '@repo/core/api/hooks/use-home';
import { useMyCoupons } from '@repo/core/api/hooks/use-coupons';
import { rewardsEnabled, useRewardsConfig, useRewardsSummary } from '@repo/core/api/hooks/use-rewards';
import { useSlotAlerts } from '@repo/core/api/hooks/use-slot-alerts';
import { getPushConfig } from '@repo/core/api/push';
import { createAddress, createVehicle, deleteAddress, deleteVehicle, setDefaultAddress, setDefaultVehicle } from '@repo/core/api/users';
import { firstNameOf, initialOf } from '@repo/core/home-display';
import { formatRupees } from '@repo/core/job-records';
import { stampsToGoLine } from '@repo/core/rewards';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_TEL_HREF, SUPPORT_WHATSAPP_HREF } from '@repo/core/support';
import { useUserStore } from '@repo/core/stores/user-store';
import type { VehicleType } from '@repo/core/types';
import { VEHICLE_TIERS } from '@repo/core/vehicles';
import { ScButton, Label } from '@repo/native-ui/button';
import { Chip } from '@repo/native-ui/chip';
import { IconCamera, IconCar, IconChevronRight, IconLogout, IconMapPin, IconPencil, IconPlus, IconTrash } from '@repo/native-ui/icons';
import { ScInput } from '@repo/native-ui/inputs';
import { HubCard, PressRow, ScCard, ScSegmented } from '@repo/native-ui/primitives';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors, useTheme } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import type { Appearance } from '@repo/native-ui/tokens';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { type ComponentRef, useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';

import { AppLockCard } from '@/components/profile/app-lock-card';
import { LevelBadge } from '@/components/rewards/level-badge';
import { ContactButtons } from '@/components/booking/help-sheet';
import { MyComplaints } from '@/components/complaints/my-complaints';
import { LocationPicker, type PickedLocation } from '@/components/location-picker';
import { DeleteAccountSheet } from '@/components/profile/delete-account-sheet';
import { EditAddressSheet, EditProfileSheet, EditVehicleSheet } from '@/components/profile/edit-sheets';
import { CustomerShell } from '@/components/screen';
import { useAuth } from '@/lib/auth';
import { couponsForCheckout } from '@/lib/checkout-maths';
import { errorText } from '@/lib/error-text';
import { uploadAvatarPhoto } from '@/lib/photo-upload';
import { NO_PIN_TEXT, type PinText, refillFromPin } from '@/lib/pin-autofill';
import { NumberPlate } from '@/components/moments/number-plate';

const OPTIONS: { value: Appearance; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const LEGAL_LINKS = [
  { label: 'Terms of Use', path: '/terms' },
  { label: 'Privacy Policy', path: '/privacy' },
  { label: 'Cancellation & Refunds', path: '/refund-policy' },
  { label: 'Service delivery', path: '/service-delivery' },
  { label: 'Contact & grievances', path: '/contact' },
];

const emptyVehicleForm = { make: '', model: '', licensePlate: '', vehicleType: 'sedan' as VehicleType };
const emptyAddressForm = { label: '', address: '', city: '', pincode: '', pin: null as PickedLocation | null };

/** Approved addition: how the app looks on this phone. */
function AppearanceCard() {
  const colors = useColors();
  const styles = useStyles();
  const { appearance, setAppearance } = useTheme();
  return (
    <HubCard radius={22} style={styles.appearance}>
      <T size={15} weight={500}>
        Appearance
      </T>
      <T size={13} lh={18} color={colors.textSecondary} style={styles.appearanceNote}>
        How the app looks on this phone. System follows your phone&apos;s setting.
      </T>
      <ScSegmented options={OPTIONS} value={appearance} onChange={setAppearance} />
    </HubCard>
  );
}

function Row({ label, sub, href, count, trailing }: { label: string; sub?: string; href: string; count?: string | number | null; trailing?: ReactNode }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <PressRow onPress={() => router.navigate(href as Href)}>
      <HubCard radius={18} style={styles.rowCard}>
        <View style={styles.flex}>
          <T size={15} lh={20}>
            {label}
          </T>
          {sub ? (
            <T size={12} lh={16} color={colors.textSecondary}>
              <Figures size={12} color={colors.textSecondary} text={sub} />
            </T>
          ) : null}
        </View>
        {count ? (
          <T num size={13} lh={18} color={colors.textSecondary}>
            {String(count)}
          </T>
        ) : null}
        {trailing}
        <IconChevronRight size={18} color={colors.textSecondary} />
      </HubCard>
    </PressRow>
  );
}

/** apps/users/app/profile/page.tsx. */
export default function ProfileScreen() {
  const colors = useColors();
  const styles = useStyles();
  const params = useLocalSearchParams<{ section?: string }>();
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const profile = useUserStore((s) => s.profile);
  const vehicles = useUserStore((s) => s.vehicles);
  const addresses = useUserStore((s) => s.addresses);
  const removeAvatar = useUserStore((s) => s.removeAvatar);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm);
  const [addressForm, setAddressForm] = useState(emptyAddressForm);
  const addressPinText = useRef<PinText>(NO_PIN_TEXT);
  const [saving, setSaving] = useState<'vehicle' | 'address' | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<string | null>(null);
  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const sections = useRef<Record<string, number>>({});

  // Only once the API has them set up, as the web's.
  const notifications = useQuery({ queryKey: ['push', 'customer', 'config'], queryFn: () => getPushConfig('customer'), enabled: !!user, retry: false, staleTime: 5 * 60_000 }).data?.enabled;
  const giftsConfig = useGiftsConfig();
  const giftsOn = giftsEnabled(giftsConfig.data);
  const credit = useMyCredit(giftsOn && !!user);
  const rewardsConfig = useRewardsConfig();
  const rewardsOn = rewardsEnabled(rewardsConfig.data) && !!user;
  const rewardsSummary = useRewardsSummary(rewardsOn);
  const slotAlertCount = useSlotAlerts({ enabled: !!user }).data?.items.length ?? 0;
  const readyCoupons = couponsForCheckout(useMyCoupons(!!user).data).length;

  useEffect(() => {
    if (!user) return;
    const store = useUserStore.getState();
    void store.fetchProfile().catch(() => undefined);
    void store.fetchVehicles().catch(() => undefined);
    void store.fetchAddresses().catch(() => undefined);
  }, [user]);

  // /profile#vehicles and #my-complaints on the web.
  useEffect(() => {
    if (!params.section) return;
    const timer = setTimeout(() => {
      const y = sections.current[params.section!];
      if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }, 400);
    return () => clearTimeout(timer);
  }, [params.section]);

  const title = (
    <T accessibilityRole="header" variant="title">
      Profile
    </T>
  );

  if (!user) {
    return (
      <CustomerShell>
        {title}
        <View style={styles.guest}>
          <T size={15} weight={600} align="center">
            Login to view your profile
          </T>
          <T size={13} align="center" color={colors.textSecondary}>
            Sign in to manage your vehicles and addresses
          </T>
          <ScButton variant="main" fullWidth={false} paddingX={32} onPress={() => router.push('/login?next=%2Fprofile' as Href)} style={styles.login}>
            Login
          </ScButton>
        </View>
        <AppearanceCard />
      </CustomerShell>
    );
  }

  const shown = profile ?? user;
  const areaLine = profile?.area ? [profile.area, profile.pincode].filter(Boolean).join(' – ') : null;
  const phone = user.phone.length === 10 ? `+91 ${user.phone.slice(0, 5)} ${user.phone.slice(5)}` : `+91 ${user.phone}`;

  const pickAvatar = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, exif: false });
    const uri = picked.canceled ? null : picked.assets?.[0]?.uri;
    if (!uri) return;
    setAvatarBusy(true);
    try {
      const updated = await uploadAvatarPhoto(uri);
      useUserStore.setState((s) => ({ profile: s.profile ? { ...s.profile, avatarUrl: updated.avatarUrl } : updated }));
      void invalidateHome(queryClient);
      toast.success('Photo updated');
    } catch (err) {
      toast.error(errorText(err, 'Upload failed'));
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleAvatarRemove = async () => {
    setAvatarBusy(true);
    try {
      await removeAvatar();
      void invalidateHome(queryClient);
      toast.success('Photo removed');
    } catch (err) {
      toast.error(errorText(err, 'Failed to remove photo'));
    } finally {
      setAvatarBusy(false);
    }
  };

  const submitVehicle = async () => {
    if (!vehicleForm.make || !vehicleForm.model) return;
    setSaving('vehicle');
    try {
      const created = await createVehicle({
        make: vehicleForm.make,
        model: vehicleForm.model,
        licensePlate: vehicleForm.licensePlate || undefined,
        vehicleType: vehicleForm.vehicleType,
        isDefault: vehicles.length === 0,
      });
      useUserStore.setState((s) => ({ vehicles: [...s.vehicles, created] }));
      void invalidateHome(queryClient);
      setVehicleForm(emptyVehicleForm);
      setShowVehicleForm(false);
      toast.success('Vehicle added');
    } catch (err) {
      toast.error(errorText(err, 'Failed to add vehicle'));
    } finally {
      setSaving(null);
    }
  };

  const submitAddress = async () => {
    if (!addressForm.label || !addressForm.address || !addressForm.city || !addressForm.pincode) return;
    if (!/^\d{6}$/.test(addressForm.pincode)) {
      toast.error('Enter a valid 6-digit pincode');
      return;
    }
    setSaving('address');
    try {
      const created = await createAddress({
        label: addressForm.label,
        address: `${addressForm.address}, ${addressForm.pincode}`,
        city: addressForm.city,
        lat: addressForm.pin?.lat,
        lng: addressForm.pin?.lng,
        geoSource: addressForm.pin?.source,
        isDefault: addresses.length === 0,
      });
      useUserStore.setState((s) => ({ addresses: [...s.addresses, created] }));
      setAddressForm(emptyAddressForm);
      addressPinText.current = NO_PIN_TEXT;
      setShowAddressForm(false);
      toast.success('Address added');
    } catch (err) {
      toast.error(errorText(err, 'Failed to add address'));
    } finally {
      setSaving(null);
    }
  };

  const makeVehicleDefault = async (id: string) => {
    setPromoting(id);
    try {
      await setDefaultVehicle(id);
      useUserStore.setState((s) => ({ vehicles: s.vehicles.map((v) => ({ ...v, isDefault: v.id === id })) }));
      void invalidateHome(queryClient);
      toast.success('Default vehicle updated');
    } catch (err) {
      toast.error(errorText(err, 'Failed to set default vehicle'));
    } finally {
      setPromoting(null);
    }
  };

  const makeAddressDefault = async (id: string) => {
    setPromoting(id);
    try {
      await setDefaultAddress(id);
      useUserStore.setState((s) => ({ addresses: s.addresses.map((a) => ({ ...a, isDefault: a.id === id })) }));
      toast.success('Default address updated');
    } catch (err) {
      toast.error(errorText(err, 'Failed to set default address'));
    } finally {
      setPromoting(null);
    }
  };

  const removeVehicle = async (id: string) => {
    setDeleting(id);
    try {
      await deleteVehicle(id);
      useUserStore.setState((s) => ({ vehicles: s.vehicles.filter((v) => v.id !== id) }));
      // The server may have made another car the default.
      void useUserStore.getState().fetchVehicles().catch(() => undefined);
      void invalidateHome(queryClient);
      toast.success('Vehicle removed');
    } catch (err) {
      toast.error(errorText(err, 'Failed to remove vehicle'));
    } finally {
      setDeleting(null);
    }
  };

  const removeAddress = async (id: string) => {
    setDeleting(id);
    try {
      await deleteAddress(id);
      useUserStore.setState((s) => ({ addresses: s.addresses.filter((a) => a.id !== id) }));
      void useUserStore.getState().fetchAddresses().catch(() => undefined);
      toast.success('Address removed');
    } catch (err) {
      toast.error(errorText(err, 'Failed to remove address'));
    } finally {
      setDeleting(null);
    }
  };

  const finishDeletion = async () => {
    setDeletingAccount(false);
    await useAuth.getState().forgetDeleted();
    router.replace('/garages' as Href);
  };

  const defaultBadge = (
    <View style={styles.defaultBadge}>
      <T size={11} weight={500} lh={15} color={colors.success}>
        Default
      </T>
    </View>
  );
  const sectionHead = (label: string, a11y: string, onAdd: () => void) => (
    <View style={styles.sectionHead}>
      <T size={14} weight={600} lh={20}>
        {label}
      </T>
      <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onAdd} style={styles.add}>
        <IconPlus size={14} color={colors.textPrimary} />
        <T size={12} weight={500} lh={16}>
          Add
        </T>
      </Pressable>
    </View>
  );

  return (
    <CustomerShell gap={12} scrollRef={scrollRef}>
      {title}
      <HubCard radius={22} style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Change profile photo" disabled={avatarBusy} onPress={() => void pickAvatar()} style={styles.avatar}>
          <LinearGradient colors={[colors.avatarFrom, colors.avatarTo]} style={styles.avatarFill}>
            {profile?.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <T size={17} weight={500}>
                {initialOf(firstNameOf(shown.name))}
              </T>
            )}
          </LinearGradient>
          <View style={styles.cameraDot}>
            <IconCamera size={11} color={colors.textPrimary} />
          </View>
        </Pressable>
        <View style={styles.flex}>
          <T size={15} weight={600} numberOfLines={1}>
            {shown.name}
          </T>
          <T num size={13} lh={18} color={colors.textSecondary}>
            {phone}
          </T>
          {areaLine ? (
            <T size={12} numberOfLines={1} color={colors.textSecondary}>
              {areaLine}
            </T>
          ) : null}
          {profile?.avatarUrl ? (
            <Pressable accessibilityRole="button" disabled={avatarBusy} onPress={() => void handleAvatarRemove()} hitSlop={10} style={styles.removePhoto}>
              <T size={12} lh={16} color={colors.textSecondary} style={styles.underline}>
                Remove photo
              </T>
            </Pressable>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Edit name and email" onPress={() => setEditingProfile(true)} style={styles.icon}>
          <IconPencil size={16} color={colors.textSecondary} />
        </Pressable>
      </HubCard>

      <Row label="My bookings" href="/bookings" />
      <Row label="Saved garages" href="/profile/saved-garages" />
      {slotAlertCount > 0 ? <Row label="Slot alerts" href="/profile/slot-alerts" count={slotAlertCount} /> : null}
      <Row label="Coupons" sub="Have a coupon? Add it here" href="/profile/coupons" count={readyCoupons || null} />
      {rewardsOn ? (
        <Row
          label="Detlio Rewards"
          sub={rewardsSummary.data ? `${stampsToGoLine(rewardsSummary.data.card.toGo)}${rewardsSummary.data.extras && rewardsSummary.data.extras.badgesEarned > 0 ? ` · ${rewardsSummary.data.extras.badgesEarned} ${rewardsSummary.data.extras.badgesEarned === 1 ? 'badge' : 'badges'}` : ''}` : undefined}
          href="/profile/rewards"
          trailing={rewardsSummary.data ? <LevelBadge level={rewardsSummary.data.level.level} label={rewardsSummary.data.level.label} /> : null}
        />
      ) : null}
      {giftsOn ? <Row label="Detlio credit" href="/profile/credit" count={credit.data ? formatRupees(Number(credit.data.balance)) : null} /> : null}
      {giftsOn ? <Row label="Gift a wash" href="/profile/gifts" /> : null}
      {notifications ? <Row label="Notifications" href="/profile/notifications" /> : null}
      <AppearanceCard />
      <AppLockCard />

      <View onLayout={(e) => (sections.current.vehicles = e.nativeEvent.layout.y)} style={styles.section}>
        {sectionHead('Vehicles', 'Add vehicle', () => setShowVehicleForm((v) => !v))}
        {showVehicleForm ? (
          <ScCard style={styles.form}>
            <View style={styles.pair}>
              <View style={styles.flex}>
                <ScInput label="Make" placeholder="e.g. Maruti" autoCorrect={false} value={vehicleForm.make} onChangeText={(make) => setVehicleForm((f) => ({ ...f, make }))} />
              </View>
              <View style={styles.flex}>
                <ScInput label="Model" placeholder="e.g. Swift" autoCorrect={false} value={vehicleForm.model} onChangeText={(model) => setVehicleForm((f) => ({ ...f, model }))} />
              </View>
            </View>
            <ScInput
              label="License plate (optional)"
              placeholder="e.g. TN 01 AB 1234"
              autoCapitalize="characters"
              autoCorrect={false}
              value={vehicleForm.licensePlate}
              onChangeText={(text) => setVehicleForm((f) => ({ ...f, licensePlate: text.toUpperCase() }))}
            />
            <View style={styles.typeBlock}>
              <T size={11} weight={500} lh={15} color={colors.textSecondary}>
                Type
              </T>
              <View style={styles.chips}>
                {VEHICLE_TIERS.map((t) => (
                  <Chip key={t.value} label={t.label} selected={vehicleForm.vehicleType === t.value} onPress={() => setVehicleForm((f) => ({ ...f, vehicleType: t.value as VehicleType }))} />
                ))}
              </View>
            </View>
            <View style={styles.pair}>
              <View style={styles.flex}>
                <ScButton variant="main" disabled={!vehicleForm.make || !vehicleForm.model || saving === 'vehicle'} onPress={() => void submitVehicle()}>
                  {saving === 'vehicle' ? 'Saving...' : 'Save vehicle'}
                </ScButton>
              </View>
              <View style={styles.flex}>
                <ScButton variant="outline" onPress={() => setShowVehicleForm(false)}>
                  Cancel
                </ScButton>
              </View>
            </View>
          </ScCard>
        ) : null}
        {vehicles.length === 0 && !showVehicleForm ? (
          <ScCard>
            <T size={13} lh={18} color={colors.textSecondary}>
              No vehicles added yet.
            </T>
          </ScCard>
        ) : (
          vehicles.map((v) => (
            <ScCard key={v.id} style={styles.itemCard}>
              <Pressable accessibilityRole="link" accessibilityLabel={`${v.make} ${v.model}: history`} onPress={() => router.push(`/profile/cars/${v.id}` as Href)} style={styles.itemLink}>
                <IconCar size={18} color={colors.textSecondary} />
                <View style={styles.flex}>
                  <View style={styles.nameRow}>
                    <T size={14} weight={500} lh={18} numberOfLines={1} style={styles.shrink}>
                      {`${v.make} ${v.model}`}
                    </T>
                    <IconChevronRight size={14} color={colors.textMuted} />
                  </View>
                  {/* The plate as it looks on the car (moment 8). */}
                  {v.plate ? (
                    <View style={styles.plate}>
                      <NumberPlate plate={v.plate} />
                    </View>
                  ) : null}
                  <T variant="t5" weight={400} color={colors.textSecondary} numberOfLines={1} style={styles.history}>
                    History
                  </T>
                </View>
              </Pressable>
              {v.isDefault ? (
                defaultBadge
              ) : (
                <Pressable accessibilityRole="button" accessibilityLabel={`Make ${v.make} ${v.model} the default vehicle`} disabled={promoting === v.id} onPress={() => void makeVehicleDefault(v.id)} style={styles.setDefault}>
                  <T size={11} weight={500} lh={15} color={colors.textSecondary} style={styles.underline}>
                    {promoting === v.id ? 'Setting...' : 'Set default'}
                  </T>
                </Pressable>
              )}
              <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${v.make} ${v.model}`} onPress={() => setEditingVehicle(v.id)} style={styles.icon}>
                <IconPencil size={16} color={colors.textSecondary} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${v.make} ${v.model}`} disabled={deleting === v.id} onPress={() => void removeVehicle(v.id)} style={styles.icon}>
                <IconTrash size={16} color={colors.textSecondary} />
              </Pressable>
            </ScCard>
          ))
        )}
      </View>

      <View style={styles.section}>
        {sectionHead('Addresses', 'Add address', () => setShowAddressForm((a) => !a))}
        {showAddressForm ? (
          <ScCard style={styles.form}>
            <ScInput label="Label" placeholder="e.g. Home, Work" value={addressForm.label} onChangeText={(label) => setAddressForm((f) => ({ ...f, label }))} />
            <View style={styles.typeBlock}>
              <T size={11} weight={500} lh={15} color={colors.textSecondary}>
                Pin the exact spot (optional)
              </T>
              <T size={11} lh={15} color={colors.textMuted}>
                {"Needed only for doorstep and pickup & drop — we'll ask before your first one if you skip it."}
              </T>
              <LocationPicker
                showSearch
                value={addressForm.pin ? { lat: addressForm.pin.lat, lng: addressForm.pin.lng } : null}
                onChange={(picked) => {
                  const previous = addressPinText.current;
                  addressPinText.current = { address: picked.address, city: picked.city };
                  setAddressForm((form) => refillFromPin({ ...form, pin: picked, pincode: picked.pincode || form.pincode }, picked, previous));
                }}
              />
            </View>
            <ScInput label="Address" placeholder="Street, area" value={addressForm.address} onChangeText={(address) => setAddressForm((f) => ({ ...f, address }))} />
            <View style={styles.pair}>
              <View style={styles.flex}>
                <ScInput label="City" placeholder="e.g. Chennai" value={addressForm.city} onChangeText={(city) => setAddressForm((f) => ({ ...f, city }))} />
              </View>
              <View style={styles.flex}>
                <ScInput
                  label="Pincode"
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="600001"
                  value={addressForm.pincode}
                  onChangeText={(text) => setAddressForm((f) => ({ ...f, pincode: text.replace(/\D/g, '').slice(0, 6) }))}
                />
              </View>
            </View>
            <View style={styles.pair}>
              <View style={styles.flex}>
                <ScButton
                  variant="main"
                  disabled={!addressForm.label || !addressForm.address || !addressForm.city || !addressForm.pincode || saving === 'address'}
                  onPress={() => void submitAddress()}
                >
                  {saving === 'address' ? 'Saving...' : 'Save address'}
                </ScButton>
              </View>
              <View style={styles.flex}>
                <ScButton variant="outline" onPress={() => setShowAddressForm(false)}>
                  Cancel
                </ScButton>
              </View>
            </View>
          </ScCard>
        ) : null}
        {addresses.length === 0 && !showAddressForm ? (
          <ScCard>
            <T size={13} lh={18} color={colors.textSecondary}>
              No addresses added yet.
            </T>
          </ScCard>
        ) : (
          addresses.map((a) => (
            <ScCard key={a.id} style={styles.itemCard}>
              <View style={styles.itemLink}>
                <IconMapPin size={18} color={colors.textSecondary} />
                <View style={styles.flex}>
                  <T size={14} weight={500} lh={18} numberOfLines={1}>
                    {a.label}
                  </T>
                  <T size={12} lh={16} color={colors.textSecondary} numberOfLines={2}>
                    {a.address}
                  </T>
                  {a.pincode ? (
                    <T num size={11} lh={15} color={colors.textMuted}>
                      {a.pincode}
                    </T>
                  ) : null}
                </View>
              </View>
              {a.isDefault ? (
                defaultBadge
              ) : (
                <Pressable accessibilityRole="button" accessibilityLabel={`Make ${a.label} the default address`} disabled={promoting === a.id} onPress={() => void makeAddressDefault(a.id)} style={styles.setDefault}>
                  <T size={11} weight={500} lh={15} color={colors.textSecondary} style={styles.underline}>
                    {promoting === a.id ? 'Setting...' : 'Set default'}
                  </T>
                </Pressable>
              )}
              <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${a.label} address`} onPress={() => setEditingAddress(a.id)} style={styles.icon}>
                <IconPencil size={16} color={colors.textSecondary} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${a.label} address`} disabled={deleting === a.id} onPress={() => void removeAddress(a.id)} style={styles.icon}>
                <IconTrash size={16} color={colors.textSecondary} />
              </Pressable>
            </ScCard>
          ))
        )}
      </View>

      <View style={styles.section}>
        <T size={14} weight={600} lh={20}>
          Support
        </T>
        <ScCard style={styles.linkCard}>
          <Pressable accessibilityRole="link" onPress={() => router.push('/help' as Href)} style={styles.linkRow}>
            <T size={13} lh={18}>
              Help centre
            </T>
            <IconChevronRight size={16} color={colors.textMuted} />
          </Pressable>
        </ScCard>
        <ScCard style={styles.support}>
          <View>
            <T size={13} weight={500} lh={18}>
              Need help?
            </T>
            <T size={12} lh={16} color={colors.textSecondary}>
              {`Reach our team at ${SUPPORT_PHONE_DISPLAY}`}
            </T>
          </View>
          <ContactButtons who="Detlio support" callHref={SUPPORT_TEL_HREF} whatsApp={SUPPORT_WHATSAPP_HREF} />
        </ScCard>
      </View>

      <View onLayout={(e) => (sections.current.complaints = e.nativeEvent.layout.y)}>
        <MyComplaints />
      </View>

      <View style={styles.section}>
        <T size={14} weight={600} lh={20}>
          Legal
        </T>
        <ScCard style={styles.linkCard}>
          {LEGAL_LINKS.map((link, index) => (
            <Pressable key={link.path} accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(`https://detlio.com${link.path}`)} style={[styles.linkRow, index > 0 && styles.linkLine]}>
              <T size={13} lh={18}>
                {link.label}
              </T>
              <IconChevronRight size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </ScCard>
      </View>

      <ScButton variant="outline" onPress={() => void signOut().then(() => router.push('/login' as Href))}>
        <IconLogout size={18} color={colors.textPrimary} />
        <Label>Log out</Label>
      </ScButton>
      <Pressable accessibilityRole="button" onPress={() => setDeletingAccount(true)} style={styles.delete}>
        <T size={13} lh={18} color={colors.error} align="center">
          Delete account
        </T>
      </Pressable>

      {editingProfile ? <EditProfileSheet user={shown as never} open onClose={() => setEditingProfile(false)} /> : null}
      {vehicles
        .filter((v) => v.id === editingVehicle)
        .map((v) => (
          <EditVehicleSheet key={v.id} vehicle={v} open onClose={() => setEditingVehicle(null)} onSaved={() => void invalidateHome(queryClient)} />
        ))}
      {addresses
        .filter((a) => a.id === editingAddress)
        .map((a) => (
          <EditAddressSheet key={a.id} address={a} open onClose={() => setEditingAddress(null)} />
        ))}
      <DeleteAccountSheet open={deletingAccount} onClose={() => setDeletingAccount(false)} onDeleted={() => void finishDeletion()} />
    </CustomerShell>
  );
}

const useStyles = createStyles((c) => ({
  plate: { marginTop: 6 },
  history: { marginTop: 4 },
  guest: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  login: { marginTop: 8 },
  appearance: { padding: 16 },
  appearanceNote: { marginTop: 4, marginBottom: 12 },
  rowCard: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  avatar: { height: 48, width: 48 },
  avatarFill: { height: 48, width: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { height: 48, width: 48 },
  cameraDot: { position: 'absolute', right: -2, bottom: -2, height: 20, width: 20, borderRadius: 10, backgroundColor: c.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  removePhoto: { alignSelf: 'flex-start', marginTop: 2 },
  underline: { textDecorationLine: 'underline' },
  icon: { height: 44, width: 36, alignItems: 'center', justifyContent: 'center' },
  section: { gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  add: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  form: { gap: 12 },
  pair: { flexDirection: 'row', gap: 8 },
  typeBlock: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  itemCard: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 8 },
  itemLink: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  defaultBadge: { borderRadius: 6, backgroundColor: c.successMuted, paddingHorizontal: 8, paddingVertical: 2 },
  setDefault: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 2 },
  linkCard: { paddingVertical: 0 },
  linkRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  linkLine: { borderTopWidth: 1, borderTopColor: c.line },
  support: { gap: 12 },
  delete: { minHeight: 44, justifyContent: 'center' },
}));
