import { ApiError } from '@repo/core/api/client';
import type { CertificateShare } from '@repo/core/api/certificates';
import { useCertificateShare, useOwnCertificate } from '@repo/core/api/hooks/use-certificate';
import { certificateDateLabel, PHOTO_PLATE_WARNING, SHARE_EXPIRY_OPTIONS, shortVerifyLink, verifyPath, viewsLine } from '@repo/core/service-history-certificate';
import { Label, ScButton } from '@repo/native-ui/button';
import { Chip, ScSwitch } from '@repo/native-ui/chip';
import { IconCar, IconCopy, IconLink, IconPrinter, IconShare } from '@repo/native-ui/icons';
import { EmptyState, ErrorState, Notice, ScCard, Skeleton } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import * as Clipboard from 'expo-clipboard';
import * as Print from 'expo-print';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CertificateDocument } from '@/components/certificate/certificate-document';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/lib/auth';
import { certificateHtml, SEAL_SVG } from '@/lib/certificate-pdf';
import { escapeHtml } from '@/lib/receipt-html';

const WEB = 'https://detlio.com';

type Expiry = (typeof SHARE_EXPIRY_OPTIONS)[number]['days'];

const istDate = (iso: string) => certificateDateLabel(new Date(new Date(iso).getTime() + 330 * 60 * 1000).toISOString().slice(0, 10));

/** apps/users/app/profile/cars/[id]/certificate/page.tsx. Print / Save as PDF goes through the phone's print sheet. */
export default function CarCertificateScreen() {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuth((s) => s.user);
  const query = useOwnCertificate(id, { enabled: !!user });
  const action = useCertificateShare(id);
  const [localPhotos, setLocalPhotos] = useState(false);
  const [expiry, setExpiry] = useState<Expiry>(null);
  const [askPhotos, setAskPhotos] = useState(false);
  const [confirm, setConfirm] = useState<'stop' | 'renew' | null>(null);
  const qr = useRef<{ toDataURL: (done: (data: string) => void) => void } | null>(null);
  const data = query.data;
  const share = data?.share ?? null;
  const includePhotos = share ? share.includePhotos : localPhotos;

  const run = (next: Parameters<typeof action.mutate>[0], done: string, after?: () => void) =>
    action.mutate(next, {
      onSuccess: () => {
        toast.success(done);
        after?.();
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Something went wrong'),
    });
  const setPhotos = (on: boolean) => {
    if (on && !askPhotos) {
      setAskPhotos(true);
      return;
    }
    setAskPhotos(false);
    if (share) run({ kind: 'photos', includePhotos: on }, on ? 'Photos added to your link' : 'Photos removed from your link');
    else setLocalPhotos(on);
  };
  const makeLink = () => run({ kind: 'share', includePhotos, expiresInDays: expiry }, share ? 'New link made' : 'Link ready to share', () => setConfirm(null));

  const page = (children: React.ReactNode, title = 'Service history') => (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title={title} backTo={`/profile/cars/${id}`} />
      {children}
    </View>
  );
  if (!user) {
    return page(
      <View style={styles.center}>
        <T size={15} weight={600} align="center">
          Sign in to see your car&apos;s certificate
        </T>
        <ScButton variant="main" fullWidth={false} paddingX={32} onPress={() => router.push(`/login?next=${encodeURIComponent(`/profile/cars/${id}/certificate`)}` as Href)}>
          Sign in
        </ScButton>
      </View>
    );
  }
  const notFound = query.error instanceof ApiError && query.error.status === 404;
  if (query.isPending || notFound || !data) {
    return page(
      query.isPending ? (
        <View style={styles.body}>
          <Skeleton height={120} />
          <Skeleton height={120} />
        </View>
      ) : notFound ? (
        <View style={styles.center}>
          <EmptyState icon={<IconCar size={32} stroke={1.5} color={colors.textSecondary} />} title="This car isn't in your garage" subtitle="It may have been removed. Your cars are in Profile." />
          <ScButton variant="outline" fullWidth={false} onPress={() => router.navigate('/profile?section=vehicles' as Href)}>
            Go to Profile
          </ScButton>
        </View>
      ) : (
        <View style={styles.body}>
          <ErrorState message="Couldn't load this certificate. Check your connection." onRetry={() => void query.refetch()} />
        </View>
      )
    );
  }
  const live = share?.state === 'active' && share.token ? share : null;
  const url = live ? `${WEB}${verifyPath(live.token!)}` : null;
  const short = live ? shortVerifyLink(WEB, live.token!) : null;

  const print = async () => {
    const verification = await new Promise<string>((resolve) => {
      if (!qr.current || !short) {
        resolve('<p style="max-width:220px">Not shared. Share it from the Detlio app to add a QR code anyone can scan to check this record.</p>');
        return;
      }
      qr.current.toDataURL((base64) => resolve(`<div style="text-align:right"><img width="104" height="104" src="data:image/png;base64,${base64}"><div style="font-size:11px;font-weight:600;text-transform:uppercase">Check it is genuine</div><div style="font-size:11px">${escapeHtml(short)}</div></div>`));
    });
    try {
      await Print.printAsync({ html: certificateHtml(data.certificate, verification, SEAL_SVG) });
    } catch {
      // Closing the print sheet is a choice.
    }
  };

  return page(
    <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
      <ScButton variant="main" onPress={() => void print()}>
        <IconPrinter size={18} color={colors.canvas} />
        <Label color={colors.canvas}>Print / Save as PDF</Label>
      </ScButton>
      <T size={12} lh={16} color={colors.textMuted}>
        On Android, choose Save as PDF as the printer; on iPhone, tap Share on the print screen, then Save to Files.
      </T>

      <ScCard accessibilityLabel="Share link" style={styles.card}>
        <View>
          <View style={styles.title}>
            <IconLink size={16} />
            <T size={14} weight={600} lh={20}>
              Share link
            </T>
          </View>
          <T size={12} lh={16} color={colors.textSecondary} style={styles.mt2}>
            Anyone with the link, or the QR code on the printout, can check this record is genuine. They see the car, garages, dates and services. Never your name, phone or address, or the full number plate.
          </T>
        </View>
        <View style={styles.between}>
          <View style={styles.grow}>
            <T size={13} weight={500} lh={18}>
              Include before/after photos
            </T>
            <T size={11} lh={15} color={colors.textSecondary}>
              Off unless you turn it on.
            </T>
          </View>
          <ScSwitch checked={includePhotos} disabled={action.isPending} onChange={setPhotos} label="Include before/after photos" />
        </View>
        {askPhotos ? (
          <Notice title="Photos may show your number plate">
            <View style={styles.gap8}>
              <T size={13} lh={18} color={colors.textSecondary}>
                {PHOTO_PLATE_WARNING}
              </T>
              <View style={styles.row}>
                <ScButton variant="outline" fullWidth={false} paddingX={16} onPress={() => setPhotos(true)}>
                  Include photos
                </ScButton>
                <ScButton variant="outline" fullWidth={false} paddingX={16} onPress={() => setAskPhotos(false)}>
                  Not now
                </ScButton>
              </View>
            </View>
          </Notice>
        ) : null}
        {live && url && short ? (
          <LiveLink share={live} url={url} shortLink={short} busy={action.isPending} confirm={confirm} setConfirm={setConfirm} onStop={() => run({ kind: 'stop' }, 'Stopped sharing', () => setConfirm(null))} onRenew={makeLink} />
        ) : (
          <>
            {share?.state === 'expired' ? (
              <T size={12} lh={16} color={colors.warning}>
                {`Your link ran out${share.expiresAt ? ` on ${istDate(share.expiresAt)}` : ''}. Make a new one to share again.`}
              </T>
            ) : null}
            {share?.state === 'active' && !share.token ? (
              <T size={12} lh={16} color={colors.textSecondary}>
                Your link still works for whoever has it, but it can&apos;t be shown here. Make a new link to print a QR code; the old one will stop working.
              </T>
            ) : null}
            <View>
              <T size={12} weight={500} lh={16}>
                Link works for
              </T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {SHARE_EXPIRY_OPTIONS.map((option) => (
                  <Chip key={option.label} label={option.days === null ? 'Until you stop it' : option.label} selected={expiry === option.days} onPress={() => setExpiry(option.days)} />
                ))}
              </ScrollView>
            </View>
            <ScButton variant="outline" disabled={action.isPending} onPress={makeLink}>
              <IconLink size={16} color={colors.textPrimary} />
              <Label>{share ? 'Make a new link' : 'Share link'}</Label>
            </ScButton>
          </>
        )}
      </ScCard>

      <CertificateDocument
        certificate={data.certificate}
        showPhotos={includePhotos}
        verification={
          url && short ? (
            <View style={styles.verify}>
              <QRCode value={url} size={104} getRef={(c: unknown) => (qr.current = c as typeof qr.current)} />
              <View style={styles.grow}>
                <T size={11} weight={600} lh={15} uppercase tracking={0.025} color="#525252">
                  Check it is genuine
                </T>
                <T num size={11} lh={15} color="#0A0A0B">
                  {short}
                </T>
              </View>
            </View>
          ) : (
            <T size={11} lh={17} color="#525252">
              Not shared. Share it from the Detlio app to add a QR code anyone can scan to check this record.
            </T>
          )
        }
      />
    </ScrollView>,
    'Service history certificate'
  );
}

function LiveLink({ share, url, shortLink, busy, confirm, setConfirm, onStop, onRenew }: { share: CertificateShare; url: string; shortLink: string; busy: boolean; confirm: 'stop' | 'renew' | null; setConfirm: (value: 'stop' | 'renew' | null) => void; onStop: () => void; onRenew: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const copy = async () => {
    try {
      await Clipboard.setStringAsync(url);
      toast.success('Link copied');
    } catch {
      toast.info("Couldn't copy the link. Press and hold it to copy it instead.");
    }
  };
  return (
    <View style={styles.gap8}>
      <View style={styles.url}>
        <T num selectable size={12} lh={16}>
          {shortLink}
        </T>
      </View>
      <View style={styles.row}>
        <View style={styles.grow}>
          <ScButton variant="outline" onPress={() => Share.share({ title: 'Detlio Service History', message: url }).catch(() => undefined)}>
            <IconShare size={16} color={colors.textPrimary} />
            <Label>Share</Label>
          </ScButton>
        </View>
        <View style={styles.grow}>
          <ScButton variant="outline" onPress={() => void copy()}>
            <IconCopy size={16} color={colors.textPrimary} />
            <Label>Copy link</Label>
          </ScButton>
        </View>
      </View>
      <T size={11} lh={15} color={colors.textSecondary}>
        {`${viewsLine(share.viewCount, share.lastViewedAt)} · ${share.expiresAt ? `works until ${istDate(share.expiresAt)}` : 'works until you stop it'}`}
      </T>
      {confirm ? (
        <Notice title={confirm === 'stop' ? 'Stop sharing?' : 'Make a new link?'}>
          <View style={styles.gap8}>
            <T size={13} lh={18} color={colors.textSecondary}>
              {confirm === 'stop' ? 'The link and the QR code on any printout stop working at once.' : 'The current link and the QR code on any printout stop working. Print the certificate again for the new one.'}
            </T>
            <View style={styles.row}>
              <ScButton variant="outline" fullWidth={false} paddingX={16} disabled={busy} onPress={confirm === 'stop' ? onStop : onRenew}>
                {confirm === 'stop' ? 'Stop sharing' : 'Make a new link'}
              </ScButton>
              <ScButton variant="outline" fullWidth={false} paddingX={16} onPress={() => setConfirm(null)}>
                Cancel
              </ScButton>
            </View>
          </View>
        </Notice>
      ) : (
        <View style={styles.row}>
          <Pressable accessibilityRole="button" onPress={() => setConfirm('stop')} style={styles.textLink}>
            <T size={12} weight={600} lh={16} style={styles.underline}>
              Stop sharing
            </T>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setConfirm('renew')} style={styles.textLink}>
            <T size={12} weight={500} lh={16} color={colors.textSecondary} style={styles.underline}>
              New link
            </T>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 16 },
  body: { gap: 12, paddingHorizontal: 16, paddingTop: 8 },
  card: { gap: 12 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mt2: { marginTop: 2 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  gap8: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chips: { gap: 8, paddingVertical: 4 },
  url: { borderRadius: 10, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 8 },
  textLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  underline: { textDecorationLine: 'underline' },
  verify: { flexDirection: 'row', alignItems: 'center', gap: 12 },
}));
