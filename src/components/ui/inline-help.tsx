import { createStyles } from "@/lib/appearance/density";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { colors, type } from "@/lib/theme";

export function InlineHelp({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronUp : ChevronDown;

  return <View style={styles.wrap}>
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={() => setOpen((value) => !value)}
      style={({ pressed }) => [styles.trigger, { opacity: pressed ? 0.75 : 1 }]}
    >
      <Text style={type.meta}>{label}</Text>
      <Chevron size={15} color={colors.muted} />
    </Pressable>
    {open ? <View style={styles.content}>{children}</View> : null}
  </View>;
}

const styles = createStyles({
  wrap: { gap: 8 },
  trigger: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, minHeight: 44 },
  content: { gap: 10, paddingBottom: 6 },
});
