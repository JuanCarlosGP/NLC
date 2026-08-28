import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ChatMdText } from "@/components/chat/chat-md-text";
import { useI18n } from "@/lib/i18n/context";
import { colors, fonts } from "@/lib/theme";

export const ChatBubble = memo(function ChatBubble({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  const mine = role === "user";
  const textColor = mine ? colors.accentText : colors.ink;

  return (
    <View style={[styles.row, mine ? styles.rowUser : styles.rowAssistant]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: mine ? colors.accent : colors.sheetRaised,
            borderColor: mine ? colors.accent : colors.rule,
          },
        ]}
      >
        {role === "assistant" ? (
          <ChatMdText content={content} color={textColor} style={styles.text} />
        ) : (
          <Text style={[styles.text, { color: textColor }]}>{content}</Text>
        )}
      </View>
    </View>
  );
});

export function ChatTypingMarker() {
  const { t } = useI18n();
  return (
    <View style={[styles.row, styles.rowAssistant]}>
      <View style={[styles.bubble, styles.typing, { backgroundColor: colors.sheetRaised, borderColor: colors.rule }]}>
        <Text style={styles.typingText}>{t("chat.typing")}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: "100%",
    marginBottom: 10,
  },
  rowUser: {
    alignItems: "flex-end",
  },
  rowAssistant: {
    alignItems: "flex-start",
  },
  bubble: {
    maxWidth: "88%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  text: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  typing: {
    paddingVertical: 8,
  },
  typingText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.muted,
  },
});
