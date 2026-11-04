import { useThemeId } from "@/lib/appearance/use-theme-id";
import { densityData, space, radius } from "@/lib/appearance/density";
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "@/components/ui/themed-text";
import { bodyStore } from "@/lib/health/body-photos/storage";
import type { BodyPhoto } from "@/lib/health/body-photos/model";
import { useI18n } from "@/lib/i18n/context";
import { colors, type } from "@/lib/theme";
import { Button } from "../training/ui";

export function PhotoFrame({ photo, label, style, onOpen }: { photo?: BodyPhoto; label: string; style?: StyleProp<ViewStyle>; onOpen?(): void }) {
  useThemeId();
  const { t } = useI18n(); const [retry, setRetry] = useState(0);
  return <View {...densityData("photo-frame")} style={[{ aspectRatio: 3 / 4, backgroundColor: colors.void, borderRadius: radius(10), overflow: "hidden", borderWidth: 1, borderColor: colors.rule, alignItems: "center", justifyContent: "center" }, style]}>
    {photo ? <StoredPhoto key={`${photo.id}-${retry}`} photo={photo} label={label} onOpen={onOpen} onRetry={() => setRetry((value) => value + 1)} /> : <Text style={[type.meta, { padding: space(10), textAlign: "center" }]}>{t("body.noPhoto")}</Text>}
  </View>;
}
function StoredPhoto({ photo, label, onOpen, onRetry }: { photo: BodyPhoto; label: string; onOpen?(): void; onRetry(): void }) {
  useThemeId();
  const { t } = useI18n(); const [uri, setUri] = useState<string | null>(null); const [failed, setFailed] = useState(false); const live = useRef(true);
  useEffect(() => {
    let cancelled = false; let release: (() => void) | null = null;
    live.current = true;
    void bodyStore.source(photo).then((source) => { if (cancelled) source.dispose(); else { release = source.dispose; setUri(source.uri); } }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; live.current = false; release?.(); };
  }, [photo.id]);
  return <>
    {uri && !failed ? <Pressable accessibilityRole={onOpen ? "button" : "image"} accessibilityLabel={label} onPress={onOpen} style={{ width: "100%", height: "100%" }}>
      <Image source={{ uri }} resizeMode="contain" accessibilityLabel={label} style={{ width: "100%", height: "100%" }} onError={() => { if (live.current) setFailed(true); }} />
    </Pressable> : <View style={{ padding: space(10), gap: space(10) }}><Text style={[type.meta, { textAlign: "center" }]}>{t(failed ? "body.missingPhoto" : photo ? "common.loading" : "body.noPhoto")}</Text>
      {failed ? <Button title={t("body.retryPhoto")} onPress={onRetry} /> : null}</View>}
  </>;
}
