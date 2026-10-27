import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { dispatchGet } from "@/api";
import { colors, common } from "@/theme";

type Payment = {
  id: string; record_type: string; amount: number | string; currency?: string;
  method: string; reference?: string | null; status: string; notes?: string | null;
  created_at: string; public_code?: string; title?: string; errand_status?: string;
  customer_name?: string; provider_name?: string;
};
const readable=(v:string)=>(v||"").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());

export default function PaymentsScreen() {
  const [items,setItems]=useState<Payment[]>([]);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState("");
  const load=useCallback(async()=>{
    setError("");
    try { const r=await dispatchGet<{payments:Payment[]}>("payments"); setItems(r.payments||[]); }
    catch(e){setError(e instanceof Error?e.message:"Payment history could not be loaded.");}
    finally{setBusy(false);}
  },[]);
  useEffect(()=>{load();},[load]);
  const total=items.filter(p=>["recorded","reconciled"].includes(p.status)&&p.record_type==="service_payment").reduce((n,p)=>n+Number(p.amount||0),0);
  return <SafeAreaView style={common.screen}>
    <ScrollView contentContainerStyle={common.content} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={colors.blue}/>}>
      <View style={{flexDirection:"row",alignItems:"center",gap:12}}>
        <Pressable onPress={()=>router.back()} style={{width:42,height:42,borderRadius:14,backgroundColor:colors.white,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:colors.border}}><Text style={{color:colors.navy,fontSize:23}}>‹</Text></Pressable>
        <View style={{flex:1,gap:4}}><Text style={common.eyebrow}>SaMi account</Text><Text style={common.title}>Payments</Text></View>
      </View>
      <View style={{backgroundColor:colors.navy,borderRadius:22,padding:20,gap:6}}>
        <Text style={{color:"#BFD0FF",fontSize:12,fontWeight:"800",letterSpacing:1}}>RECORDED SERVICE PAYMENTS</Text>
        <Text style={{color:colors.white,fontSize:29,fontWeight:"900"}}>KES {total.toLocaleString("en-KE",{maximumFractionDigits:2})}</Text>
        <Text style={{color:"#D8E0F4",fontSize:12,lineHeight:18}}>This total is based on recorded/reconciled service-payment entries only. It is not a live bank or M-PESA balance.</Text>
      </View>
      {error?<Text accessibilityRole="alert" style={common.error}>{error}</Text>:null}
      {busy&&items.length===0?<ActivityIndicator color={colors.blue}/>:null}
      {!busy&&items.length===0&&!error?<View style={[common.card,{alignItems:"center",paddingVertical:26,gap:8}]}><Text style={{color:colors.navy,fontWeight:"800",fontSize:18}}>No payment records yet</Text><Text style={[common.subtitle,{textAlign:"center"}]}>Payments, seller entries, provider payouts and refunds appear here when recorded by SaMi.</Text></View>:null}
      {items.map(p=><View key={p.id} style={common.card}>
        <View style={{flexDirection:"row",alignItems:"flex-start",gap:10}}>
          <View style={{flex:1,gap:4}}>
            <Text style={{color:colors.muted,fontSize:11,fontWeight:"800"}}>{p.public_code||"SaMi payment"} · {readable(p.record_type)}</Text>
            <Text style={{color:colors.navy,fontSize:16,fontWeight:"800"}}>{p.title||"Errand payment"}</Text>
            <Text style={{color:colors.muted,fontSize:12}}>{new Date(p.created_at).toLocaleString()} · {readable(p.method)}</Text>
          </View>
          <View style={{alignItems:"flex-end",gap:5}}>
            <Text style={{color:colors.navy,fontWeight:"900",fontSize:17}}>{p.currency||"KES"} {Number(p.amount||0).toLocaleString("en-KE",{maximumFractionDigits:2})}</Text>
            <View style={common.pill}><Text style={{color:p.status==="reconciled"?colors.green:colors.blue,fontWeight:"800",fontSize:10}}>{readable(p.status)}</Text></View>
          </View>
        </View>
        {p.reference?<Text style={{color:colors.muted,fontSize:12}}>Reference: {p.reference}</Text>:null}
        {p.notes?<Text style={{color:colors.ink,fontSize:13,lineHeight:19}}>{p.notes}</Text>:null}
        {p.errand_status?<Text style={{color:colors.muted,fontSize:12}}>Errand status: {readable(p.errand_status)}</Text>:null}
      </View>)}
    </ScrollView>
  </SafeAreaView>;
}
