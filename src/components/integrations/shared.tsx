import { useThemeId } from "@/lib/appearance/use-theme-id";
import { useState, type ReactNode } from "react";
import { Linking, Platform, Pressable, View } from "react-native";
import { Text } from "@/components/ui/themed-text";
import { ArrowLeft, ArrowUpRight, Activity, Landmark } from "lucide-react-native";
import { useRouter } from "expo-router";
import { createStyles, densityData, space } from "@/lib/appearance/density";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { InlineHelp } from "@/components/ui/inline-help";
import { Button } from "@/components/health/training/ui";
import { useI18n } from "@/lib/i18n/context";
import { useIntegrations } from "@/lib/integrations/integrations-context";
import { bridgeRequest, ConnectionError } from "@/lib/integrations/client";
import { parseSnapshot, type Provider, type Snapshot } from "@/lib/integrations/model";
import { pickIntegrationCopy, saveIntegrationCopy } from "@/lib/integrations/io";
import { colors, type } from "@/lib/theme";
export const styles = createStyles(() => ({
  card:{borderWidth:1,borderColor:colors.rule,backgroundColor:colors.sheet,borderRadius:14,padding:16,gap:12},row:{flexDirection:"row",alignItems:"center",flexWrap:"wrap",gap:10},spread:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10},section:{gap:12},stat:{gap:5,flexGrow:1,flexBasis:"44%",borderWidth:1,borderColor:colors.rule,padding:12},error:{...type.body,color:colors.danger},line:{borderTopWidth:1,borderColor:colors.rule,paddingTop:12,gap:6},
}));
export function IntegrationCard({provider}:{provider:Provider}){
  useThemeId();const router=useRouter();const{t}=useI18n();const Icon=provider==="whoop"?Activity:Landmark;return <Pressable accessibilityRole="button" onPress={()=>router.push(provider==="whoop"?"/health/whoop":"/wealth/mercury")} style={[styles.card,styles.row]}><Icon size={24} color={colors.accent} strokeWidth={1.6}/><View style={{flex:1,gap:space(5)}}><Text style={type.sectionTitle}>{provider==="whoop"?"WHOOP":"Mercury"}</Text><Text style={type.meta}>{t(`integrations.${provider}Hint`)}</Text></View><ArrowUpRight color={colors.inkSoft} size={20}/></Pressable>;}
export function PageHeader({title}:{title:string}){
  useThemeId();const router=useRouter();const{t}=useI18n();return <View style={styles.row}><Pressable accessibilityRole="button" accessibilityLabel={t("chrome.home")} onPress={()=>router.push("/")} style={{minWidth:44,minHeight:44,justifyContent:"center",paddingVertical:space(12),paddingRight:space(6)}}><ArrowLeft color={colors.ink} size={22}/></Pressable><Text style={type.pageTitle}>{title}</Text></View>;}
export function Stats({children}:{children:ReactNode}){
  useThemeId();return <View {...densityData("stats")} style={[styles.row,{alignItems:"stretch"}]}>{children}</View>;}
export function Stat({label,value}:{label:string;value:string}){
  useThemeId();return <View style={styles.stat}><Text style={type.meta}>{label}</Text><Text style={type.sectionTitle}>{value}</Text></View>;}
export function Metric({label,value}:{label:string;value:string}){
  useThemeId();return <View style={styles.spread}><Text style={type.meta}>{label}</Text><Text style={type.body}>{value}</Text></View>;}
export function display(value:number|null|undefined,suffix="",digits=0){return value===null||value===undefined?"—":`${value.toFixed(digits)}${suffix}`;}
export function duration(minutes:number|null|undefined){if(minutes===null||minutes===undefined)return "—";const total=Math.round(minutes);return `${Math.floor(total/60)} h ${total%60} min`;}
export function dateLabel(value:string,locale:string){return new Date(`${value.slice(0,10)}T12:00:00Z`).toLocaleDateString(locale,{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"});}
const errorCodes=new Set(["network","configure","connect","auth","rateLimit","upstream","busy","invalid","size","pagination","storage","currency","state","consent","accountChanged"]);
export function ConnectionPanel({provider}:{provider:Provider}){
  useThemeId();
  const ctx=useIntegrations();const{t,locale}=useI18n();const mode=ctx.selection[provider];const data=ctx.copies[provider][mode];const status=ctx.status?.[provider];
  const[working,setWorking]=useState(false);const[error,setError]=useState("");const[message,setMessage]=useState("");const[pending,setPending]=useState<Snapshot|null>(null);const[confirm,setConfirm]=useState<"clear"|"disconnect"|null>(null);const[authUrl,setAuthUrl]=useState("");
  const disabled=working||!!ctx.busy||!ctx.ready;
  async function run(task:()=>Promise<void>){if(disabled)return;setWorking(true);setError("");setMessage("");try{await task();}catch(err){const code=err instanceof ConnectionError?err.code:err instanceof Error&&errorCodes.has(err.message)?err.message:"storage";setError(t(`integrations.errors.${code}`));}finally{setWorking(false);}}
  async function accept(snapshot:Snapshot){await ctx.save(snapshot);await ctx.select(provider,snapshot.mode);setMessage(t("integrations.saved"));}
  async function sync(example=false){await run(async()=>{const snapshot=await ctx.run(provider,example?"example":"sync");const previous=ctx.copies[provider][snapshot.mode];if(previous&&previous.owner!==snapshot.owner)setPending(snapshot);else await accept(snapshot);});}
  const controls=<>
    <View style={styles.row}>{(["live","demo"] as const).map(value=><Button key={value} title={t(`integrations.${value}`)} primary={mode===value} disabled={disabled} onPress={()=>void ctx.select(provider,value)}/>)}</View>
    <View style={styles.card}>
      <View style={styles.spread}><Text style={type.body}>{mode==="demo"?t("integrations.demo"):t("integrations.service")}</Text><Text style={type.meta}>{ctx.online?t("integrations.online"):t("integrations.offline")}</Text></View>
      {data?<Text style={type.meta}>{t("integrations.lastSync",{date:new Date(data.syncedAt).toLocaleString(locale)})}</Text>:<Text style={type.meta}>{t("integrations.empty")}</Text>}
      {data?<Text style={type.meta}>{t("integrations.localHint")}</Text>:null}
      {mode==="live"&&provider==="whoop"?<Text style={type.meta}>{t(status?.connected?"integrations.connected":"integrations.notConnected")}</Text>:null}
      <View style={styles.row}>{mode==="live"?<Button title={working||ctx.busy===provider?t("integrations.syncing"):t("integrations.sync")} primary disabled={disabled||!ctx.online||status?.busy} onPress={()=>void sync()}/>:<Button title={t("integrations.example")} disabled={disabled||!ctx.online} onPress={()=>void sync(true)}/>}
        {provider==="whoop"&&mode==="live"?<Button title={t(status?.connected?"integrations.disconnect":"integrations.connect")} disabled={disabled||!ctx.online||!status?.configured} onPress={()=>status?.connected?setConfirm("disconnect"):void run(async()=>{const result=await bridgeRequest("/whoop/connect",true) as {url:string};if(!result.url.startsWith("https://api.prod.whoop.com/oauth/oauth2/auth?"))throw new Error("invalid");setAuthUrl(result.url);})}/>:null}
        <Button title={t("integrations.retry")} disabled={disabled} onPress={()=>void run(()=>ctx.refresh())}/>
      </View>
      {authUrl?<Button primary title={t("integrations.authorize")} onPress={()=>{if(Platform.OS==="web")window.location.assign(authUrl);else void Linking.openURL(authUrl);}}/>:null}
      {mode==="live"&&ctx.online&&status&&!status.configured?<Text style={type.meta}>{t("integrations.missing",{fields:status.missing.join(", ")})}</Text>:null}
      {mode==="live"&&status?.automaticMinutes?<Text style={type.meta}>{t("integrations.automatic",{minutes:status.automaticMinutes})}</Text>:null}
      {mode==="live"&&status?.error?<Text accessibilityRole="alert" style={styles.error}>{t(`integrations.errors.${errorCodes.has(status.error)?status.error:"upstream"}`)}</Text>:null}
      <InlineHelp label={t("integrations.setup")}><Text style={type.meta}>{t("integrations.setupBody")}</Text></InlineHelp>
    </View>
  </>;
  return <View style={styles.section}>
    {data?<View style={styles.section}><View style={styles.spread}><Text style={type.meta}>{t(mode==="demo"?"integrations.demo":"integrations.cached")}</Text><Text style={type.meta}>{ctx.online?t("integrations.online"):t("integrations.offline")}</Text></View><Text style={type.meta}>{t("integrations.lastSync",{date:new Date(data.syncedAt).toLocaleString(locale)})}</Text><InlineHelp label={t("integrations.title")}>{controls}</InlineHelp></View>:controls}
    {error||ctx.error?<Text accessibilityRole="alert" style={styles.error}>{error||t(`integrations.errors.${ctx.error}`)}</Text>:null}
    {message?<Text accessibilityLiveRegion="polite" style={type.meta}>{message}</Text>:null}
    <InlineHelp label={t("integrations.copies")}><View style={styles.section}><Text style={type.meta}>{t("integrations.copiesHint")}</Text><View style={styles.row}>
      <Button title={t("integrations.export")} disabled={disabled||!data} onPress={()=>void run(async()=>{if(data)await saveIntegrationCopy(JSON.stringify(data,null,2),`nlc-${provider}-${mode}-${new Date(data.syncedAt).toISOString().slice(0,10)}.json`);})}/>
      <Button title={t("integrations.import")} disabled={disabled} onPress={()=>void run(async()=>{const text=await pickIntegrationCopy();if(text!==null)setPending(parseSnapshot(text,provider));})}/>
      <Button title={t("integrations.clear")} danger disabled={disabled||!data} onPress={()=>setConfirm("clear")}/>
    </View></View></InlineHelp>
    <ConfirmDialog open={!!pending} title={t("integrations.replaceTitle")} message={t("integrations.replaceBody",{provider:provider==="whoop"?"WHOOP":"Mercury"})} confirmLabel={t("integrations.replace")} onCancel={()=>setPending(null)} onConfirm={()=>{const value=pending;setPending(null);if(value)void run(()=>accept(value));}}/>
    <ConfirmDialog open={!!confirm} title={t(confirm==="disconnect"?"integrations.disconnectTitle":"integrations.clearTitle")} message={t(confirm==="disconnect"?"integrations.disconnectBody":"integrations.clearBody")} confirmLabel={t(confirm==="disconnect"?"integrations.disconnect":"integrations.clear")} onCancel={()=>setConfirm(null)} onConfirm={()=>{const action=confirm;setConfirm(null);void run(async()=>{if(action==="disconnect"){await bridgeRequest("/whoop/disconnect",true);setAuthUrl("");await ctx.refresh();setMessage(t("integrations.disconnected"));}else await ctx.clear(provider,mode);});}}/>
  </View>;
}
