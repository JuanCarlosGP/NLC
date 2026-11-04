import { space, textSize } from "@/lib/appearance/density";
import { useEffect, useState } from "react";
import { AppState, Text, View } from "react-native";
import { useTraining } from "@/lib/health/training/training-context";
import { clock, remainingRest } from "@/lib/health/training/model";
import { restAlertPermission, restAlertsSupported, syncRestAlert } from "@/lib/health/training/notifications";
import { useI18n } from "@/lib/i18n/context";
import { colors, fonts, type } from "@/lib/theme";
import { Button, styles } from "./ui";

export function RestCard() {
  const { rest, setRest } = useTraining(); const { t } = useI18n();
  const [now, setNow] = useState(Date.now()); const [permission, setPermission] = useState(false); const [error, setError] = useState(false); const [denied, setDenied] = useState(false);
  useEffect(() => {
    void restAlertPermission(false).then(setPermission).catch(() => {});
    const sub = AppState.addEventListener("change", () => setNow(Date.now()));
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => { clearInterval(interval); sub.remove(); };
  }, []);
  if (!rest) return null;
  const remaining = remainingRest(rest, now);
  async function enable() {
    try { const granted = await restAlertPermission(true); setPermission(granted); setDenied(!granted); if (granted) await syncRestAlert(rest); }
    catch { setDenied(true); }
  }
  return <View style={[styles.card, { borderColor: colors.accent }]}>
    <View style={styles.spread}><View style={{ flex: 1, gap: space(5) }}><Text style={type.label}>{t(remaining ? "training.rest" : "training.restOver")}</Text><Text style={type.body}>{rest.exerciseName}</Text></View>
      <Text style={{ fontFamily: fonts.serif, fontSize: textSize(38), color: colors.accent }}>{clock(remaining)}</Text></View>
    <Button title={t(remaining ? "training.skipRest" : "training.dismissRest")} onPress={() => { void setRest(null).catch(() => setError(true)); }} />
    {!restAlertsSupported ? <Text style={type.meta}>{t("training.restWebHint")}</Text> : permission ? <Text style={type.meta}>{t("training.alertsOn")}</Text> : <Button title={t("training.enableAlerts")} onPress={() => void enable()} />}
    {denied ? <Text style={type.meta}>{t("training.alertDenied")}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{t("training.errors.storage")}</Text> : null}
  </View>;
}
