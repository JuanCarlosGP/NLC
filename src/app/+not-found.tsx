import { useThemeId } from "@/lib/appearance/use-theme-id";
import { createStyles } from "@/lib/appearance/density";
import { Link, Stack } from "expo-router";
import { View } from "react-native";
import { Text } from "@/components/ui/themed-text";
import { useI18n } from "@/lib/i18n/context";
import { colors, type } from "@/lib/theme";

export default function NotFoundScreen() {
  useThemeId();
  const { t } = useI18n();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.wrap}>
        <Text style={type.pageTitle}>{t("errors.notFound")}</Text>
        <Link href="/" style={styles.link}>
          <Text style={type.body}>{t("errors.backHome")}</Text>
        </Link>
      </View>
    </>
  );
}

const styles = createStyles(() => ({
  wrap: {
    flex: 1,
    backgroundColor: colors.void,
    padding: 24,
    justifyContent: "center",
    gap: 12,
  },
  link: { paddingVertical: 8 },
}));
