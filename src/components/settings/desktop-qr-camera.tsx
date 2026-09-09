import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useI18n } from "@/lib/i18n/context";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts } from "@/lib/theme";

export function DesktopQrCamera({
  disabled,
  onScan,
}: {
  disabled?: boolean;
  onScan: (raw: string) => void;
}) {
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(false);
  const locked = useRef(false);

  if (!permission) return null;

  if (!permission.granted) {
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

  if (!active) {
    return (
      <Pressable
        disabled={disabled}
        onPress={() => {
          triggerUiHaptic();
          locked.current = false;
          setActive(true);
        }}
        style={[styles.button, disabled ? styles.buttonOff : null]}
      >
        <Text style={styles.buttonLabel}>{t("desktop.scan")}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.preview}>
      <CameraView
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => {
          if (disabled || locked.current || !data) return;
          locked.current = true;
          setActive(false);
          onScan(data);
        }}
        style={styles.camera}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonOff: { opacity: 0.45 },
  buttonLabel: { color: colors.accentText, fontFamily: fonts.sansSemiBold, fontSize: 15 },
  preview: { height: 280, borderRadius: 12, overflow: "hidden", backgroundColor: colors.sheet },
  camera: { flex: 1 },
});
