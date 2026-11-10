import { ApiError } from '@repo/core/api/client';
import { useAreaStatus, useRecommendGarage, useSignUpForArea } from '@repo/core/api/hooks/use-area';
import { useZones } from '@repo/core/api/hooks/use-zones';
import { cardClosesKey, closeOnce, FREE_WASH_RULES, freeWashCardTitle, freeWashCardVisible, freeWashesGone, parseCardCloses, recommendAsk, REFERRAL_CREDIT, waitingLine } from '@repo/core/area-signups';
import { useNow } from '@repo/core/hooks/use-now';
import { zoneFor, type Zone } from '@repo/core/zones';
import { ScButton } from '@repo/native-ui/button';
import { Chip, ScSwitch } from '@repo/native-ui/chip';
import { recommendRowText, type CustomerCity } from '@repo/core/customer-city';
import { Raised } from '@repo/native-ui/finish';
import { IconCheck, IconChevronRight, IconCircleCheck, IconGift, IconX } from '@repo/native-ui/icons';
import { ScInput, ScTextarea } from '@repo/native-ui/inputs';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors, useTheme } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { CheckoutSignInCard, useCheckoutSignIn } from '@/components/checkout/sign-in';
import { useAuth } from '@/lib/auth';
import { useCustomerPlace } from '@/lib/customer-place';
import { devicePrefs } from '@/lib/device-prefs';
import { isCitywide, useLocationStore } from '@/lib/location';
import { usePushDevice } from '@/lib/push-device';
import { track } from '@/lib/shims/analytics';

/** The customer's area: the chip they picked, or the zone a phone fix falls in. */
export function useCustomerZone(): Zone | null {
  const location = useLocationStore((s) => s.location);
  const zones = useZones();
  return useMemo(() => {
    if (!location || isCitywide(location)) return null;
    if (location.source === 'area' && location.zone) return zones.find((z) => z.slug === location.zone) ?? null;
    return zoneFor(location, zones);
  }, [location, zones]);
}

const noGarageYet = (zone: Zone | null): zone is Zone => zone !== null && zone.hasGarage === false;

function readCloses(slug: string) {
  return parseCardCloses(devicePrefs.getItem(cardClosesKey(slug).replace(/:/g, '.')));
}

/** The free-wash green, a card that stays readable on both themes. */
function useGreen() {
  const { scheme } = useTheme();
  return scheme === 'light' ? { border: '#A7DDBF', background: '#EAF7F0' } : { border: '#1F5A3A', background: '#0E2418' };
}

/**
 * FreeWashPiece (apps/users/components/reach/free-wash.tsx): the card, or once on the list, a
 * slim line. Only in a city the owner marked "Growing here" (0070): the card says more garages
 * are coming, which nobody has promised in a city with just a partner garage.
 */
export function FreeWashPiece({ placement }: { placement: 'top' | 'bottom' }) {
  const { city } = useCustomerPlace();
  if (!city.growing) return null;
  return <FreeWashPieceInGrowingCity placement={placement} />;
}

function FreeWashPieceInGrowingCity({ placement }: { placement: 'top' | 'bottom' }) {
  const colors = useColors();
  const styles = useStyles();
  const green = useGreen();
  const zone = useCustomerZone();
  const user = useAuth((s) => s.user);
  const status = useAreaStatus({ enabled: !!user });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [closes, setCloses] = useState(0);
  const now = useNow(60_000);
  const shown = useRef<string | null>(null);
  const signedUp = zone ? status.data?.signups.find((s) => s.zone.slug === zone.slug) : undefined;
  const hidden = useMemo(() => (zone ? closes >= 0 && !freeWashCardVisible(readCloses(zone.slug), now) : true), [zone, closes, now]);
  const showCard = noGarageYet(zone) && !signedUp && !hidden;
  useEffect(() => {
    if (showCard && zone && shown.current !== zone.slug) {
      shown.current = zone.slug;
      track('banner_view', { banner: 'free-wash' });
    }
  }, [showCard, zone]);

  if (!noGarageYet(zone)) return null;
  const sheets = (
    <>
      <FreeWashSheet open={sheetOpen} onClose={() => setSheetOpen(false)} initialZone={zone} />
      <RecommendSheet open={recommendOpen} onClose={() => setRecommendOpen(false)} zoneSlug={zone.slug} />
    </>
  );
  if (signedUp) {
    return (
      <>
        <OnTheListLine area={zone.name} onRecommend={() => setRecommendOpen(true)} />
        {sheets}
      </>
    );
  }
  if (!showCard) return sheets;
  const close = () => {
    devicePrefs.setItem(cardClosesKey(zone.slug).replace(/:/g, '.'), JSON.stringify(closeOnce(readCloses(zone.slug), Date.now())));
    setCloses((n) => n + 1);
    track('banner_close', { banner: 'free-wash' });
  };
  return (
    <>
      <View accessibilityLabel={`free-wash-${placement}`} style={[styles.card, { borderColor: green.border, backgroundColor: green.background }]}>
        <View style={styles.grow}>
          <T size={15} weight={500} lh={20}>
            {freeWashCardTitle(zone.name)}
          </T>
          <T size={12} lh={16} color={colors.textSecondary}>{`No garage in your area yet · ${waitingLine(zone.name, zone.waiting)}`}</T>
        </View>
        <Pressable accessibilityRole="button" onPress={() => setSheetOpen(true)} style={styles.claim}>
          <T size={14} weight={500} lh={18} color={colors.canvas}>
            Claim
          </T>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Close the free wash card" onPress={close} style={styles.x}>
          <IconX size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
      {sheets}
    </>
  );
}

export function OnTheListLine({ area, onRecommend }: { area: string; onRecommend: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.line}>
      <View style={styles.lineLeft}>
        <IconCheck size={15} color={colors.success} />
        <T size={13} lh={18} style={styles.grow}>{`On the list for ${area}`}</T>
      </View>
      <Pressable accessibilityRole="button" onPress={onRecommend} style={styles.recommend}>
        <T size={13} lh={18} style={styles.underline}>
          Recommend
        </T>
      </Pressable>
    </View>
  );
}

/** "Which area are you in?". A guest signs in on the in-sheet card first: it stops one person claiming fifty. */
export function FreeWashSheet({ open, onClose, initialZone }: { open: boolean; onClose: () => void; initialZone: Zone | null }) {
  const colors = useColors();
  const styles = useStyles();
  const green = useGreen();
  const user = useAuth((s) => s.user);
  const zones = useZones();
  const signUp = useSignUpForArea();
  const signIn = useCheckoutSignIn();
  const pushDevice = usePushDevice();
  const [pickedSlug, setZoneSlug] = useState<string | null>(null);
  const zoneSlug = pickedSlug ?? initialZone?.slug ?? null;
  const [otherOpen, setOtherOpen] = useState(false);
  const [push, setPush] = useState(true);
  const [whatsapp, setWhatsapp] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ area: string; freeWash: boolean; slug: string } | null>(null);
  const [recommending, setRecommending] = useState(false);
  const waitingZones = zones.filter((z) => z.hasGarage === false);
  const chips = [...(initialZone ? [initialZone] : []), ...waitingZones.filter((z) => z.slug !== initialZone?.slug).slice(0, 3)];
  const zone = zones.find((z) => z.slug === zoneSlug) ?? null;
  const gone = freeWashesGone(zone?.freeWashesLeft);

  const save = async () => {
    if (!zone) return;
    setError('');
    setSaving(true);
    try {
      const result = await signUp.mutateAsync({ zoneSlug: zone.slug, pushOptIn: push, whatsappOptIn: whatsapp });
      if (result.freeWash) track('free_wash_claim');
      if (push) {
        void pushDevice.turnOn().catch(() => toast.info("We couldn't turn on notifications on this phone. You can from Profile → Notifications."));
      }
      setDone({ area: result.zone.name, freeWash: result.freeWash, slug: result.zone.slug });
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Couldn't save it. Try again.");
    } finally {
      setSaving(false);
    }
  };
  const verifyAndSave = async () => {
    if (await signIn.verify()) await save();
  };
  const close = () => {
    onClose();
    setDone(null);
    setRecommending(false);
  };

  return (
    <ScSheet horizontalPadding={16} open={open} onClose={close} accessibilityLabel={recommending ? 'Recommend a garage' : done ? "You're on the list" : 'Which area are you in?'}>
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheet} contentContainerStyle={styles.sheetBody}>
        {done && recommending ? (
          <RecommendForm zoneSlug={done.slug} onDone={close} />
        ) : done ? (
          <View style={styles.done}>
            <IconCircleCheck size={44} color={colors.success} />
            <T size={20} weight={500} lh={26} align="center">
              You&apos;re on the list
            </T>
            <T size={15} lh={22} align="center" color={colors.textSecondary}>
              {`We'll tell you the day Detlio opens in ${done.area}.${done.freeWash ? ' Your free wash is saved.' : ''}`}
            </T>
            <View style={[styles.ask, { borderColor: green.border, backgroundColor: green.background }]}>
              <IconGift size={20} color={colors.success} />
              <T size={14} lh={20} style={styles.grow}>
                {recommendAsk()}
              </T>
            </View>
            <View style={styles.stretch}>
              <ScButton variant="outline" onPress={() => setRecommending(true)}>
                Recommend a garage
              </ScButton>
            </View>
            <ScButton variant="text" onPress={close}>
              Not now
            </ScButton>
          </View>
        ) : (
          <>
            <View>
              <T size={20} weight={500} lh={26}>
                Which area are you in?
              </T>
              <T size={13} lh={18} color={colors.textSecondary}>
                {`We're not in your area yet. Tell us, and ${gone ? 'we’ll tell you' : 'your first wash is on us'} when we arrive.`}
              </T>
            </View>
            <View style={styles.chips}>
              {chips.map((z) => (
                <Chip key={z.slug} label={z.name} selected={zoneSlug === z.slug} onPress={() => setZoneSlug(z.slug)} />
              ))}
              <Chip label="Other…" selected={otherOpen} onPress={() => setOtherOpen((v) => !v)} />
            </View>
            {otherOpen ? (
              <View style={styles.chips}>
                {waitingZones.map((z) => (
                  <Chip key={z.slug} label={z.name} selected={zoneSlug === z.slug} onPress={() => setZoneSlug(z.slug)} />
                ))}
              </View>
            ) : null}
            {zone ? (
              <View style={[styles.offer, gone ? { borderColor: colors.border } : { borderColor: green.border, backgroundColor: green.background }]}>
                <T size={11} weight={500} lh={15} uppercase tracking={0.12} color={colors.success}>
                  {gone ? 'Notify me' : 'Free wash'}
                </T>
                <T size={17} weight={500} lh={22}>
                  {gone ? `Be told when we reach ${zone.name}` : 'Your first car wash, free'}
                </T>
                <T size={13} lh={18} color={colors.textSecondary}>
                  {gone ? `The ${FREE_WASH_RULES.perZone} free washes for ${zone.name} are taken. We'll still tell you the day we open.` : `Up to ₹${FREE_WASH_RULES.maxRupees}, the day Detlio opens in ${zone.name}, for ${FREE_WASH_RULES.validDays} days. Saved to your account; we'll tell you.`}
                </T>
                <T size={12} lh={16} color={colors.textMuted}>
                  {waitingLine(zone.name, zone.waiting)}
                </T>
              </View>
            ) : null}
            <View>
              <View style={styles.switchRow}>
                <T size={15} lh={20}>
                  App notification
                </T>
                <ScSwitch label="App notification" checked={push} onChange={setPush} />
              </View>
              <View style={[styles.switchRow, styles.ruled]}>
                <View style={styles.grow}>
                  <T size={15} lh={20}>
                    WhatsApp
                  </T>
                  <T size={12} lh={16} color={colors.textMuted}>
                    Saved for later; we don&apos;t send WhatsApp messages yet.
                  </T>
                </View>
                <ScSwitch label="WhatsApp" checked={whatsapp} onChange={setWhatsapp} />
              </View>
            </View>
            {error ? (
              <T accessibilityRole="alert" size={13} lh={18} color={colors.error}>
                {error}
              </T>
            ) : null}
            {!zone ? (
              <T size={13} lh={18} color={colors.textSecondary}>
                Pick your area.
              </T>
            ) : user ? (
              <ScButton variant="main" disabled={saving} onPress={() => void save()}>
                {saving ? 'Saving…' : gone ? 'Notify me' : 'Save my free wash'}
              </ScButton>
            ) : (
              <CheckoutSignInCard signIn={signIn} verifyLabel={gone ? 'Verify and notify me' : 'Verify and save my free wash'} onVerify={() => void verifyAndSave()} busy={saving} />
            )}
          </>
        )}
      </ScrollView>
    </ScSheet>
  );
}

/**
 * A small city's one quiet row under its garages (0070, mockup D), as on the web: "Know a great
 * garage in Madurai? Recommend it", opening the recommend form (admin's leads).
 */
export function RecommendRow({ city }: { city: CustomerCity }) {
  const colors = useColors();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const words = recommendRowText(city);
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)}>
        <Raised radius={16} innerStyle={styles.recommendRow}>
          <T size={14} lh={19} color={colors.textSecondary} style={styles.grow}>
            {`${words.ask} `}
            <T size={14} weight={600} lh={19}>
              {words.action}
            </T>
          </T>
          <IconChevronRight size={16} color={colors.textMuted} />
        </Raised>
      </Pressable>
      <RecommendSheet open={open} onClose={() => setOpen(false)} zoneSlug={null} />
    </>
  );
}

/**
 * RecommendForm: a lead for the team. A guest signs in on the in-page card first (a small
 * city's row can be the first thing they tap): a recommendation is tied to an account.
 */
export function RecommendForm({ zoneSlug, onDone }: { zoneSlug: string | null; onDone: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const recommend = useRecommendGarage();
  const user = useAuth((s) => s.user);
  const signIn = useCheckoutSignIn();
  const [name, setName] = useState('');
  const [mapsLink, setMapsLink] = useState('');
  const [phone, setPhone] = useState('');
  const [why, setWhy] = useState('');
  const [error, setError] = useState('');
  const ready = name.trim().length >= 2 && (mapsLink.trim().length > 0 || phone.trim().length > 0);
  const submit = async () => {
    setError('');
    try {
      await recommend.mutateAsync({ zoneSlug: zoneSlug ?? undefined, name: name.trim(), mapsLink: mapsLink.trim() || undefined, phone: phone.trim() || undefined, why: why.trim() || undefined });
      toast.success('Thanks! We’ll get in touch with them.');
      setName('');
      setMapsLink('');
      setPhone('');
      setWhy('');
      onDone();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Couldn't send it. Try again.");
    }
  };
  return (
    <View style={styles.form}>
      <View>
        <T size={20} weight={500} lh={26}>
          Recommend a garage
        </T>
        <T size={13} lh={18} color={colors.textSecondary}>{`₹${REFERRAL_CREDIT.perGarageRupees} Detlio credit if they join and you book them (up to ₹${REFERRAL_CREDIT.maxPerCustomerRupees}).`}</T>
      </View>
      <ScInput label="Garage name" maxLength={100} value={name} onChangeText={setName} />
      <ScInput label="Google Maps link" keyboardType="url" autoCapitalize="none" placeholder="https://maps.app.goo.gl/…" maxLength={500} value={mapsLink} onChangeText={setMapsLink} />
      <ScInput label="Or their phone" keyboardType="phone-pad" placeholder="10-digit mobile" maxLength={14} value={phone} onChangeText={setPhone} />
      <ScTextarea label="Why they're good (optional)" maxLength={500} rows={3} value={why} onChangeText={setWhy} />
      {error ? (
        <T accessibilityRole="alert" size={13} lh={18} color={colors.error}>
          {error}
        </T>
      ) : null}
      {user ? (
        <ScButton variant="main" disabled={!ready || recommend.isPending} onPress={() => void submit()}>
          {recommend.isPending ? 'Sending…' : 'Send recommendation'}
        </ScButton>
      ) : (
        <CheckoutSignInCard
          signIn={signIn}
          verifyLabel="Verify and send"
          onVerify={() => {
            if (!ready) {
              setError('Give the garage’s name, and a Google Maps link or their phone.');
              return;
            }
            void signIn.verify().then((ok) => (ok ? submit() : undefined));
          }}
          busy={recommend.isPending}
        />
      )}
    </View>
  );
}

export function RecommendSheet({ open, onClose, zoneSlug }: { open: boolean; onClose: () => void; zoneSlug: string | null }) {
  const styles = useStyles();
  return (
    <ScSheet horizontalPadding={16} open={open} onClose={onClose} accessibilityLabel="Recommend a garage">
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheet} contentContainerStyle={styles.sheetBody}>
        {open ? <RecommendForm zoneSlug={zoneSlug} onDone={onClose} /> : null}
      </ScrollView>
    </ScSheet>
  );
}

const useStyles = createStyles((c) => ({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, padding: 16 },
  grow: { flex: 1, minWidth: 0 },
  claim: { minHeight: 44, justifyContent: 'center', borderRadius: 999, backgroundColor: c.textPrimary, paddingHorizontal: 16 },
  x: { width: 44, height: 44, marginRight: -8, alignItems: 'center', justifyContent: 'center' },
  line: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 14, borderWidth: 1, borderColor: c.border, paddingHorizontal: 16 },
  lineLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  recommend: { minHeight: 44, justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
  sheet: { maxHeight: 640 },
  sheetBody: { gap: 20, paddingHorizontal: 4, paddingVertical: 8 },
  done: { alignItems: 'center', gap: 12 },
  ask: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 16, borderWidth: 1, padding: 16 },
  stretch: { alignSelf: 'stretch' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  offer: { gap: 4, borderRadius: 16, borderWidth: 1, padding: 16 },
  switchRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  ruled: { borderTopWidth: 1, borderTopColor: c.line },
  form: { gap: 16 },
  recommendRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
}));
