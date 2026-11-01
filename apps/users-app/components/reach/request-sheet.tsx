import type { CustomerRequest } from '@repo/core/api/booking-requests';
import { ApiError } from '@repo/core/api/client';
import { useCreateRequest, useRequestWindows } from '@repo/core/api/hooks/use-booking-requests';
import { garageQuery } from '@repo/core/api/hooks/use-vendors';
import { createAddress, createVehicle } from '@repo/core/api/users';
import type { JustOutsideVendor } from '@repo/core/api/vendors';
import { dayChipLabel, istClock, REQUEST_PROMISES, type RequestMode, WINDOW_PART_LABELS, type WindowPart } from '@repo/core/booking-requests';
import { resolveServiceAmount } from '@repo/core/pricing';
import { effectiveDurationMins, hasDuration } from '@repo/core/service-duration';
import { useUserStore } from '@repo/core/stores/user-store';
import type { VehicleType } from '@repo/core/types';
import { VEHICLE_TIERS } from '@repo/core/vehicles';
import { ScButton } from '@repo/native-ui/button';
import { Chip } from '@repo/native-ui/chip';
import { IconCheck, IconCircleCheck, IconPlus } from '@repo/native-ui/icons';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useQuery } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AddAddressSheet } from '@/components/checkout/add-address-sheet';
import { GuestCarForm } from '@/components/checkout/guest-car';
import { CheckoutSignInCard, useCheckoutSignIn } from '@/components/checkout/sign-in';
import { useAuth } from '@/lib/auth';
import { type DraftAddress, type DraftCar, draftCarReady } from '@/lib/booking-draft';
import { errorText } from '@/lib/error-text';

const GUEST_CAR = 'guest-car';
const GUEST_ADDRESS = 'guest-address';

async function saveGuestCar(car: DraftCar): Promise<string> {
  const created = await createVehicle({
    make: car.make.trim(),
    model: car.model.trim(),
    vehicleType: car.vehicleType,
    isDefault: useUserStore.getState().vehicles.length === 0,
  });
  useUserStore.setState((st) => ({ vehicles: [...st.vehicles, created] }));
  return created.id;
}

async function saveGuestAddress(address: DraftAddress): Promise<string> {
  const created = await createAddress({
    label: address.label,
    address: address.address,
    city: address.city,
    lat: address.lat,
    lng: address.lng,
    geoSource: address.geoSource,
    isDefault: useUserStore.getState().addresses.length === 0,
  });
  useUserStore.setState((st) => ({ addresses: [...st.addresses, created] }));
  return created.id;
}

/** RequestSheet (apps/users/components/reach/request-sheet.tsx). */
export function RequestSheet({ open, onClose, garage, mode }: { open: boolean; onClose: () => void; garage: JustOutsideVendor; mode: RequestMode }) {
  const colors = useColors();
  const styles = useStyles();
  const vendor = garage.vendor;
  const user = useAuth((s) => s.user);
  const vehicles = useUserStore((s) => s.vehicles);
  const addresses = useUserStore((s) => s.addresses);
  const fetchVehicles = useUserStore((s) => s.fetchVehicles);
  const fetchAddresses = useUserStore((s) => s.fetchAddresses);
  const garageData = useQuery({ ...garageQuery(vendor.id), enabled: open });
  const create = useCreateRequest();
  const signIn = useCheckoutSignIn();
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [carPicked, setCarChoice] = useState<string | null>(null);
  const [guestCar, setGuestCar] = useState<DraftCar | null>(null);
  const [addressPicked, setAddressChoice] = useState<string | null>(null);
  const [guestAddress, setGuestAddress] = useState<DraftAddress | null>(null);
  const [addAddressOpen, setAddAddressOpen] = useState(false);
  const [windowPicked, setWindow] = useState<{ date: string; part: WindowPart } | null>(null);
  const [pickingDay, setPickingDay] = useState(false);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<CustomerRequest | null>(null);
  const savedGuest = useRef<{ car?: string; address?: string }>({});

  useEffect(() => {
    if (!open || !user) return;
    void fetchVehicles().catch(() => undefined);
    void fetchAddresses().catch(() => undefined);
  }, [open, user, fetchVehicles, fetchAddresses]);

  const pinned = useMemo(() => addresses.filter((a) => a.lat !== null && a.lng !== null), [addresses]);
  const carChoice = carPicked ?? (user && vehicles.length > 0 ? (vehicles.find((v) => v.isDefault) ?? vehicles[0])!.id : null);
  const addressChoice = addressPicked ?? (user && pinned.length > 0 ? (pinned.find((a) => a.isDefault) ?? pinned[0])!.id : null);
  const services = useMemo(() => (garageData.data?.services ?? []).filter((s) => s.isActive && s.category !== 'package'), [garageData.data]);
  const guest = !user;
  const vehicleType: VehicleType | null =
    carChoice === GUEST_CAR || guest ? (guestCar?.vehicleType ?? null) : (vehicles.find((v) => v.id === carChoice)?.vehicleType ?? null);
  const chosen = services.filter((s) => serviceIds.includes(s.id));
  const durationMins = chosen.reduce((sum, s) => sum + effectiveDurationMins(s), 0);
  const windows = useRequestWindows(open && chosen.length > 0 ? { vendorId: vendor.id, mode, durationMins } : null);
  const window = useMemo(() => {
    if (!windowPicked || !windows.data) return null;
    const quick = windows.data.quick.find((w) => w.date === windowPicked.date && w.part === windowPicked.part);
    const day = windows.data.days.find((d) => d.date === windowPicked.date);
    const stillOpen = quick ? quick.open : windowPicked.part !== 'evening' && day ? day[windowPicked.part as 'morning' | 'afternoon'] : false;
    return stillOpen ? windowPicked : null;
  }, [windows.data, windowPicked]);
  const priced = chosen.map((s) => ({ service: s, amount: vehicleType ? resolveServiceAmount(s, vehicleType) : null }));
  const unpriced = vehicleType !== null && priced.some((p) => p.amount === null);
  const carReady = guest ? draftCarReady(guestCar) : carChoice !== null;
  const addressReady = guest ? guestAddress !== null : addressChoice !== null;
  const ready = chosen.length > 0 && !unpriced && carReady && addressReady && window !== null;
  const toggleService = (id: string) => setServiceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const label = mode === 'pickup' ? 'Request a pickup' : 'Request a visit';
  const carLabel = VEHICLE_TIERS.find((t) => t.value === vehicleType)?.label.toUpperCase();

  const send = async () => {
    if (!window) return;
    setError('');
    setSending(true);
    try {
      let vehicleId = carChoice;
      let addressId = addressChoice;
      if (guest || carChoice === GUEST_CAR) {
        if (!guestCar) return;
        savedGuest.current.car ??= await saveGuestCar(guestCar);
        vehicleId = savedGuest.current.car;
      }
      if (guest || addressChoice === GUEST_ADDRESS) {
        if (!guestAddress) return;
        savedGuest.current.address ??= await saveGuestAddress(guestAddress);
        addressId = savedGuest.current.address;
      }
      if (!vehicleId || !addressId) return;
      setSent(await create.mutateAsync({ vendorId: vendor.id, bookingType: mode, serviceIds, vehicleId, addressId, window }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : errorText(err, "Couldn't send the request. Try again."));
    } finally {
      setSending(false);
    }
  };

  const verifyAndSend = async () => {
    const ok = await signIn.verify();
    if (ok) await send();
  };

  const close = () => {
    onClose();
    if (sent) {
      setSent(null);
      setServiceIds([]);
      setWindow(null);
    }
  };

  const heading = (text: string) => (
    <T size={12} weight={500} lh={16} uppercase tracking={0.12} color={colors.textMuted}>
      {text}
    </T>
  );

  return (
    <ScSheet open={open} onClose={close} accessibilityLabel={`Request ${vendor.name}`}>
      {sent ? (
        <View style={styles.sent}>
          <IconCircleCheck size={44} color={colors.success} />
          <T size={20} weight={500} lh={28}>
            Request sent
          </T>
          <T size={15} lh={22} color={colors.textSecondary} align="center">
            {`Waiting for ${sent.garage.name}. They reply by ${istClock(sent.respondBy)}, or we ask the next garage. Nothing to pay yet.`}
          </T>
          <View style={styles.sentActions}>
            <ScButton
              height={48}
              variant="quiet"
              backgroundColor={colors.chosenBg}
              labelColor={colors.chosenText}
              onPress={() => {
                close();
                router.push('/requests' as Href);
              }}
            >
              See your request
            </ScButton>
            <ScButton variant="text" height={44} onPress={close}>
              Done
            </ScButton>
          </View>
        </View>
      ) : (
        <View style={styles.form}>
          <View>
            <T size={20} weight={500} lh={28}>
              {`Request ${vendor.name}`}
            </T>
            <T size={13} lh={18} color={colors.textSecondary}>
              {`${mode === 'pickup' ? 'They collect your car and bring it back' : 'To your home'} · ${garage.coverKm !== null ? `covers ${garage.coverKm} km, ` : ''}${garage.outsideKm} km outside`}
            </T>
          </View>

          {guest || carChoice === GUEST_CAR ? (
            <View style={styles.section}>
              {heading('Your car')}
              <GuestCarForm car={guestCar} onChange={setGuestCar} />
            </View>
          ) : null}
          {!guest && vehicles.length > 1 ? (
            <View style={styles.section}>
              {heading('Which car')}
              <View style={styles.chips}>
                {vehicles.map((v) => (
                  <Chip key={v.id} label={`${v.make} ${v.model}`} selected={carChoice === v.id} onPress={() => setCarChoice(v.id)} />
                ))}
              </View>
            </View>
          ) : null}
          {!guest && vehicles.length === 0 && carChoice !== GUEST_CAR ? (
            <Pressable accessibilityRole="button" onPress={() => setCarChoice(GUEST_CAR)} style={styles.addLink}>
              <IconPlus size={14} color={colors.textSecondary} />
              <T size={13} lh={18} color={colors.textSecondary} style={styles.underline}>
                Add your car
              </T>
            </Pressable>
          ) : null}

          <View style={styles.section}>
            {heading(`Service${carLabel ? ` · your ${carLabel}` : ''}`)}
            {garageData.isLoading ? (
              <T size={13} lh={18} color={colors.textSecondary}>
                Loading services…
              </T>
            ) : services.length === 0 ? (
              <T size={13} lh={18} color={colors.textSecondary}>
                This garage has no services to ask for yet.
              </T>
            ) : (
              <View style={styles.section}>
                {services.map((service) => {
                  const on = serviceIds.includes(service.id);
                  const amount = vehicleType ? resolveServiceAmount(service, vehicleType) : null;
                  return (
                    <Pressable
                      key={service.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => toggleService(service.id)}
                      style={[styles.service, on ? styles.serviceOn : styles.serviceOff]}
                    >
                      <View style={[styles.tick, on ? styles.tickOn : styles.tickOff]}>{on ? <IconCheck size={13} color={colors.chosenText} /> : null}</View>
                      <View style={styles.grow}>
                        <T size={15} lh={20}>
                          {service.name}
                        </T>
                        {hasDuration({ durationMins: service.durationMins }) ? (
                          <T size={12} lh={16} color={colors.textMuted}>
                            {`${service.durationMins} min`}
                          </T>
                        ) : null}
                      </View>
                      <T num size={15} lh={20}>
                        {vehicleType ? (amount === null ? 'Not priced' : `₹${amount.toLocaleString('en-IN')}`) : `from ₹${service.price.toLocaleString('en-IN')}`}
                      </T>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {unpriced ? (
              <T accessibilityRole="alert" size={13} lh={18} color={colors.error}>
                {"One of these isn't priced for your car at this garage. Remove it to send the request."}
              </T>
            ) : null}
          </View>

          <View style={styles.section}>
            {heading('When')}
            {chosen.length === 0 ? (
              <T size={13} lh={18} color={colors.textSecondary}>
                Pick a service to see when they can come.
              </T>
            ) : windows.isLoading ? (
              <T size={13} lh={18} color={colors.textSecondary}>
                Checking their hours…
              </T>
            ) : windows.isError || !windows.data ? (
              <T size={13} lh={18} color={colors.error}>
                {"Couldn't load their hours. Close and try again."}
              </T>
            ) : (
              <>
                <View style={styles.chips}>
                  {windows.data.quick.map((w) => (
                    <Chip
                      key={`${w.date}-${w.part}`}
                      label={w.label}
                      disabled={!w.open}
                      selected={!pickingDay && window?.date === w.date && window.part === w.part}
                      onPress={() => {
                        setPickingDay(false);
                        setWindow({ date: w.date, part: w.part });
                      }}
                    />
                  ))}
                  <Chip
                    label="Pick a day"
                    selected={pickingDay}
                    onPress={() => {
                      setPickingDay(true);
                      setWindow(null);
                    }}
                  />
                </View>
                {pickingDay ? (
                  <View style={styles.section}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                      {windows.data.days.map((d) => (
                        <Chip
                          key={d.date}
                          label={dayChipLabel(d.date)}
                          disabled={!d.morning && !d.afternoon}
                          selected={pickedDay === d.date}
                          onPress={() => {
                            setPickedDay(d.date);
                            setWindow(null);
                          }}
                        />
                      ))}
                    </ScrollView>
                    {pickedDay ? (
                      <View style={styles.chips}>
                        {(['morning', 'afternoon'] as const).map((part) => {
                          const day = windows.data!.days.find((d) => d.date === pickedDay);
                          return (
                            <Chip
                              key={part}
                              label={WINDOW_PART_LABELS[part]}
                              disabled={!day?.[part]}
                              selected={window?.date === pickedDay && window.part === part}
                              onPress={() => setWindow({ date: pickedDay, part })}
                            />
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <T size={12} lh={16} color={colors.textMuted}>
                  A window, not an exact time: the garage picks a start inside it.
                </T>
              </>
            )}
          </View>

          <View style={styles.section}>
            {heading('Where')}
            {!guest
              ? pinned.map((a) => (
                  <Pressable
                    key={a.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: addressChoice === a.id }}
                    onPress={() => setAddressChoice(a.id)}
                    style={[styles.address, addressChoice === a.id ? styles.serviceOn : styles.serviceOff]}
                  >
                    <T size={15} lh={20}>
                      {a.label || 'Address'}
                    </T>
                    <T size={12} lh={16} color={colors.textMuted} numberOfLines={1}>
                      {a.address}
                    </T>
                  </Pressable>
                ))
              : null}
            {guestAddress && (guest || addressChoice === GUEST_ADDRESS) ? (
              <View style={[styles.address, styles.serviceOn]}>
                <T size={15} lh={20}>
                  {guestAddress.label || 'Address'}
                </T>
                <T size={12} lh={16} color={colors.textMuted} numberOfLines={1}>
                  {guestAddress.address}
                </T>
              </View>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => setAddAddressOpen(true)} style={styles.addLink}>
              <IconPlus size={14} color={colors.textSecondary} />
              <T size={13} lh={18} color={colors.textSecondary} style={styles.underline}>
                {guestAddress || pinned.length > 0 ? 'Use another address' : 'Add your address'}
              </T>
            </Pressable>
          </View>

          <View style={styles.promises}>
            {REQUEST_PROMISES.map((line) => (
              <View key={line} style={styles.promise}>
                <IconCheck size={15} color={colors.success} />
                <T size={13} lh={18} color={colors.textSecondary} style={styles.grow}>
                  {line}
                </T>
              </View>
            ))}
          </View>
          {error ? (
            <T accessibilityRole="alert" size={13} lh={18} color={colors.error}>
              {error}
            </T>
          ) : null}
          {guest ? (
            ready ? (
              <CheckoutSignInCard signIn={signIn} verifyLabel="Verify and send request" onVerify={() => void verifyAndSend()} busy={sending} />
            ) : (
              <T size={13} lh={18} color={colors.textSecondary}>
                Pick a service, your car, a time and your address. Then sign in with your number to send it.
              </T>
            )
          ) : (
            <ScButton variant="main" size="lg" disabled={!ready || sending} onPress={() => void send()}>
              {sending ? 'Sending…' : 'Send request'}
            </ScButton>
          )}
          <T size={12} lh={16} color={colors.textMuted} align="center" style={styles.foot}>
            {`${label}: free to ask, no payment until they say yes.`}
          </T>
        </View>
      )}
      <AddAddressSheet
        open={addAddressOpen}
        onClose={() => setAddAddressOpen(false)}
        pickup={mode === 'pickup'}
        onAdded={guest ? undefined : (address) => setAddressChoice(address.id)}
        onSaveLocal={
          guest
            ? (address) => {
                setGuestAddress(address);
                setAddressChoice(GUEST_ADDRESS);
                setAddAddressOpen(false);
              }
            : undefined
        }
      />
    </ScSheet>
  );
}

const useStyles = createStyles((c) => ({
  sent: { alignItems: 'center', gap: 12, paddingVertical: 16 },
  sentActions: { alignSelf: 'stretch', gap: 8, paddingTop: 8 },
  form: { gap: 20 },
  section: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipsRow: { gap: 8, paddingVertical: 4 },
  addLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  underline: { textDecorationLine: 'underline' },
  service: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16 },
  serviceOn: { borderColor: c.chosenBg },
  serviceOff: { borderColor: c.border },
  tick: { height: 20, width: 20, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tickOn: { borderColor: c.chosenBg, backgroundColor: c.chosenBg },
  tickOff: { borderColor: c.stroke },
  grow: { flex: 1, minWidth: 0 },
  address: { minHeight: 56, justifyContent: 'center', borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8 },
  promises: { gap: 6 },
  promise: { flexDirection: 'row', gap: 8 },
  foot: { paddingBottom: 8 },
}));
