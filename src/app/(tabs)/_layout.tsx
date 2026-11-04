import { useThemeId } from "@/lib/appearance/use-theme-id";
import { Slot } from "expo-router";

export const unstable_settings = {
  initialRouteName: "index",
};

export default function TabsLayout() {
  useThemeId();
  return <Slot />;
}
