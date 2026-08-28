import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowDownCircle, Check, CircleCheck, Trash2 } from "lucide-react-native";
import { t } from "@/lib/i18n/runtime";
import { colors, fonts, type } from "@/lib/theme";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = t("common.delete"),
  cancelLabel = t("common.cancel"),
  destructive = true,
  busy = false,
  success = false,
  info = false,
  icon,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  success?: boolean;
  /** Single dismiss button; no cancel / destructive confirm. */
  info?: boolean;
  icon?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const defaultIcon = info ? (
    <CircleCheck color={colors.ok} size={22} strokeWidth={1.85} />
  ) : destructive ? (
    <Trash2 color={colors.danger} size={22} strokeWidth={1.85} />
  ) : (
    <ArrowDownCircle color={colors.accent} size={22} strokeWidth={1.85} />
  );
  const locked = busy || success;

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!locked) onCancel();
      }}
    >
      <Pressable
        accessibilityRole="button"
        style={styles.backdrop}
        onPress={locked ? undefined : onCancel}
      >
        <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
          <View
            style={[
              styles.iconWrap,
              info ? styles.iconOk : destructive ? styles.iconDanger : styles.iconAccent,
            ]}
          >
            {icon ?? defaultIcon}
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            {info ? (
              <Pressable
                accessibilityRole="button"
                onPress={onConfirm}
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnAccent,
                  { opacity: pressed ? 0.86 : 1 },
                ]}
              >
                <Text style={styles.btnAccentText}>{confirmLabel}</Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  disabled={locked}
                  onPress={onCancel}
                  style={({ pressed }) => [
                    styles.btn,
                    styles.btnGhost,
                    { opacity: locked ? 0.35 : pressed ? 0.82 : 1 },
                  ]}
                >
                  <Text style={styles.btnGhostText}>{cancelLabel}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={locked}
                  onPress={onConfirm}
                  style={({ pressed }) => [
                    styles.btn,
                    success ? styles.btnOk : destructive ? styles.btnDanger : styles.btnAccent,
                    { opacity: busy && !success ? 0.7 : pressed && !locked ? 0.86 : 1 },
                  ]}
                >
                  {success ? (
                    <Check color={colors.void} size={22} strokeWidth={2.6} />
                  ) : (
                    <Text style={destructive ? styles.btnDangerText : styles.btnAccentText}>
                      {busy ? "…" : confirmLabel}
                    </Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(8, 7, 6, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.ruleLight,
    backgroundColor: colors.sheetRaised,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    gap: 10,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sheetHover,
    marginBottom: 4,
  },
  iconDanger: {
    backgroundColor: "rgba(201, 137, 128, 0.14)",
  },
  iconAccent: {
    backgroundColor: "rgba(228, 213, 184, 0.12)",
  },
  iconOk: {
    backgroundColor: "rgba(143, 184, 154, 0.16)",
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.3,
    color: colors.ink,
  },
  message: {
    ...type.body,
    marginBottom: 8,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    minHeight: 46,
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
  },
  btnGhostText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.inkSoft,
  },
  btnDanger: {
    backgroundColor: colors.danger,
  },
  btnDangerText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.void,
  },
  btnAccent: {
    backgroundColor: colors.accent,
  },
  btnAccentText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.accentText,
  },
  btnOk: {
    backgroundColor: colors.ok,
  },
});
