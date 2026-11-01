import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppShell, garageScreen } from '@/components/app-shell';
import { ScButton } from '@/components/button';
import { DocumentCard } from '@/components/document-card';
import { Notice, SkeletonList } from '@/components/primitives';
import { SectionHeader, TopBar } from '@/components/rows';
import { T } from '@/components/text';
import { useIsVendorAdmin } from '@/lib/auth';
import {
  type GarageDocument,
  type GarageDocuments,
  getGarageDocuments,
  getGarageDocumentsConfig,
} from '@/lib/documents-api';
import {
  DOCUMENTS_CHECKED_BODY,
  DOCUMENTS_CHECKED_TITLE,
  DOCUMENTS_INTRO,
  DOCUMENTS_OFF_BODY,
  DOCUMENTS_OFF_TITLE,
} from '@/lib/documents-view';
import { colors } from '@/lib/theme';

// The web's back arrow goes to /settings; in the tab bar `back` would land on Home instead.
const goBack = () => router.navigate('/settings');

/**
 * Settings > Documents (apps/vendors/app/settings/documents/page.tsx): what the garage uploads
 * for Detlio to check, and where each one stands. When every required one is approved, the
 * documents count as checked: one of the steps to Silver (0063). The owner seat only (the API
 * refuses an operator), and only while the server has its private documents bucket; otherwise
 * there is nothing here. The documents are private: they are reached only through their
 * signed links (DocumentCard), and nothing of them is kept on the phone.
 */
function DocumentsScreen() {
  const isVendorAdmin = useIsVendorAdmin();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [data, setData] = useState<GarageDocuments | null>(null);
  const [failed, setFailed] = useState(false);

  // The gate sends an operator home already; this is the web's own redirect.
  useEffect(() => {
    if (!isVendorAdmin) router.replace('/home');
  }, [isVendorAdmin]);

  const fetchAll = useCallback(async () => {
    const config = await getGarageDocumentsConfig();
    return { enabled: config.enabled, data: config.enabled ? await getGarageDocuments() : null };
  }, []);

  const load = useCallback(async () => {
    try {
      const next = await fetchAll();
      setEnabled(next.enabled);
      setData(next.data);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [fetchAll]);

  // The screen is keyed by garage (garageScreen), so a company switch loads afresh.
  useEffect(() => {
    if (!isVendorAdmin) return;
    let cancelled = false;
    fetchAll()
      .then((next) => {
        if (cancelled) return;
        setEnabled(next.enabled);
        setData(next.data);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isVendorAdmin, fetchAll]);

  const replaceDocument = (next: GarageDocument) =>
    setData(
      (current) =>
        current && { ...current, documents: current.documents.map((doc) => (doc.type === next.type ? next : doc)) }
    );

  return (
    <AppShell>
      <TopBar title="Documents" onBack={goBack} />

      {failed ? (
        <View accessibilityRole="alert" style={styles.error}>
          <T size={13} color={colors.error}>
            Couldn’t load your documents.
          </T>
          <ScButton variant="outline" fullWidth={false} onPress={() => void load()} style={styles.retry}>
            Try again
          </ScButton>
        </View>
      ) : enabled === false ? (
        <Notice tone="neutral" title={DOCUMENTS_OFF_TITLE}>
          {DOCUMENTS_OFF_BODY}
        </Notice>
      ) : !data ? (
        <SkeletonList count={4} height={128} />
      ) : (
        <>
          <View style={styles.intro}>
            <SectionHeader title="Your documents" />
            <T size={12} color={colors.textSecondary}>
              {DOCUMENTS_INTRO}
            </T>
            {data.summary.verified ? (
              <Notice tone="neutral" title={DOCUMENTS_CHECKED_TITLE}>
                {DOCUMENTS_CHECKED_BODY}
              </Notice>
            ) : (
              <T size={13} weight={500}>
                <T num size={13} weight={500}>
                  {data.summary.approvedRequired}
                </T>
                {' of '}
                <T num size={13} weight={500}>
                  {data.summary.required}
                </T>
                {' required approved'}
              </T>
            )}
          </View>

          <View style={styles.list}>
            {data.documents.map((doc) => (
              <DocumentCard
                key={doc.type}
                doc={doc}
                onUploaded={(next) => {
                  replaceDocument(next);
                  void load();
                }}
                onRemoved={setData}
              />
            ))}
          </View>
        </>
      )}
    </AppShell>
  );
}

export default garageScreen(DocumentsScreen);

const styles = StyleSheet.create({
  error: { alignItems: 'flex-start', gap: 8 },
  retry: { paddingHorizontal: 16 },
  intro: { gap: 12 },
  list: { gap: 10 },
});
