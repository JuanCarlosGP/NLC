import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useI18n } from "@/lib/i18n/context";
import { colors, type } from "@/lib/theme";

export default function NotFoundScreen() {
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

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.void,
    padding: 24,
    justifyContent: "center",
    gap: 12,
  },
  link: { paddingVertical: 8 },
});
