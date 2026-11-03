import { ApiError, apiClient } from '@repo/core/api/client';
import type { PublicCertificate } from '@repo/core/api/certificates';
import { API_BASE_URL } from '@repo/core/api/client';
import { certificateDateLabel, isCertificateTokenShaped } from '@repo/core/service-history-certificate';
import { ScButton } from '@repo/native-ui/button';
import { IconCircleCheckFilled, IconLinkOff } from '@repo/native-ui/icons';
import { Skeleton } from '@repo/native-ui/primitives';
import { FigureLine, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useQuery } from '@tanstack/react-query';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CertificateDocument } from '@/components/certificate/certificate-document';
import { PageHeader } from '@/components/page-header';

type Lookup = { kind: 'found'; certificate: PublicCertificate } | { kind: 'not_shared' } | { kind: 'rate_limited' } | { kind: 'unavailable' };

/** The token goes in the body, as the web's server does: request logs record paths. */
async function lookup(token: string): Promise<Lookup> {
  if (!isCertificateTokenShaped(token)) return { kind: 'not_shared' };
  try {
    return { kind: 'found', certificate: await apiClient<PublicCertificate>('/certificates/verify', { method: 'POST', auth: false, body: JSON.stringify({ token }) }) };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return { kind: 'not_shared' };
    if (error instanceof ApiError && error.status === 429) return { kind: 'rate_limited' };
    return { kind: 'unavailable' };
  }
}

/** apps/users/app/verify/[token]/page.tsx: anyone can check a shared certificate. Never cached. */
export default function VerifyScreen() {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token: string }>();
  const result = useQuery({ queryKey: ['certificate-verify', token], queryFn: () => lookup(token), gcTime: 0, staleTime: 0, retry: false });
  const message = (title: string, body: string) => (
    <View style={styles.center}>
      <IconLinkOff size={32} stroke={1.5} color={colors.textSecondary} />
      <T size={17} weight={600} lh={24} align="center">
        {title}
      </T>
      <T size={13} lh={18} align="center" color={colors.textSecondary}>
        {body}
      </T>
      <ScButton variant="outline" fullWidth={false} onPress={() => router.replace('/' as Href)}>
        Go to Detlio
      </ScButton>
    </View>
  );
  const data = result.data;
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title="Check a Service History" backTo="/" />
      {result.isPending ? (
        <View style={styles.body}>
          <Skeleton height={160} />
        </View>
      ) : !data || data.kind === 'unavailable' ? (
        message('Couldn’t check this certificate', "Detlio isn't answering right now. Please try again in a few minutes.")
      ) : data.kind === 'not_shared' ? (
        message('This certificate is no longer shared', "The car's owner may have stopped sharing it, or the link has run out or was copied wrongly. Ask the owner for a new link.")
      ) : data.kind === 'rate_limited' ? (
        message('Too many checks just now', 'Please wait a minute and open the link again.')
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
          <View accessibilityLiveRegion="polite" style={styles.genuine}>
            <IconCircleCheckFilled size={22} color={colors.success} />
            <View style={styles.grow}>
              <T size={14} weight={600} lh={20}>
                Genuine Detlio record
              </T>
              <FigureLine size={12} lh={16} color={colors.textSecondary} text={`Certificate ${data.certificate.certificateNumber}, read from Detlio on ${certificateDateLabel(data.certificate.asOf)}. It shows the car's record as it stands today, without the owner's details.`} />
            </View>
          </View>
          <CertificateDocument
            certificate={data.certificate}
            showPhotos={data.certificate.includesPhotos}
            photoSource={(path) => ({ uri: `${API_BASE_URL.replace(/\/$/, '')}${path}` })}
            issuedLabel="Checked"
            verification={
              <T size={11} lh={17} color="#525252">
                Shared by the car&apos;s owner through Detlio. Owner&apos;s name, phone and address are never shown.
              </T>
            }
          />
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  body: { gap: 12, paddingHorizontal: 16, paddingTop: 8 },
  genuine: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 12, borderWidth: 1, borderColor: c.success, paddingHorizontal: 16, paddingVertical: 12 },
  grow: { flex: 1, minWidth: 0 },
}));
