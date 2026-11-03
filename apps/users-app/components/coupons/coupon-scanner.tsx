import { codeFromScan } from '@repo/core/coupons';
import { ScButton } from '@repo/native-ui/button';
import { ScModal } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';

/**
 * CouponScanner (apps/users/components/coupons/coupon-scanner.tsx), with the phone's camera in
 * place of the browser's. Only a Detlio coupon's code leaves here, never the rest of the QR.
 */
export function CouponScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const [permission, requestPermission] = useCameraPermissions();
  const [hint, setHint] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  const blocked = permission !== null && !permission.granted && !permission.canAskAgain;
  return (
    <ScModal open onClose={onClose} accessibilityLabel="Scan a coupon">
      <View style={styles.column}>
        <T size={16} weight={600} lh={22}>
          Scan a coupon
        </T>
        {blocked ? (
          <>
            <T accessibilityRole="alert" size={13} lh={18} color={colors.textSecondary}>
              Camera access is off for Detlio. Allow it in your phone’s settings, or type the code instead.
            </T>
            <ScButton variant="outline" height={44} onPress={() => void Linking.openSettings()}>
              Open settings
            </ScButton>
          </>
        ) : (
          <>
            <View style={styles.frame}>
              {permission?.granted ? (
                <CameraView
                  style={styles.camera}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={({ data }) => {
                    if (done.current) return;
                    const code = codeFromScan(data);
                    if (code) {
                      done.current = true;
                      onCode(code);
                    } else {
                      setHint("That QR isn't a Detlio coupon.");
                    }
                  }}
                />
              ) : null}
            </View>
            <T size={13} lh={18} color={colors.textSecondary} align="center" accessibilityLiveRegion="polite">
              {hint ?? 'Point the camera at the QR on the coupon.'}
            </T>
          </>
        )}
        <ScButton variant="outline" height={44} onPress={onClose}>
          Close
        </ScButton>
      </View>
    </ScModal>
  );
}

const useStyles = createStyles((c) => ({
  column: { gap: 12 },
  frame: { height: 280, overflow: 'hidden', borderRadius: 12, backgroundColor: c.surface },
  camera: { flex: 1 },
}));
