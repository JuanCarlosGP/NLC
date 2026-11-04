import { space } from "@/lib/appearance/density";
import { useThemeId } from "@/lib/appearance/use-theme-id";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/themed-text";
import { useRouter } from "expo-router";
import { Screen } from "@/components/ui/screen";
import { InlineHelp } from "@/components/ui/inline-help";
import { Button, Field } from "@/components/health/training/ui";
import { useI18n } from "@/lib/i18n/context";
import { useIntegrations } from "@/lib/integrations/integrations-context";
import { activityMinutes, type WhoopActivity } from "@/lib/integrations/model";
import { colors, type } from "@/lib/theme";
import { ConnectionPanel, PageHeader, Metric, Stat, Stats, dateLabel, display, duration, styles } from "./shared";
export function WhoopActivityRow({activity}:{activity:WhoopActivity}){
  useThemeId();const{t,locale}=useI18n();return <View style={styles.card}>
  <View style={styles.spread}><Text style={[type.sectionTitle,{flex:1}]}>{activity.name}</Text><Text style={type.meta}>WHOOP</Text></View>
  <Text style={type.meta}>{dateLabel(activity.date,locale)} · {duration(activityMinutes(activity))}</Text>
  <View style={styles.row}><Text style={type.body}>{t("integrations.strain")} {display(activity.strain,"",1)}</Text><Text style={type.meta}>{display(activity.calories," kcal")}</Text></View>
  <InlineHelp label={t("integrations.details")}><View style={styles.section}>
    <Metric label={t("integrations.averageHeartRate")} value={display(activity.averageHeartRate," bpm")}/><Metric label={t("integrations.maxHeartRate")} value={display(activity.maxHeartRate," bpm")}/><Metric label={t("integrations.distance")} value={display(activity.distanceMeters===null?null:activity.distanceMeters/1000," km",2)}/>
    <Text style={type.meta}>{t("integrations.zones")}</Text>{activity.zoneMinutes.map((value,i)=><Metric key={i} label={`Z${i}`} value={display(value," min")}/>)}
  </View></InlineHelp>
</View>;}
export function WhoopCalendarActivities({date}:{date:string}){
  useThemeId();const ctx=useIntegrations();const{t}=useI18n();const router=useRouter();const data=ctx.copies.whoop[ctx.selection.whoop];if(data?.provider!=="whoop")return null;const rows=data.activities.filter(row=>row.date===date);return rows.length?<View style={styles.section}><View style={styles.spread}><Text style={type.sectionTitle}>{t("integrations.activities")}</Text>{data.mode==="demo"?<Text style={type.meta}>{t("integrations.demo")}</Text>:null}</View>{rows.map(row=><WhoopActivityRow key={row.id} activity={row}/>)}<Button title="WHOOP" onPress={()=>router.push("/health/whoop")}/></View>:null;}
export function WhoopScreen(){
  useThemeId();
  const ctx=useIntegrations();const{t,locale}=useI18n();const snapshot=ctx.copies.whoop[ctx.selection.whoop];const data=snapshot?.provider==="whoop"?snapshot:null;
  const [selected,setSelected]=useState("");const [draft,setDraft]=useState("");
  const sourceRef=useRef("");
  useEffect(()=>{const source=data?`${data.mode}:${data.owner}`:"";if(data&&source!==sourceRef.current){sourceRef.current=source;const initial=data.days[0]?.date||data.sleeps[0]?.date||data.activities[0]?.date||new Date().toISOString().slice(0,10);setSelected(initial);setDraft(initial);}},[data]);
  const valid=/^\d{4}-\d{2}-\d{2}$/.test(draft)&&Number.isFinite(Date.parse(`${draft}T12:00:00Z`))&&new Date(`${draft}T12:00:00Z`).toISOString().slice(0,10)===draft;
  const day=data?.days.find(row=>row.date===selected);const sleeps=data?.sleeps.filter(row=>row.date===selected)??[];const main=data?.sleeps.find(row=>row.id===day?.sleepId)??sleeps.find(row=>!row.nap);const activities=data?.activities.filter(row=>row.date===selected)??[];
  function select(date:string){setSelected(date);setDraft(date);}function move(delta:number){if(!selected)return;select(new Date(Date.parse(`${selected}T12:00:00Z`)+delta*86400000).toISOString().slice(0,10));}
  return <Screen><PageHeader title="WHOOP"/><ConnectionPanel provider="whoop"/>
    {!ctx.ready?<Text style={type.meta}>{t("common.loading")}</Text>:null}
    {data?<>
      {data.name?<Text style={type.meta}>{data.name}</Text>:null}
      <Field label={t("integrations.date")} value={draft} placeholder="AAAA-MM-DD" onChangeText={value=>{setDraft(value);if(/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(`${value}T12:00:00Z`))&&new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)===value)setSelected(value);}}/>
      {!valid&&draft?<Text accessibilityRole="alert" style={styles.error}>{t("integrations.errors.date")}</Text>:null}
      <View style={styles.spread}><Pressable accessibilityRole="button" accessibilityLabel={t("integrations.previous")} onPress={()=>move(-1)} style={[styles.card,{minHeight:44,minWidth:44,alignItems:"center",justifyContent:"center",padding:space(0)}]}><Text style={type.body}>‹</Text></Pressable><Text style={type.body}>{selected?dateLabel(selected,locale):"—"}</Text><Pressable accessibilityRole="button" accessibilityLabel={t("integrations.next")} onPress={()=>move(1)} style={[styles.card,{minHeight:44,minWidth:44,alignItems:"center",justifyContent:"center",padding:space(0)}]}><Text style={type.body}>›</Text></Pressable></View>
      {!day&&!sleeps.length&&!activities.length?<Text style={type.meta}>{t("integrations.noDay")}</Text>:null}
      <Stats><Stat label={t("integrations.recovery")} value={display(day?.recovery," %")}/><Stat label={t("integrations.strain")} value={display(day?.strain,"",1)}/><Stat label={t("integrations.sleep")} value={duration(main?.asleepMinutes)}/><Stat label={t("integrations.hrv")} value={display(day?.hrv," ms",1)}/></Stats>
      <InlineHelp label={t("integrations.details")}><View style={styles.section}><Metric label={t("integrations.resting")} value={display(day?.restingHeartRate," bpm")}/><Metric label={t("integrations.calories")} value={display(day?.calories," kcal")}/><Metric label={t("integrations.oxygen")} value={display(day?.spo2," %",1)}/><Metric label={t("integrations.temperature")} value={display(day?.temperature," °C",1)}/></View></InlineHelp>
      {sleeps.length?<View style={styles.section}><Text style={type.sectionTitle}>{t("integrations.sleep")}</Text>{sleeps.map(row=><View style={styles.card} key={row.id}><View style={styles.spread}><Text style={type.body}>{t(row.nap?"integrations.nap":"integrations.mainSleep")}</Text><Text style={type.sectionTitle}>{duration(row.asleepMinutes)}</Text></View><Metric label={t("integrations.performance")} value={display(row.performance," %")}/><InlineHelp label={t("integrations.details")}><View style={styles.section}><Metric label={t("integrations.efficiency")} value={display(row.efficiency," %",1)}/><Metric label={t("integrations.respiratory")} value={display(row.respiratoryRate," rpm",1)}/>{(["light","deep","rem","awake"] as const).map(key=><Metric key={key} label={t(`integrations.${key}`)} value={duration(row[`${key}Minutes`])}/>)}</View></InlineHelp></View>)}</View>:null}
      {activities.length?<View style={styles.section}><Text style={type.sectionTitle}>{t("integrations.activities")}</Text>{activities.map(row=><WhoopActivityRow activity={row} key={row.id}/>)}</View>:null}
      {data.days.length?<View style={styles.card}><Text style={type.sectionTitle}>{t("integrations.trend")}</Text>{data.days.slice(0,30).map(row=><Pressable accessibilityRole="button" accessibilityLabel={`${dateLabel(row.date,locale)} · ${t("integrations.recovery")} ${display(row.recovery," %")}`} accessibilityState={{selected:row.date===selected}} key={row.id} onPress={()=>select(row.date)} style={[styles.line,{minHeight:44}]}><View style={styles.spread}><Text style={type.meta}>{dateLabel(row.date,locale)}</Text><Text style={type.body}>{display(row.recovery," %")} · {display(row.strain,"",1)}</Text></View><View style={{height:3,backgroundColor:colors.rule}}>{row.recovery!==null?<View style={{height:3,width:`${Math.max(0,Math.min(100,row.recovery))}%`,backgroundColor:colors.accent}}/>:null}</View></Pressable>)}</View>:null}
      <InlineHelp label={t("integrations.body")}><View style={styles.section}><Metric label={t("integrations.weight")} value={display(data.body.weightKg," kg",1)}/><Metric label={t("integrations.height")} value={display(data.body.heightMeters===null?null:data.body.heightMeters*100," cm")}/><Metric label={t("integrations.maxHeartRate")} value={display(data.body.maxHeartRate," bpm")}/></View></InlineHelp>
      <InlineHelp label={t("integrations.details")}><Text style={type.meta}>{t("integrations.whoopHelp")}</Text></InlineHelp>
    </>:null}
  </Screen>;
}
