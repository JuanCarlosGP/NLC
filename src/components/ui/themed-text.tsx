import { markEditDraft, restoreDraftField } from "@/lib/backend/edit-drafts";
import { forwardRef, useEffect, useRef, type ComponentRef } from "react";
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
    const restored = useRef(false);
    useEffect(() => { if (restored.current || props.secureTextEntry) return; const value = restoreDraftField(props.accessibilityLabel || props.placeholder || ""); if (value !== null) { restored.current = true; if(String(props.value??"")!==value)props.onChangeText?.(value); } }, [props.accessibilityLabel, props.placeholder]);
    return <NativeTextInput {...props} onFocus={event => { if (!/search|buscar/i.test(props.accessibilityLabel || "")) markEditDraft(); props.onFocus?.(event); }} onChangeText={text => { if (!/search|buscar/i.test(props.accessibilityLabel || "")) markEditDraft(); props.onChangeText?.(text); }} ref={ref} selectionColor={props.selectionColor ?? (pixel ? colors.accent : undefined)} style={pixel ? [{ minHeight: 44, color: colors.ink }, props.style, pixelFont] : props.style}/>;
});
