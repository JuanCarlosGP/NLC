import { Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { colors, fonts, type } from "@/lib/theme";

const RIPPLE = { color: "rgba(240, 235, 227, 0.12)" };

export function Field({
  label,
  value,
  onChange,
  secure,
  keyboardType,
  autoCapitalize,
  placeholder,
  hint,
  error,
  accessibilityLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secure?: boolean;
  keyboardType?: "number-pad" | "default";
  autoCapitalize?: "none" | "sentences";
  placeholder?: string;
  hint?: string;
  error?: string;
  accessibilityLabel?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={type.label}>{label}</Text>
      <TextInput
        accessibilityLabel={accessibilityLabel ?? label}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={[styles.input, error ? styles.inputError : null]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function SwitchRow({
  label,
  hint,
  value,
  onValueChange,
  accessibilityLabel,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel?: string;
}) {
  const name = accessibilityLabel ?? label;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={name}
      accessibilityState={{ checked: value }}
      android_ripple={RIPPLE}
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => [styles.switchRow, { opacity: pressed ? 0.82 : 1 }]}
    >
      <View style={styles.switchMeta}>
        <Text style={styles.switchLabel}>{label}</Text>
        {hint ? <Text style={styles.switchHint}>{hint}</Text> : null}
      </View>
      <Switch
        pointerEvents="none"
        accessibilityLabel={name}
        value={value}
        trackColor={{ false: colors.rule, true: colors.accent }}
        thumbColor={colors.ink}
      />
    </Pressable>
  );
}

export const sourceFieldStyles = StyleSheet.create({
  field: { gap: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.void,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 8,
    minHeight: 48,
  },
  inputError: {
    borderColor: colors.danger,
  },
  hint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  error: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.danger,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 48,
    ...Platform.select({ web: { cursor: "pointer" } as object, default: {} }),
  },
  switchMeta: { flex: 1, gap: 2 },
  switchLabel: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
  switchHint: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
});

const styles = sourceFieldStyles;
