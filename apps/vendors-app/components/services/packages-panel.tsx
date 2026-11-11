import type { MediaConfig } from '@repo/core/api/service-media';
import { withMedia } from '@repo/core/service-media';
import type { Service, ServiceMedia, ServicePackage } from '@repo/core/types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ScButton } from '@repo/native-ui/button';
import { Chip } from '@repo/native-ui/chip';
import { IconPackage } from '@repo/native-ui/icons';
import { ScInput, ScTextarea } from '@repo/native-ui/inputs';
import { EmptyState, LoadError, ScCard, SkeletonList } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import {
  canSubmitPackage,
  emptyPackageForm,
  formFromPackage,
  type PackageForm,
  packagePayload,
  packagePreview,
  sanitizeDigits,
  selectableServices,
  toggleId,
} from '@/lib/service-form';
import { createPackage, deletePackage, getMyPackages, toggleServiceActive, updatePackage } from '@/lib/services-api';
import { createStyles, useColors } from '@repo/native-ui/theme';

import { CatalogueCard } from './catalogue-card';
import { DeleteSheet } from './delete-sheet';
import { Num } from './figures';
import { ChipRow, PricingBlock } from './pricing-block';
import { FieldLabel, SectionTitle } from './section-title';
import { useSaver } from './use-saver';
import { fill, useT } from '@repo/core/i18n';

/**
 * The Packages tab (apps/vendors/app/services/packages-panel.tsx): the builder, then
 * "Your packages". Mounted only while the tab is open, so it loads its packages when it
 * is opened.
 */
export function PackagesPanel({
  services,
  mediaConfig,
  onEditStarted,
}: {
  services: Service[];
  /** The photo-and-video block's config, fetched once by the screen. */
  mediaConfig: MediaConfig | null;
  /** The builder is above the list; bring it into view when Edit fills it. */
  onEditStarted: () => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [form, setForm] = useState<PackageForm>(emptyPackageForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [deleting, setDeleting] = useState<ServicePackage | null>(null);
  const { saving, run } = useSaver();

  const selectable = useMemo(() => selectableServices(services), [services]);
  const selected = useMemo(() => selectable.filter((s) => form.serviceIds.includes(s.id)), [selectable, form.serviceIds]);
  const preview = packagePreview(selected, form);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    getMyPackages()
      .then(setPackages)
      .catch(() => {
        toast.error(t('Failed to load packages'));
        setFailed(true);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const change = (patch: Partial<PackageForm>) => setForm((current) => ({ ...current, ...patch }));

  const reset = () => {
    setEditingId(null);
    setForm(emptyPackageForm);
  };

  const submit = () =>
    run('package', async () => {
      const payload = packagePayload(form);
      if (editingId) {
        const updated = await updatePackage(editingId, payload);
        setPackages((current) => current.map((p) => (p.id === editingId ? updated : p)));
      } else {
        const created = await createPackage(payload);
        setPackages((current) => [...current, created]);
      }
      reset();
    });

  const startEdit = (pkg: ServicePackage) => {
    setEditingId(pkg.id);
    setForm(formFromPackage(pkg));
    onEditStarted();
  };

  const setActive = (id: string, isActive: boolean) =>
    run(`package-active-${id}`, async () => {
      await toggleServiceActive(id, isActive);
      setPackages((current) => current.map((p) => (p.id === id ? { ...p, isActive } : p)));
    });

  // A package is a services row, so it shares the services' photo and video routes.
  const setMedia = (packageId: string, media: ServiceMedia[]) =>
    setPackages((current) => current.map((p) => (p.id === packageId ? withMedia(p, media) : p)));

  const remove = (id: string) =>
    run(`package-delete-${id}`, async () => {
      await deletePackage(id);
      setPackages((current) => current.filter((p) => p.id !== id));
      if (editingId === id) reset();
    });

  if (loading) return <SkeletonList count={2} height={112} />;
  if (failed) return <LoadError what={t('your packages')} onRetry={load} />;

  if (selectable.length < 2) {
    return (
      <EmptyState
        icon={<IconPackage size={28} stroke={1.5} color={colors.textMuted} />}
        title={t('Packages need two services')}
        subtitle={t('Add at least 2 active services before building a package.')}
      />
    );
  }

  return (
    <View style={styles.column}>
      <View style={styles.section}>
        <SectionTitle title={editingId ? t('Edit package') : t('Build a package')} onCancel={editingId ? reset : undefined} />
        <ScCard style={styles.form}>
          <ScInput label={t('Package name')} value={form.name} onChangeText={(name) => change({ name })} />
          <ScTextarea
            label={t('Description (optional)')}
            rows={2}
            value={form.description}
            onChangeText={(description) => change({ description })}
          />

          <View style={styles.group}>
            <FieldLabel>
              {fill(t('Services included ({count} selected · minimum {min})'), {
                count: <Num>{form.serviceIds.length}</Num>,
                min: <Num>2</Num>,
              })}
            </FieldLabel>
            <ChipRow>
              {selectable.map((svc) => (
                <Chip
                  key={svc.id}
                  label={`${svc.name} · ₹${svc.price}`}
                  selected={form.serviceIds.includes(svc.id)}
                  onPress={() => change({ serviceIds: toggleId(form.serviceIds, svc.id) })}
                />
              ))}
            </ChipRow>
          </View>

          <PricingBlock form={form} onChange={change} flatLabel={t('Package price (₹)')} />

          <View>
            <ScInput
              label={t('Duration (mins)')}
              keyboardType="number-pad"
              numeric
              value={form.durationMins}
              onChangeText={(text) => change({ durationMins: sanitizeDigits(text) })}
            />
            {preview.suggestedDuration > 0 && Number(form.durationMins) !== preview.suggestedDuration ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => change({ durationMins: String(preview.suggestedDuration) })}
                style={styles.suggest}
              >
                <T size={12} weight={500} style={styles.underline}>
                  {fill(t('Services add up to {mins} min — use that'), {
                    mins: <Num weight={500}>{preview.suggestedDuration}</Num>,
                  })}
                </T>
              </Pressable>
            ) : null}
          </View>

          {selected.length > 0 ? (
            // Raised onto graphite: a preview of what the customer sees, not part of the
            // form. Savings in green, as the customer's own discount line is.
            <View style={styles.preview}>
              <T size={11} lh={16} color={colors.textSecondary}>
                {fill(t('Bought separately: {amount}'), { amount: <Num>₹{preview.itemsTotal}</Num> })}
              </T>
              {preview.previewSavings > 0 ? (
                <T size={12} lh={18} weight={500} color={colors.success}>
                  {fill(t('Customers save {amount}'), { amount: <Num weight={500}>₹{preview.previewSavings}</Num> })}
                </T>
              ) : (
                <T size={11} lh={16} color={colors.textMuted}>
                  {fill(t('Price the package below {amount} to show a savings badge.'), {
                    amount: <Num>₹{preview.itemsTotal}</Num>,
                  })}
                </T>
              )}
            </View>
          ) : null}

          <ScButton
            variant="main"
            size="lg"
            disabled={!canSubmitPackage(form) || saving === 'package'}
            onPress={() => void submit()}
          >
            {saving === 'package' ? t('Saving...') : editingId ? t('Update package') : t('Create package')}
          </ScButton>
        </ScCard>
      </View>

      <View style={styles.section}>
        <SectionTitle title={t('Your packages')} count={packages.length} />
        {packages.length === 0 ? (
          <EmptyState
            icon={<IconPackage size={28} stroke={1.5} color={colors.textMuted} />}
            title={t('No packages yet')}
            subtitle={t('Bundle 2 or more services to create one.')}
          />
        ) : (
          <View style={styles.list}>
            {packages.map((pkg) => (
              <CatalogueCard
                key={pkg.id}
                item={pkg}
                mediaConfig={mediaConfig}
                onMediaChange={(media) => setMedia(pkg.id, media)}
                onEdit={() => startEdit(pkg)}
                onToggle={() => void setActive(pkg.id, !pkg.isActive)}
                onDelete={() => setDeleting(pkg)}
                busy={saving !== null}
                details={
                  <>
                    <T size={11} lh={16} color={colors.textMuted} style={styles.included}>
                      {pkg.items.map((item) => item.name).join(' + ')}
                    </T>
                    {pkg.savings !== null ? (
                      <T size={11} lh={16} weight={500} color={colors.success} style={styles.included}>
                        {fill(t('Saves {amount} vs {total} separately'), {
                          amount: <Num weight={500}>₹{pkg.savings}</Num>,
                          total: <Num weight={500}>₹{pkg.itemsTotal}</Num>,
                        })}
                      </T>
                    ) : null}
                    {/* Amber: a problem to fix, not a button. */}
                    {pkg.hasInactiveItems ? (
                      <T size={11} lh={16} color={colors.warning} style={styles.included}>
                        {t('Contains a disabled service — customers still see it listed.')}
                      </T>
                    ) : null}
                  </>
                }
              />
            ))}
          </View>
        )}
      </View>

      <DeleteSheet target={deleting} noun="package" onClose={() => setDeleting(null)} onConfirm={remove} />
    </View>
  );
}

const useStyles = createStyles((colors) => ({
  column: { gap: 20 },
  section: { gap: 12 },
  form: { gap: 12 },
  group: { gap: 8 },
  list: { gap: 8 },
  included: { marginTop: 4 },
  suggest: { minHeight: 44, justifyContent: 'center', marginTop: 4 },
  underline: { textDecorationLine: 'underline' },
  preview: { borderRadius: 12, backgroundColor: colors.surfaceElevated, padding: 12 },
}));
