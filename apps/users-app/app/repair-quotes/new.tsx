import { writeRepairBrief, type RepairBrief } from '@repo/core/api/repair-quotes';
import { repairQuotesOn, useCreateRepairRequest, useMyRepairRequests, useRepairQuotesConfig } from '@repo/core/api/hooks/use-repair-quotes';
import { useT } from '@repo/core/i18n';
import { REPAIR_QUOTE_RULES } from '@repo/core/repair-quotes';
import { useUserStore } from '@repo/core/stores/user-store';
import { VEHICLE_TIERS } from '@repo/core/vehicles';
import { ScButton } from '@repo/native-ui/button';
import { Edge, Raised, Recessed } from '@repo/native-ui/finish';
import {
  IconAlertTriangle,
  IconCamera,
  IconCheck,
  IconChevronRight,
  IconInfoCircle,
  IconMapPin,
  IconPencil,
  IconPlayerPlayFilled,
  IconPlus,
  IconVideo,
  IconX,
} from '@repo/native-ui/icons';
import { ErrorState, HubCard, Skeleton, Spinner } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import * as ImagePicker from 'expo-image-picker';
import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AreaPicker } from '@/components/area/area-picker';
import { PickButton } from '@/components/checkout/pick-button';
import { PageHeader } from '@/components/page-header';
import { BoxedPhoto } from '@/components/repair-quotes/parts';
import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/error-text';
import { coarse, isCitywide, useLocationStore } from '@/lib/location';
import { pickPhoto } from '@/lib/photo-upload';
import {
  briefImage,
  extractRepairFrames,
  pickRepairVideo,
  prepareRepairPhoto,
  uploadRepairPicture,
  uploadRepairVideo,
  type RepairPicture,
  type RepairVideo,
} from '@/lib/repair-media';
import { briefSource, keptBox, stepOneProblem } from '@/lib/repair-quote-view';

const R = REPAIR_QUOTE_RULES;

/**
 * apps/users/app/repair-quotes/new/page.tsx (0076): the car, a 15–30 s video and/or up to 3
 * photos, and one line (step 1); then what garages will see — a picture with Detlio's box and
 * a one-line brief the customer can edit — and Send (step 2). Frames are taken from the video
 * on the phone (expo-video) for the brief; every picture is re-encoded without its metadata
 * and the video wiped of where it was recorded before it uploads. If Detlio can't write the
 * brief, the customer writes it. The same endpoints as the website.
 */
export default function NewRepairRequestScreen() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const config = useRepairQuotesConfig();
  const vehicles = useUserStore((s) => s.vehicles);
  const location = useLocationStore((s) => s.location);
  const create = useCreateRepairRequest();
  const mine = useMyRepairRequests(!!user && repairQuotesOn(config.data));

  const [step, setStep] = useState<1 | 2>(1);
  const [carId, setCarId] = useState<string | null>(null);
  const [video, setVideo] = useState<RepairVideo | null>(null);
  const [photos, setPhotos] = useState<RepairPicture[]>([]);
  const [frames, setFrames] = useState<RepairPicture[]>([]);
  const [note, setNote] = useState('');
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaHint, setMediaHint] = useState<string | null>(null);
  const [busy, setBusy] = useState<'video' | 'photo' | null>(null);
  const [areaOpen, setAreaOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [brief, setBrief] = useState<RepairBrief | null>(null);
  const [briefFailed, setBriefFailed] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // From the tap: Send first waits for the uploads (a video can take a while), so the button
  // is held from then, not only once the request goes (as the web page).
  const [sending, setSending] = useState(false);
  const sendingNow = useRef(false);
  const uploads = useRef(new Map<string, Promise<string>>());

  useEffect(() => {
    if (user) void useUserStore.getState().fetchVehicles().catch(() => undefined);
  }, [user]);

  const car = vehicles.find((v) => v.id === carId) ?? vehicles.find((v) => v.isDefault) ?? vehicles[0] ?? null;
  const place = location && !isCitywide(location) ? location : null;
  const pictures = [...frames, ...photos];

  if (config.isSuccess && !repairQuotesOn(config.data)) {
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <PageHeader title={t('Repair quotes')} />
        <View style={styles.body}>
          <ErrorState message={t('Repair quotes aren’t available yet.')} onRetry={() => void config.refetch()} />
        </View>
      </View>
    );
  }

  const startUpload = (id: string, run: () => Promise<string>) => {
    if (uploads.current.has(id)) return;
    const promise = run();
    promise.catch(() => undefined);
    uploads.current.set(id, promise);
  };

  const chooseVideo = async (record: boolean) => {
    setMediaError(null);
    setMediaHint(null);
    setBusy('video');
    try {
      const picked = await pickRepairVideo(record);
      if (!picked) return;
      uploads.current.delete('video');
      setVideo(picked.video);
      setMediaHint(picked.hint);
      setFrames([]);
    } catch (error) {
      setMediaError(errorText(error, t('This video can’t be played. Try recording again.')));
    } finally {
      setBusy(null);
    }
  };

  const addPhoto = async (fromCamera: boolean): Promise<RepairPicture | null> => {
    if (photos.length >= R.maxPhotos) return null;
    setMediaError(null);
    let uri: string | null;
    if (fromCamera) uri = await pickPhoto();
    else {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, exif: false });
      uri = picked.canceled ? null : (picked.assets?.[0]?.uri ?? null);
    }
    if (!uri) return null;
    setBusy('photo');
    try {
      const picture = await prepareRepairPhoto(uri);
      setPhotos((current) => [...current, picture]);
      return picture;
    } catch (error) {
      setMediaError(errorText(error, t('This photo can’t be read. Try another one.')));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const problemKey = stepOneProblem({ hasCar: Boolean(car), hasMedia: Boolean(video) || photos.length > 0, note, hasPlace: Boolean(place) });
  const step1Problem = problemKey ? t(problemKey) : null;

  const readBrief = async (all: RepairPicture[]) => {
    setBrief(null);
    setBriefFailed(null);
    setEditing(false);
    if (config.data?.ai === false || all.length === 0) {
      setBriefFailed(t('Write a line for the garages: where the damage is and what it looks like.'));
      setText('');
      return;
    }
    try {
      const images = [];
      for (const picture of all) images.push(await briefImage(picture));
      const written = await writeRepairBrief({ note: note.trim(), images });
      setBrief(written);
      setText(written.text);
    } catch (error) {
      setBriefFailed(errorText(error, t('Detlio couldn’t write a summary. Write a line for the garages yourself.')));
      setText('');
    }
  };

  const next = async () => {
    if (step1Problem) return;
    setPreparing(true);
    setSendError(null);
    setStep(2);
    try {
      let taken = frames;
      if (video && frames.length === 0) {
        taken = await extractRepairFrames(video);
        setFrames(taken);
      }
      const all = [...taken, ...photos];
      if (video) startUpload('video', () => uploadRepairVideo(video));
      for (const picture of all) startUpload(picture.id, () => uploadRepairPicture(picture));
      await readBrief(all);
    } finally {
      setPreparing(false);
    }
  };

  const addAngle = async () => {
    const added = await addPhoto(true);
    if (!added) return;
    startUpload(added.id, () => uploadRepairPicture(added));
    setPreparing(true);
    try {
      await readBrief([...frames, ...photos, added]);
    } finally {
      setPreparing(false);
    }
  };

  const sendProblem = preparing ? t('Detlio is looking at your video…') : text.trim().length < 3 ? t('Write a line for the garages') : null;

  const send = async () => {
    if (sendProblem || !car || !place || sendingNow.current) return;
    sendingNow.current = true;
    setSending(true);
    setSendError(null);
    try {
      const videoKey = video ? await uploads.current.get('video') : undefined;
      const sent: Array<{ key: string; kind: 'photo' | 'frame' }> = [];
      for (const picture of pictures) {
        const key = await uploads.current.get(picture.id);
        if (key) sent.push({ key, kind: picture.kind });
      }
      const point = coarse(place);
      const request = await create.mutateAsync({
        vehicleId: car.id,
        lat: point.lat,
        lng: point.lng,
        note: note.trim(),
        brief: {
          text: text.trim(),
          area: brief?.area ?? null,
          damage: brief?.damage ?? null,
          box: keptBox(brief?.box, sent.length),
          source: briefSource(brief?.text ?? null, text),
        },
        video: videoKey && video ? { key: videoKey, secs: Math.min(R.videoMaxSecs, video.secs) } : null,
        photos: sent,
      });
      router.replace(`/repair-quotes/${request.id}` as Href);
    } catch (error) {
      setSendError(errorText(error, t('Couldn’t send it. Check your connection and try again.')));
      for (const [id, promise] of uploads.current) promise.catch(() => uploads.current.delete(id));
    } finally {
      sendingNow.current = false;
      setSending(false);
    }
  };

  const boxed = brief?.box ? pictures[brief.box.image] : undefined;
  const shown = boxed ?? pictures[0];
  const open = (mine.data ?? []).filter((request) => request.state === 'open' || request.state === 'booked').slice(0, 3);
  const stepLabel = (
    <T size={13} color={colors.dim}>
      {t('Step {n} of {total}', { n: step, total: 2 })}
    </T>
  );

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title={t('Repair quotes')} onBack={step === 2 ? () => setStep(1) : undefined} right={stepLabel} />
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        {step === 1 ? (
          <>
            <T size={15} color={colors.textSecondary}>
              {t('Show garages the damage and get quotes back, usually within a few hours. Free, nothing to pay now.')}
            </T>

            {open.map((request) => (
              <Pressable key={request.id} accessibilityRole="link" onPress={() => router.push(`/repair-quotes/${request.id}` as Href)}>
                <Raised radius={14} innerStyle={styles.openRow}>
                  <T size={13} numberOfLines={1} style={styles.shrink}>
                    {`${request.vehicle.label} · ${request.title}`}
                  </T>
                  <View style={styles.inline}>
                    <T size={13} color={colors.dim}>
                      {request.state === 'booked' ? t('Visit booked') : t('See quotes')}
                    </T>
                    <IconChevronRight size={16} color={colors.dim} />
                  </View>
                </Raised>
              </Pressable>
            ))}

            <View style={styles.section}>
              <T accessibilityRole="header" size={15} weight={600}>
                {t('Which car?')}
              </T>
              {vehicles.length === 0 ? (
                <ScButton variant="outline" fullWidth={false} onPress={() => router.push('/profile' as Href)}>
                  {t('Add a car')}
                </ScButton>
              ) : (
                vehicles.map((v) => {
                  const on = car?.id === v.id;
                  const type = VEHICLE_TIERS.find((tier) => tier.value === v.vehicleType)?.label;
                  return (
                    <PickButton key={v.id} radius={18} on={on} accessibilityLabel={`${v.make} ${v.model}`} onPress={() => setCarId(v.id)} style={styles.carFace}>
                      <View style={styles.shrink}>
                        <T size={15} weight={on ? 600 : 500} color={on ? colors.textPrimary : '#D4D4DA'} numberOfLines={1}>
                          {`${v.make} ${v.model}`}
                        </T>
                        <T size={11} color={colors.dim} numberOfLines={1}>
                          {[type ? t(type) : null, v.color?.toLowerCase()].filter(Boolean).join(' · ')}
                        </T>
                      </View>
                      {on ? <IconCheck size={18} color={colors.textPrimary} /> : null}
                    </PickButton>
                  );
                })
              )}
            </View>

            <View style={styles.section}>
              <T accessibilityRole="header" size={15} weight={600}>
                {t('Show the damage')}
              </T>
              <T size={13} color={colors.textSecondary}>
                {t('A {from}–{to} second video, walking slowly past it. Or up to {photos} photos.', { from: R.videoMinSecs, to: R.videoMaxSecs, photos: R.maxPhotos })}
              </T>
              <View style={styles.grid}>
                {video ? (
                  <View style={styles.tile} accessibilityLabel={t('Your video, {secs} seconds', { secs: video.secs })}>
                    {frames[0] ? <Image source={{ uri: frames[0].uri }} style={styles.fill} /> : null}
                    <View style={styles.center} pointerEvents="none">
                      <View style={styles.play}>
                        <IconPlayerPlayFilled size={18} color="#FFFFFF" />
                      </View>
                    </View>
                    <View style={styles.tag}>
                      <T num size={11} weight={600} color="#FFFFFF">{`0:${String(video.secs).padStart(2, '0')}`}</T>
                    </View>
                  </View>
                ) : (
                  <Pressable accessibilityRole="button" accessibilityLabel={t('Add video')} disabled={busy !== null} onPress={() => void chooseVideo(false)} style={styles.add}>
                    {busy === 'video' ? <Spinner /> : <IconVideo size={20} color={colors.textSecondary} />}
                    <T size={13} weight={500} color={colors.textSecondary}>
                      {t('Add video')}
                    </T>
                  </Pressable>
                )}
                {photos.map((photo, index) => (
                  <View key={photo.id} style={styles.tile}>
                    <Image source={{ uri: photo.uri }} accessibilityLabel={t('Photo {n}', { n: index + 1 })} style={styles.fill} />
                    <View style={styles.tag}>
                      <T size={11} weight={600} color="#FFFFFF">
                        {t('Photo')}
                      </T>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('Remove photo {n}', { n: index + 1 })}
                      onPress={() => {
                        setPhotos((current) => current.filter((p) => p.id !== photo.id));
                        uploads.current.delete(photo.id);
                      }}
                      style={styles.remove}
                    >
                      <IconX size={14} color="#FFFFFF" />
                    </Pressable>
                  </View>
                ))}
                {photos.length < R.maxPhotos ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={t('Add photo')} disabled={busy !== null} onPress={() => void addPhoto(false)} style={styles.add}>
                    {busy === 'photo' ? <Spinner /> : <IconCamera size={20} color={colors.textSecondary} />}
                    <T size={13} weight={500} color={colors.textSecondary}>
                      {t('Add photo')}
                    </T>
                  </Pressable>
                ) : null}
              </View>
              {video ? (
                <Pressable accessibilityRole="button" disabled={busy !== null} onPress={() => void chooseVideo(true)}>
                  <Raised radius={999} innerStyle={styles.again}>
                    <IconVideo size={16} color={colors.textPrimary} />
                    <T size={13} weight={600}>
                      {t('Record again')}
                    </T>
                  </Raised>
                </Pressable>
              ) : null}
              {mediaError ? (
                <T accessibilityRole="alert" size={13} color={colors.error}>
                  {mediaError}
                </T>
              ) : mediaHint ? (
                <T size={11} color={colors.dim}>
                  {mediaHint}
                </T>
              ) : null}
            </View>

            <View style={styles.section}>
              <T size={15} weight={600}>
                {t('What happened?')}
              </T>
              <Recessed radius={14}>
                <TextInput
                  accessibilityLabel={t('What happened?')}
                  value={note}
                  maxLength={R.noteMax}
                  onChangeText={setNote}
                  placeholder={t('Scraped a pillar while parking')}
                  placeholderTextColor={colors.textMuted}
                  keyboardAppearance={colors.keyboard}
                  style={styles.input}
                />
              </Recessed>
              <T size={11} color={colors.dim}>
                {t('One line is enough.')}
              </T>
            </View>

            <View style={styles.placeRow}>
              <IconMapPin size={16} color={colors.textSecondary} />
              <T size={13} color={colors.textSecondary} style={styles.shrink}>
                {place ? t('Garages near {place}', { place: place.label }) : t('Where is the car?')}
              </T>
              <Pressable accessibilityRole="button" onPress={() => setAreaOpen(true)} style={styles.change}>
                <T size={13} weight={600}>
                  {place ? t('Change') : t('Choose area')}
                </T>
              </Pressable>
            </View>

            <ScButton variant="main" size="lg" onPress={() => void next()} disabled={Boolean(step1Problem) || busy !== null} disabledReason={step1Problem ?? undefined}>
              {t('Next')}
            </ScButton>
          </>
        ) : (
          <>
            <T accessibilityRole="header" variant="title">
              {t('Check before sending')}
            </T>
            <HubCard style={styles.preview} accessibilityLabel={t('What garages will see')}>
              <T size={13} color={colors.dim}>
                {t('What garages will see')}
              </T>
              {preparing && !brief ? (
                <View style={styles.loading}>
                  <Skeleton height={170} radius={14} />
                  <View style={styles.inline}>
                    <Spinner size={16} />
                    <T size={13} color={colors.textSecondary}>
                      {t('Detlio is looking at your video…')}
                    </T>
                  </View>
                </View>
              ) : (
                <>
                  {shown ? (
                    <BoxedPhoto
                      uri={shown.uri}
                      label={t('Your car, with the damage marked')}
                      box={boxed ? brief!.box : null}
                      caption={boxed ? brief?.damage : null}
                      style={styles.shot}
                    />
                  ) : null}
                  {briefFailed ? (
                    <T size={13} color={colors.textSecondary} style={styles.gap12}>
                      {briefFailed}
                    </T>
                  ) : null}
                  {editing || !brief ? (
                    <Recessed radius={14} style={styles.gap12}>
                      <TextInput
                        accessibilityLabel={t('What garages will read')}
                        value={text}
                        multiline
                        maxLength={R.briefMax}
                        autoFocus={editing}
                        onChangeText={setText}
                        placeholder={t('Front bumper, left side: deep scratch with a small dent.')}
                        placeholderTextColor={colors.textMuted}
                        keyboardAppearance={colors.keyboard}
                        style={[styles.input, styles.textarea]}
                      />
                    </Recessed>
                  ) : (
                    <T size={18} weight={500} lh={24} style={styles.gap14}>
                      {text}
                    </T>
                  )}
                  <T size={13} color="#A1A1AA" style={styles.gap8}>
                    {`“${note.trim()}”`}
                  </T>
                  {brief ? (
                    <View style={styles.footer}>
                      <T size={11} color={colors.dim} style={styles.shrink}>
                        {video ? t('Written by Detlio from your video. Edit it if it is wrong.') : t('Written by Detlio from your photos. Edit it if it is wrong.')}
                      </T>
                      <Pressable accessibilityRole="button" onPress={() => setEditing((value) => !value)} style={styles.edit}>
                        {editing ? <IconCheck size={15} color={colors.textPrimary} /> : <IconPencil size={15} color={colors.textPrimary} />}
                        <T size={13} weight={500}>
                          {editing ? t('Done') : t('Edit')}
                        </T>
                      </Pressable>
                    </View>
                  ) : null}
                </>
              )}
            </HubCard>

            {brief?.unclear && photos.length < R.maxPhotos ? (
              <Edge innerStyle={styles.angle}>
                <View style={styles.angleText}>
                  <IconAlertTriangle size={18} color={colors.warning} />
                  <T size={13} color={colors.textSecondary} style={styles.shrink}>
                    <T size={13} weight={500}>
                      {t('Add another angle?')}
                    </T>{' '}
                    {brief.angleHint ?? t('A close photo helps garages quote closer.')}
                  </T>
                </View>
                <Pressable accessibilityRole="button" disabled={busy !== null || preparing} onPress={() => void addAngle()}>
                  <Raised radius={999} innerStyle={styles.again}>
                    <IconCamera size={16} color={colors.textPrimary} />
                    <T size={13} weight={600}>
                      {t('Add another angle')}
                    </T>
                  </Raised>
                </Pressable>
              </Edge>
            ) : null}

            <View style={styles.infoRow}>
              <IconInfoCircle size={16} color={colors.textSecondary} />
              <T size={13} color={colors.textSecondary} style={styles.shrink}>
                {t('Goes to up to {count} garages near you that do bodywork. Your number stays hidden.', { count: config.data?.maxGarages ?? R.maxGarages })}
              </T>
            </View>
            {sendError ? (
              <T accessibilityRole="alert" size={13} color={colors.error}>
                {sendError}
              </T>
            ) : null}
            <ScButton variant="main" size="lg" onPress={() => void send()} disabled={Boolean(sendProblem) || sending} disabledReason={sendProblem ?? undefined}>
              {sending ? t('Sending…') : t('Send to nearby garages')}
            </ScButton>
          </>
        )}
      </ScrollView>
      <AreaPicker open={areaOpen} onClose={() => setAreaOpen(false)} />
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  body: { paddingHorizontal: 16, paddingTop: 8, gap: 16 },
  section: { gap: 8 },
  shrink: { flexShrink: 1, minWidth: 0 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  openRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16 },
  carFace: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, alignSelf: 'stretch' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31.5%', height: 120, overflow: 'hidden', borderRadius: 14, backgroundColor: c.surfaceElevated },
  fill: { width: '100%', height: '100%' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  play: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  tag: { position: 'absolute', left: 6, bottom: 6, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6 },
  remove: { position: 'absolute', right: 4, top: 4, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)' },
  add: {
    width: '31.5%',
    height: 120,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  again: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  input: { minHeight: 48, paddingHorizontal: 16, fontSize: 16, color: c.textPrimary },
  textarea: { minHeight: 88, paddingVertical: 12, textAlignVertical: 'top' },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  change: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  preview: { padding: 18 },
  loading: { marginTop: 12, gap: 12 },
  shot: { marginTop: 12, height: 170 },
  gap8: { marginTop: 8 },
  gap12: { marginTop: 12 },
  gap14: { marginTop: 14 },
  footer: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  edit: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  angle: { gap: 12, padding: 16 },
  angleText: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 2 },
}));
