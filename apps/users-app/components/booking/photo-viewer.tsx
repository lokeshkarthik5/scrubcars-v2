import { ScButton } from '@repo/native-ui/button';
import { ScModal } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles } from '@repo/native-ui/theme';
import { Image, View } from 'react-native';

/** A photo, large, in the web's ScModal: signed links from the API, shown as they are. */
export function PhotoViewer({
  photo,
  onClose,
  onRemove,
  removing,
}: {
  photo: { url: string; name: string } | null;
  onClose: () => void;
  onRemove?: () => void;
  removing?: boolean;
}) {
  const styles = useStyles();
  return (
    <ScModal open={photo !== null} onClose={onClose} dismissible={!removing} accessibilityLabel={photo?.name ?? 'Photo'}>
      {photo ? (
        <View style={styles.column}>
          <T size={13} weight={500} lh={18}>
            {photo.name}
          </T>
          <Image source={{ uri: photo.url }} accessibilityLabel={photo.name} resizeMode="contain" style={styles.image} />
          <View style={styles.row}>
            <View style={styles.grow}>
              <ScButton variant="outline" height={44} onPress={onClose}>
                Close
              </ScButton>
            </View>
            {onRemove ? (
              <View style={styles.grow}>
                <ScButton variant="outline" height={44} disabled={removing} onPress={onRemove}>
                  {removing ? 'Removing…' : 'Remove'}
                </ScButton>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </ScModal>
  );
}

const useStyles = createStyles(() => ({
  column: { gap: 12 },
  image: { height: 360, width: '100%', borderRadius: 12 },
  row: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
}));
