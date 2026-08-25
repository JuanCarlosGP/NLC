import { Platform, type ViewStyle } from "react-native";

export function webInteractiveStyle(): ViewStyle {
  if (Platform.OS !== "web") return {};
  return {
    userSelect: "none",
    WebkitUserSelect: "none",
    outlineStyle: "none",
    outlineWidth: 0,
    boxShadow: "none",
    transitionProperty: "background-color, border-color, color",
    transitionDuration: "160ms",
    transitionTimingFunction: "ease",
  } as unknown as ViewStyle;
}
