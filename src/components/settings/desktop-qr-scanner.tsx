import { StyleSheet, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Pressable, Text } from "react-native";
import { useI18n } from "@/lib/i18n/context";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts } from "@/lib/theme";

export function DesktopQrScanner({
  enabled,
  onScan,
}: {
  enabled: boolean;
  onScan: (data: string) => void;
}) {
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();

  if (permission && !permission.granted) {
    return (
      <Pressable
        onPress={() => {
          triggerUiHaptic();
          void requestPermission();
        }}
        style={styles.button}
      >
        <Text style={styles.buttonLabel}>{t("desktop.camera")}</Text>
      </Pressable>
    );
  }

  if (!enabled || !permission?.granted) return null;

  return (
    <View style={styles.cameraWrap}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => onScan(data)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cameraWrap: {
    height: 240,
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: colors.sheetRaised,
  },
  camera: { flex: 1 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonLabel: { color: colors.accentText, fontFamily: fonts.sansSemiBold, fontSize: 15 },
});
