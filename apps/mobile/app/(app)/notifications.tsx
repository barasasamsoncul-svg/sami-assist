import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { dispatchGet, dispatchPost } from "@/api";
import { colors, common } from "@/theme";

type Notice={id:string;kind:string;title:string;body:string;href?:string|null;entity_type?:string|null;entity_id?:string|null;read_at?:string|null;created_at:string};
type Result={notifications:Notice[];unread:number};
const readable=(v:string)=>(v||"").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());

export default function NotificationsScreen(){
  const [items,setItems]=useState<Notice[]>([]);
  const [unread,setUnread]=useState(0);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState("");
  const [working,setWorking]=useState("");
  const load=useCallback(async()=>{
    setError("");
    try{const r=await dispatchGet<Result>("notifications");setItems(r.notifications||[]);setUnread(Number(r.unread||0));}
    catch(e){setError(e instanceof Error?e.message:"Notifications could not be loaded.");}
    finally{setBusy(false);}
  },[]);
  useEffect(()=>{load();},[load]);
  async function openNotice(item:Notice){
    setWorking(item.id);
    try{
      if(!item.read_at){await dispatchPost("markNotificationRead",{id:item.id});}
      setItems(prev=>prev.map(n=>n.id===item.id?{...n,read_at:n.read_at||new Date().toISOString()}:n));
      setUnread(prev=>Math.max(0,prev-(item.read_at?0:1)));
      if(item.entity_type==="errand"&&item.entity_id)router.push({pathname:"/(app)/errand/[id]",params:{id:item.entity_id}});
      else if(item.kind==="message"&&item.entity_id)router.push({pathname:"/(app)/errand/[id]",params:{id:item.entity_id}});
      else if(item.href&&item.href.startsWith("/(app)"))router.push(item.href as any);
    }catch(e){setError(e instanceof Error?e.message:"Notification could not be opened.");}
    finally{setWorking("");}
  }
  async function markAll(){
    setWorking("all");setError("");
    try{await dispatchPost("markNotificationRead",{});const now=new Date().toISOString();setItems(prev=>prev.map(n=>({...n,read_at:n.read_at||now})));setUnread(0);}
    catch(e){setError(e instanceof Error?e.message:"Notifications could not be updated.");}
    finally{setWorking("");}
  }
  return <SafeAreaView style={common.screen}>
    <ScrollView contentContainerStyle={common.content} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={colors.blue}/>}>
      <View style={{flexDirection:"row",alignItems:"center",gap:12}}>
        <Pressable onPress={()=>router.back()} style={{width:42,height:42,borderRadius:14,backgroundColor:colors.white,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:colors.border}}><Text style={{color:colors.navy,fontSize:23}}>‹</Text></Pressable>
        <View style={{flex:1,gap:4}}><Text style={common.eyebrow}>Your account</Text><Text style={common.title}>Notifications</Text></View>
        {unread>0?<View style={common.pill}><Text style={{color:colors.blue,fontSize:12,fontWeight:"900"}}>{unread} new</Text></View>:null}
      </View>
      {unread>0?<Pressable onPress={markAll} disabled={Boolean(working)} style={[common.secondaryButton,{alignSelf:"flex-start",paddingHorizontal:15}]}><Text style={common.secondaryButtonText}>{working==="all"?"Updating…":"Mark all as read"}</Text></Pressable>:null}
      {error?<Text accessibilityRole="alert" style={common.error}>{error}</Text>:null}
      {busy&&items.length===0?<ActivityIndicator color={colors.blue}/>:null}
      {!busy&&items.length===0&&!error?<View style={[common.card,{alignItems:"center",paddingVertical:28}]}><Text style={{color:colors.navy,fontSize:18,fontWeight:"800"}}>You’re all caught up</Text><Text style={[common.subtitle,{textAlign:"center"}]}>New assignments, messages and errand updates will appear here.</Text></View>:null}
      {items.map(item=><Pressable key={item.id} onPress={()=>openNotice(item)} style={[common.card,{borderColor:item.read_at?colors.border:colors.blue,backgroundColor:item.read_at?colors.white:"#F1F5FF"}]}>
        <View style={{flexDirection:"row",alignItems:"flex-start",gap:10}}>
          <View style={{width:40,height:40,borderRadius:13,backgroundColor:item.read_at?colors.paper:colors.blueSoft,alignItems:"center",justifyContent:"center"}}><Text style={{color:colors.blue,fontSize:18,fontWeight:"900"}}>{item.kind==="message"?"✉":item.kind==="assignment"?"↗":"•"}</Text></View>
          <View style={{flex:1,gap:5}}>
            <Text style={{color:colors.navy,fontSize:15,fontWeight:item.read_at?"700":"900"}}>{item.title}</Text>
            <Text style={{color:colors.ink,fontSize:13,lineHeight:19}}>{item.body}</Text>
            <Text style={{color:colors.muted,fontSize:11}}>{new Date(item.created_at).toLocaleString()} · {readable(item.kind)}</Text>
          </View>
          {!item.read_at?<View style={{width:8,height:8,borderRadius:4,backgroundColor:colors.blue,marginTop:6}}/>:null}
        </View>
        {working===item.id?<ActivityIndicator color={colors.blue}/>:null}
      </Pressable>)}
    </ScrollView>
  </SafeAreaView>;
}
