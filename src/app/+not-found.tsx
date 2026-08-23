import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { colors, type } from "@/lib/theme";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.wrap}>
        <Text style={type.pageTitle}>Página no encontrada</Text>
        <Link href="/" style={styles.link}>
          <Text style={type.body}>Volver al inicio</Text>
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
