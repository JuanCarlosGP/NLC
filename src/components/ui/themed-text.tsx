import { forwardRef, type ComponentRef } from "react";
import { Text as NativeText, TextInput as NativeTextInput, type TextProps, type TextInputProps } from "react-native";
import { useThemeId } from "@/lib/appearance/use-theme-id";
import { colors } from "@/lib/theme";
const pixelFont = { fontFamily: "GeistPixelSquare", fontWeight: "400" as const, letterSpacing: 0, includeFontPadding: false };
export type Text = ComponentRef<typeof NativeText>;
export const Text = forwardRef<Text, TextProps>(function Text(props, ref) {
    const pixel = useThemeId() === "geist-pixel";
    return <NativeText {...props} ref={ref} style={pixel ? [props.style, pixelFont] : props.style}/>;
});
export type TextInput = ComponentRef<typeof NativeTextInput>;
export const TextInput = forwardRef<TextInput, TextInputProps>(function TextInput(props, ref) {
    const pixel = useThemeId() === "geist-pixel";
    return <NativeTextInput {...props} ref={ref} selectionColor={props.selectionColor ?? (pixel ? colors.accent : undefined)} style={pixel ? [{ minHeight: 44, color: colors.ink }, props.style, pixelFont] : props.style}/>;
});
