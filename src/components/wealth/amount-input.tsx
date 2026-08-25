import { TextInput, type StyleProp, type TextStyle } from "react-native";
import { colors, fonts } from "@/lib/theme";
import { formatAmountInput, parseAmount, sanitizeAmountInput } from "@/lib/wealth/money";

export function AmountInput({
  value,
  onChangeText,
  decimals = 2,
  placeholder,
  style,
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (next: string) => void;
  decimals?: number;
  placeholder?: string;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={(raw) => onChangeText(sanitizeAmountInput(raw))}
      onBlur={() => {
        const parsed = parseAmount(value, decimals);
        if (parsed == null) return;
        onChangeText(formatAmountInput(parsed, decimals));
      }}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      keyboardType="decimal-pad"
      inputMode="decimal"
      autoCorrect={false}
      autoCapitalize="none"
      accessibilityLabel={accessibilityLabel}
      style={style}
    />
  );
}

export const amountInputStyle = {
  borderWidth: 1,
  borderColor: colors.rule,
  backgroundColor: colors.sheetRaised,
  color: colors.ink,
  fontFamily: fonts.sans,
  fontSize: 16,
  paddingHorizontal: 14,
  paddingVertical: 12,
  borderRadius: 8,
} as const;
