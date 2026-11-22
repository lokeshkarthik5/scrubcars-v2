import type { MediaConfig } from '@repo/core/api/service-media';
import { formatServicePrice, inspectionNoteUnderPrice } from '@repo/core/pricing';
import type { Service, ServiceMedia } from '@repo/core/types';
import type { ReactNode } from 'react';
import { Image, View } from 'react-native';

import { HubTag } from '@/components/hub/parts';
import { IconChevronRight, IconPlus } from '@repo/native-ui/icons';
import { HubCard, PressRow } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { mediaSlots } from '@/lib/service-media-rules';

import { Figures, Num } from './figures';
import { RowAction } from './row-action';
import { ServiceMediaEditor } from './service-media-editor';
import { useT } from '@repo/core/i18n';

/** What a card shows on top: its photos, then a ready video's poster, three at most. */
function thumbnailsOf(media: readonly ServiceMedia[]): string[] {
  const { photos, liveVideo } = mediaSlots(media);
  const urls = photos.map((photo) => photo.url);
  if (liveVideo?.posterUrl) urls.push(liveVideo.posterUrl);
  return urls.slice(0, 3);
}

/** A service or package with a photo or video on it (the website's count, too). */
export function hasMedia(item: Pick<Service, 'media'>): boolean {
  return (item.media ?? []).length > 0;
}

/**
 * One row of the catalogue in the Home look (mockup garage-hub 3): a compact hub card with
 * its photos (or a dashed add box), Active or Off, the name and description, the price large
 * and light and its minutes. A service in the Services tab, a package in the Packages tab
 * (`details`: its included services, savings and amber note). Tapping it opens the edit
 * view, where the uploads and Disable / Delete now live (CatalogueTools).
 */
export function CatalogueCard({
  item,
  details,
  onOpen,
}: {
  item: Service;
  details?: ReactNode;
  onOpen: () => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const thumbs = thumbnailsOf(item.media ?? []);
  const note = inspectionNoteUnderPrice(item);
  return (
    <PressRow accessibilityLabel={t('Edit {name}', { name: item.name })} onPress={onOpen}>
      <HubCard style={styles.card}>
        <View style={styles.top}>
          <View style={styles.thumbs}>
            {thumbs.length > 0 ? (
              thumbs.map((uri) => <Image key={uri} source={{ uri }} style={styles.thumb} resizeMode="cover" />)
            ) : (
              <View style={[styles.thumb, styles.addBox]}>
                <IconPlus size={16} stroke={1.5} color={colors.dim} />
              </View>
            )}
          </View>
          <HubTag tone={item.isActive ? 'green' : 'quiet'}>{item.isActive ? t('Active') : t('Off')}</HubTag>
        </View>

        <T size={18} lh={24} style={styles.name}>
          {item.name}
        </T>
        {item.description ? (
          <T size={13} lh={18} color={colors.dim} numberOfLines={2}>
            {item.description}
          </T>
        ) : null}
        {details}

        <View style={styles.priceRow}>
          <T size={26} weight={300} lh={30} tracking={-0.02} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.price}>
            <Figures text={formatServicePrice(item)} weight={300} />
          </T>
          <T size={13} lh={18} color={colors.dim} numberOfLines={1} style={styles.shrink}>
            {note ? <Figures text={note} /> : null}
            {note && item.durationMins != null ? ' · ' : null}
            {item.durationMins != null ? (
              <>
                <Num>{item.durationMins}</Num> min
              </>
            ) : null}
          </T>
          <View style={styles.chevron}>
            <IconChevronRight size={16} color={colors.textMuted} />
          </View>
        </View>
      </HubCard>
    </PressRow>
  );
}

/**
 * The tools that were on every catalogue row, now inside its edit view: "Photos and video"
 * (the consent tick and every upload rule unchanged, ServiceMediaEditor) and Disable /
 * Enable and Delete.
 */
export function CatalogueTools({
  item,
  mediaConfig,
  onMediaChange,
  onToggle,
  onDelete,
  busy,
}: {
  item: Service;
  mediaConfig: MediaConfig | null;
  onMediaChange: (media: ServiceMedia[]) => void;
  onToggle: () => void;
  onDelete: () => void;
  /** An action on this row is saving. */
  busy: boolean;
}) {
  const t = useT();
  const styles = useStyles();
  return (
    <>
      {/* Photos and video, shown to customers on the garage page. */}
      <HubCard style={styles.tools}>
        <ServiceMediaEditor
          serviceId={item.id}
          serviceName={item.name}
          media={item.media}
          onMediaChange={onMediaChange}
          config={mediaConfig}
        />
      </HubCard>

      {/* Quiet outlines: none of them is what this view is for. */}
      <View style={styles.actions}>
        <View style={styles.actionsStatus}>
          <HubTag tone={item.isActive ? 'green' : 'quiet'}>{item.isActive ? t('Active') : t('Off')}</HubTag>
        </View>
        <RowAction onPress={onToggle} disabled={busy}>
          {item.isActive ? t('Disable') : t('Enable')}
        </RowAction>
        <RowAction onPress={onDelete} disabled={busy}>
          {t('Delete')}
        </RowAction>
      </View>
    </>
  );
}

const useStyles = createStyles((c) => ({
  shrink: { flexShrink: 1, minWidth: 0 },
  card: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 18 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  thumbs: { flexDirection: 'row', gap: 6, flexShrink: 1 },
  thumb: { width: 58, height: 44, borderRadius: 12, backgroundColor: c.disc },
  addBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: c.outlineSoft,
  },
  name: { marginTop: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 10 },
  price: { flexShrink: 0, maxWidth: '62%' },
  chevron: { marginLeft: 'auto', alignSelf: 'center' },
  tools: { padding: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  actionsStatus: { marginRight: 'auto' },
}));
