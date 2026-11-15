import { repairQuotesOn, useRepairQuotesConfig } from '@repo/core/api/hooks/use-repair-quotes';
import { useT } from '@repo/core/i18n';
import { IconTool } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { View } from 'react-native';

import { Tile } from '@/components/home/tiles';

/**
 * apps/users/components/repair-quotes/repair-quotes-tile.tsx: Home's "Dent or scratch?
 * Repair quotes" tile (0075), one of the 164pt tiles. Only while the API says repair quotes
 * are on (GET /repair-quotes/config); nothing while it loads or is off.
 */
export function RepairQuotesTile() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const config = useRepairQuotesConfig();
  if (!repairQuotesOn(config.data)) return null;
  return (
    <Tile label={t('Dent or scratch?')} icon={IconTool} onPress={() => router.push('/repair-quotes/new' as Href)}>
      <View style={styles.spring} />
      <T size={22} weight={400} lh={25} tracking={-0.022} style={styles.title}>
        {t('Repair quotes')}
      </T>
      <T size={13} color={colors.dim} style={styles.foot}>
        {t('From garages near you')}
      </T>
    </Tile>
  );
}

/**
 * The row of tool tiles on Home, two to a row (ToolTilesRow on the web): Repair quotes now,
 * Shine Score beside it later. A lone tile keeps half the width, as drawn.
 */
export function ToolTilesRow({ show }: { show: boolean }) {
  const styles = useStyles();
  if (!show) return null;
  return (
    <View style={styles.row}>
      <RepairQuotesTile />
      <View style={styles.half} />
    </View>
  );
}

const useStyles = createStyles(() => ({
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  spring: { flex: 1 },
  title: { paddingRight: 6 },
  foot: { marginTop: 8 },
}));
