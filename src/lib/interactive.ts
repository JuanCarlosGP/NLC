import { Platform, type ViewStyle } from "react-native";

const webTransition: ViewStyle =
  Platform.OS === "web"
    ? {
        transitionProperty: "background-color, border-color, color",
        transitionDuration: "160ms",
        transitionTimingFunction: "ease",
      }
    : {};

export function webInteractiveStyle(): ViewStyle {
  if (Platform.OS !== "web") return {};
  return {
    ...webTransition,
    ...({
      userSelect: "none",
      WebkitUserSelect: "none",
      outlineStyle: "none",
      outlineWidth: 0,
      boxShadow: "none",
    } as object),
  } as ViewStyle;
}
