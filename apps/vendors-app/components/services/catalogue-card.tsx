import type { MediaConfig } from '@repo/core/api/service-media';
import { formatServicePrice } from '@repo/core/pricing';
import type { Service, ServiceMedia } from '@repo/core/types';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScBadge } from '@/components/form-controls';
import { ScCard } from '@/components/primitives';
import { T } from '@/components/text';
import { colors } from '@/lib/theme';

import { Figures, Num } from './figures';
import { RowAction } from './row-action';
import { ServiceMediaEditor } from './service-media-editor';

/**
 * One row of the catalogue: a service in the Services tab, a package in the Packages tab
 * (a package is a services row, so it has the same price line, badge, photo and video
 * block and actions). `details` sits under the price line: a package's included
 * services, its savings and its amber note.
 */
export function CatalogueCard({
  item,
  details,
  mediaConfig,
  onMediaChange,
  onEdit,
  onToggle,
  onDelete,
  busy,
}: {
  item: Service;
  details?: ReactNode;
  mediaConfig: MediaConfig | null;
  onMediaChange: (media: ServiceMedia[]) => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  /** An action on this row is saving. */
  busy: boolean;
}) {
  return (
    <ScCard style={styles.card}>
      <View style={styles.top}>
        <View style={styles.text}>
          <T size={13} weight={600}>
            {item.name}
          </T>
          {item.description ? (
            <T size={11} lh={16} color={colors.textMuted} numberOfLines={2}>
              {item.description}
            </T>
          ) : null}
          <T size={12} color={colors.textSecondary} style={styles.price}>
            <Figures text={formatServicePrice(item)} />
            {item.durationMins != null ? (
              <>
                {' '}
                · <Num>{item.durationMins}</Num> min
              </>
            ) : null}
          </T>
          {details}
        </View>
        <ScBadge variant={item.isActive ? 'success' : 'muted'}>{item.isActive ? 'Active' : 'Inactive'}</ScBadge>
      </View>

      {/* Photos and video, shown to customers on the garage page. */}
      <View style={styles.section}>
        <ServiceMediaEditor
          serviceId={item.id}
          serviceName={item.name}
          media={item.media}
          onMediaChange={onMediaChange}
          config={mediaConfig}
        />
      </View>

      {/* Quiet outlines, all three: none of them is what this screen is for. */}
      <View style={[styles.section, styles.actions]}>
        <RowAction onPress={onEdit}>Edit</RowAction>
        <RowAction onPress={onToggle} disabled={busy}>
          {item.isActive ? 'Disable' : 'Enable'}
        </RowAction>
        <RowAction onPress={onDelete} disabled={busy}>
          Delete
        </RowAction>
      </View>
    </ScCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  text: { flex: 1, minWidth: 0 },
  price: { marginTop: 2 },
  section: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
