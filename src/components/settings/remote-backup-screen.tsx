import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "@/components/ui/themed-text";
import { Screen } from "@/components/ui/screen";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { colors, type } from "@/lib/theme";
import { createStyles } from "@/lib/appearance/density";
import { useThemeId } from "@/lib/appearance/use-theme-id";
import { SERVICES } from "@/lib/settings/service-source";
import type { ServiceId } from "@/lib/settings/storage";
import { pickUpload, uploadFile, beginExport, runTransfer, awaitTransfer, downloadTransfer, cancelTransfer, listTransfers, type Transfer } from "@/lib/backend/transfers";
import { useI18n } from "@/lib/i18n/context";
export function RemoteBackupScreen() {
 useThemeId(); const { t } = useI18n(); const router = useRouter(); const params = useLocalSearchParams<{ service?: string }>();
 const service: ServiceId = SERVICES.includes(params.service as ServiceId) ? params.service as ServiceId : "health";
 const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [preview, setPreview] = useState<Transfer | null>(null);
 const [jobs,setJobs]=useState<Transfer[]>([]);
 const refreshJobs=()=>{void listTransfers().then(items=>setJobs(items.filter(item=>item.service===service).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,8))).catch(()=>{});};
 useEffect(refreshJobs,[service]);
 const jobId = useRef(""); const abort = useRef<AbortController | null>(null);
 async function perform(task: (signal: AbortSignal) => Promise<void>) {
  if (busy) return; setBusy(true); setMessage(""); jobId.current=""; abort.current = new AbortController();
  try { await task(abort.current.signal); } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo completar"); } finally { setBusy(false); refreshJobs(); }
 }
 async function wait(id: string, signal: AbortSignal) { jobId.current = id; return awaitTransfer(id, job => { setMessage(job.progress ? `${job.progress.files} archivos · ${(job.progress.bytes / 1048576).toFixed(1)} MB` : "Procesando en el móvil…"); }, signal); }
 return <Screen><View style={styles.body}>
  <Pressable onPress={() => router.back()}><Text style={type.meta}>‹ {t("common.back")}</Text></Pressable>
  <Text style={type.pageTitle}>{t("serviceBackup.title")}</Text><Text style={type.meta}>{t(`zones.${service}`)}</Text>
  <View style={styles.card}>
   <Pressable disabled={busy} accessibilityRole="button" style={styles.button} onPress={() => void perform(async signal => { const job = await beginExport(service); const ready = await wait(job.id, signal); downloadTransfer(ready.id); setMessage("Copia preparada para descargar"); })}><Text style={type.body}>Exportar copia</Text></Pressable>
   <Pressable disabled={busy} accessibilityRole="button" style={styles.button} onPress={() => void perform(async signal => { const file = await pickUpload(".zip,application/zip"); if (!file) return; const job = await uploadFile(file, file.name, (done, total) => setMessage(`Subiendo · ${Math.round(done / total * 100)} %`), signal); jobId.current = job.id; await runTransfer(job.id, "preview", service); setPreview(await wait(job.id, signal)); setMessage(""); })}><Text style={type.body}>Importar copia</Text></Pressable>
  </View>
  {!!message && <Text accessibilityRole="alert" style={type.meta}>{message}</Text>}
  {busy && <Pressable onPress={() => { void (async()=>{try {if(jobId.current)await cancelTransfer(jobId.current);abort.current?.abort();}catch{setMessage("Guardando en el móvil. Espera a que termine.");}})(); }}><Text style={[type.meta, { color: colors.danger }]}>Cancelar</Text></Pressable>}
  {!!jobs.length && <View style={styles.card}><Text style={type.sectionTitle}>Transferencias recientes</Text>{jobs.map(job=><View key={job.id} style={styles.button}><Text style={type.meta}>{job.name} · {job.status === "complete" ? "Completado" : job.status === "processing" ? "En curso" : job.status === "cancelled" ? "Cancelado" : job.status === "error" ? job.error : "Subiendo"}</Text>{job.downloadAvailable && <Pressable accessibilityRole="button" onPress={()=>downloadTransfer(job.id)}><Text style={type.body}>Descargar copia</Text></Pressable>}{job.status==="processing" && <Pressable accessibilityRole="button" onPress={()=>void perform(async signal=>{await wait(job.id,signal);setMessage("Operación completada en el móvil");})}><Text style={type.body}>Ver progreso</Text></Pressable>}</View>)}</View>}
  <ConfirmDialog open={!!preview} title="Restaurar copia" message={`${preview?.result?.summary?.records ?? 0} registros · ${preview?.result?.summary?.files ?? 0} archivos. Se conservarán las carpetas y fuentes del móvil.`} confirmLabel="Restaurar" busy={busy} onCancel={() => setPreview(null)} onConfirm={() => { const id = preview!.id; setPreview(null); void perform(async signal => { await runTransfer(id, "restore", service); await wait(id, signal); setPreview(null); setMessage("Copia restaurada en el móvil"); }); }}/>
 </View></Screen>;
}
const styles = createStyles(() => ({ body: { gap: 14, padding: 16 }, card: { borderWidth: 1, borderColor: colors.rule }, button: { padding: 14, borderBottomWidth: 1, borderColor: colors.rule } }));
