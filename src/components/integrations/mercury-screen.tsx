import { useThemeId } from "@/lib/appearance/use-theme-id";
import { useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/themed-text";
import { Screen } from "@/components/ui/screen";
import { InlineHelp } from "@/components/ui/inline-help";
import { Button, Field } from "@/components/health/training/ui";
import { useI18n } from "@/lib/i18n/context";
import { useIntegrations } from "@/lib/integrations/integrations-context";
import { mercuryBalances } from "@/lib/integrations/model";
import { type } from "@/lib/theme";
import { ConnectionPanel, PageHeader, Metric, Stat, Stats, dateLabel, styles } from "./shared";
export function MercuryScreen(){
  useThemeId();
  const ctx=useIntegrations();const{t,locale}=useI18n();const snapshot=ctx.copies.mercury[ctx.selection.mercury];const data=snapshot?.provider==="mercury"?snapshot:null;
  const[account,setAccount]=useState("");const[month,setMonth]=useState("");const[search,setSearch]=useState("");const[limit,setLimit]=useState(50);
  const money=(value:number|null)=>value===null?"—":new Intl.NumberFormat(locale,{style:"currency",currency:"USD"}).format(value);
  const balances=data?mercuryBalances(data):null;const validMonth=!month||/^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const transactions=data?.transactions.filter(row=>(!account||row.accountId===account)&&(!month||row.date.startsWith(month))&&`${row.title} ${row.category}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))??[];
  const statuses=new Set(["pending","sent","cancelled","failed","reversed","blocked","charged","processing","error"]);const status=(value:string)=>statuses.has(value)?t(`integrations.states.${value}`):value;
  return <Screen><PageHeader title="Mercury"/><ConnectionPanel provider="mercury"/>
    {!ctx.ready?<Text style={type.meta}>{t("common.loading")}</Text>:null}
    {data&&balances?<>
      <Text style={type.sectionTitle}>{t("integrations.total")} · USD</Text>
      <Stats><Stat label={t("integrations.total")} value={money(balances.total)}/><Stat label={t("integrations.assets")} value={money(balances.assets)}/><Stat label={t("integrations.credit")} value={money(balances.credit)}/></Stats>
      <InlineHelp label={t("integrations.details")}><Text style={type.meta}>{t("integrations.mercuryHelp")}</Text></InlineHelp>
      <Text style={type.sectionTitle}>{t("integrations.accounts")}</Text>
      {data.accounts.map(row=><View style={styles.card} key={row.id}><View style={styles.spread}><Text style={[type.sectionTitle,{flex:1}]}>{row.name}{row.last4?` · •${row.last4}`:""}</Text><Text style={type.meta}>{t(`integrations.${row.kind==="credit"?"creditKind":row.kind}`)}</Text></View><Metric label={t("integrations.balance")} value={money(row.balance)}/><Metric label={t("integrations.available")} value={money(row.available)}/>{["deleted","archived","closed"].includes(row.status)?<Text style={type.meta}>{row.status}</Text>:null}</View>)}
      <Text style={type.sectionTitle}>{t("integrations.transactions")}</Text>
      <View style={styles.row}><Button title={t("integrations.all")} primary={!account} onPress={()=>{setAccount("");setLimit(50);}}/>{data.accounts.map(row=><Button key={row.id} title={row.name} primary={account===row.id} onPress={()=>{setAccount(row.id);setLimit(50);}}/>)}</View>
      <Field label={t("integrations.period")} placeholder="AAAA-MM" value={month} onChangeText={value=>{setMonth(value);setLimit(50);}}/>{!validMonth?<Text accessibilityRole="alert" style={styles.error}>{t("integrations.errors.date")}</Text>:null}
      <Field label={t("integrations.search")} value={search} onChangeText={value=>{setSearch(value);setLimit(50);}}/>
      {transactions.slice(0,limit).map(row=><View key={row.id} style={styles.card}><View style={styles.spread}><Text style={[type.body,{flex:1}]}>{row.title}</Text><Text style={type.sectionTitle}>{money(row.amount)}</Text></View><Text style={type.meta}>{dateLabel(row.date,locale)} · {status(row.status)}</Text><Text style={type.meta}>{data.accounts.find(item=>item.id===row.accountId)?.name}{row.category?` · ${row.category}`:""}</Text></View>)}
      {!transactions.length?<Text style={type.meta}>{t("integrations.noTransactions")}</Text>:<Text style={type.meta}>{t("integrations.shown",{shown:Math.min(limit,transactions.length),total:transactions.length})}</Text>}
      {limit<transactions.length?<Button title={t("integrations.more")} onPress={()=>setLimit(previous=>previous+50)}/>:null}
      {data.returns.length?<View style={styles.section}><Text style={type.sectionTitle}>{t("integrations.returns")}</Text>{data.returns.filter(row=>!account||row.accountId===account).slice(0,24).map(row=><View style={styles.card} key={row.id}><View style={styles.spread}><Text style={type.body}>{row.month}</Text><Text style={type.sectionTitle}>{money(row.netAmount)}</Text></View><Metric label={t("integrations.fee")} value={money(row.fee)}/><Text style={type.meta}>{status(row.status)}</Text></View>)}</View>:null}
    </>:null}
  </Screen>;
}
