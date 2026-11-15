import { useState } from "react";
import { Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, common } from "@/theme";

type ServiceKey = "shopping" | "groceries" | "food" | "bills" | "laundry" | "home" | "pharmacy" | "petcare" | "gifts" | "clothing" | "pickup" | "documents" | "queues" | "personal" | "business" | "other";
type FieldSpec = { key: string; label: string; placeholder: string; multiline?: boolean };
const services: Record<ServiceKey, { category: string; title: string; subtitle: string; icon: string; fields: FieldSpec[]; hint: string }> = {
  groceries: { category: "groceries", title: "Groceries & essentials", subtitle: "Choose your items, preferred shop and delivery instructions.", icon: "basket-outline", hint: "The shopping budget is separate from SaMi's service fee. You pay the seller separately for the items.", fields: [{key:"items",label:"Grocery list",placeholder:"e.g. milk, bread, rice, vegetables",multiline:true},{key:"shop",label:"Preferred supermarket or market",placeholder:"e.g. local market or supermarket"},{key:"budget",label:"Estimated item budget (KES)",placeholder:"e.g. 1800"}] },
  food: { category: "food_delivery", title: "Food & delivery", subtitle: "Tell us the restaurant, food order and delivery needs.", icon: "fast-food-outline", hint: "Restaurant charges are separate from SaMi's delivery service fee. Include allergy or handling notes where relevant.", fields: [{key:"order",label:"Food order",placeholder:"List dishes, quantities and options",multiline:true},{key:"restaurant",label:"Restaurant or food seller",placeholder:"Restaurant name and branch"},{key:"notes",label:"Delivery or dietary notes",placeholder:"Optional notes"}] },
  bills: { category: "bill_payments", title: "Bills & payments assistance", subtitle: "Get help with legitimate bill-payment errands and receipts.", icon: "receipt-outline", hint: "Never give a runner your PIN, password or one-time code. Payments must be made through authorised channels.", fields: [{key:"bill",label:"Bill or service",placeholder:"e.g. utility bill, invoice collection"},{key:"provider",label:"Provider or office",placeholder:"Company or service provider"},{key:"reference",label:"Account or bill reference",placeholder:"Use only a safe reference; never enter a PIN"}] },
  laundry: { category: "laundry_cleaning", title: "Laundry & dry cleaning", subtitle: "Arrange collection and return of laundry or dry-cleaning items.", icon: "shirt-outline", hint: "List delicate items, special handling and any service charges expected from the laundry shop.", fields: [{key:"items",label:"Items and service needed",placeholder:"e.g. 5 shirts, dry-cleaning for a suit",multiline:true},{key:"provider",label:"Laundry shop",placeholder:"Preferred shop or area"},{key:"instructions",label:"Care and return instructions",placeholder:"e.g. delicate fabric, return by Friday"}] },
  home: { category: "home_services", title: "Home services", subtitle: "Describe the household task, supplies and access arrangements.", icon: "home-outline", hint: "For repairs or specialist work, SaMi may need to verify the appropriate provider before confirming.", fields: [{key:"task",label:"Household task",placeholder:"e.g. collect water, arrange cleaning supplies",multiline:true},{key:"location",label:"Area and access instructions",placeholder:"Estate or building; avoid sharing door codes here"},{key:"supplies",label:"Supplies or preferences",placeholder:"Optional details"}] },
  pharmacy: { category: "pharmacy_health", title: "Pharmacy & health errands", subtitle: "Share the pharmacy collection or permitted health-related errand.", icon: "medkit-outline", hint: "Prescription items remain subject to pharmacy and legal requirements. Do not share medical account passwords or PINs.", fields: [{key:"task",label:"Collection or errand details",placeholder:"Describe the permitted task",multiline:true},{key:"pharmacy",label:"Pharmacy or provider",placeholder:"Name and branch"},{key:"notes",label:"Collection requirements",placeholder:"Only share necessary information"}] },
  petcare: { category: "pet_care", title: "Pet care errands", subtitle: "Arrange pet supplies or other suitable pet-related errands.", icon: "paw-outline", hint: "For live-animal transport or care, the task may require special approval and a suitable provider.", fields: [{key:"task",label:"Pet errand",placeholder:"e.g. collect pet food or supplies",multiline:true},{key:"shop",label:"Pet shop or service",placeholder:"Shop, clinic or service name"},{key:"petNotes",label:"Pet or item notes",placeholder:"Brand, size or handling details"}] },
  gifts: { category: "shopping_gifts", title: "Shopping & gifts", subtitle: "Find, collect or deliver a gift with your preferred details.", icon: "gift-outline", hint: "Item purchases are paid to the seller separately from SaMi's service fee.", fields: [{key:"gift",label:"Gift or item details",placeholder:"Describe the gift, size, colour or budget",multiline:true},{key:"shop",label:"Preferred shop or seller",placeholder:"Store or seller name"},{key:"delivery",label:"Gift delivery notes",placeholder:"Optional presentation or timing notes"}] },

  shopping: { category: "shopping", title: "Shopping & essentials", subtitle: "Tell your runner what to buy and where to shop.", icon: "cart-outline", hint: "Keep a little extra in mind for item-price differences. You pay the seller separately for purchases.", fields: [{key:"items",label:"Shopping list",placeholder:"e.g. maize flour, milk, vegetables",multiline:true},{key:"shop",label:"Preferred shop or market",placeholder:"e.g. Naivas, local market"},{key:"budget",label:"Estimated shopping budget (KES)",placeholder:"e.g. 2500"}] },
  clothing: { category: "clothing_retail", title: "Clothing & returns", subtitle: "Specify the item, size and whether this is a purchase or return.", icon: "shirt-outline", hint: "SaMi service fees are separate from the clothing seller's price.", fields: [{key:"task",label:"Purchase or return details",placeholder:"Describe the clothing item and task",multiline:true},{key:"size",label:"Size, colour or fit",placeholder:"e.g. Medium, navy blue"},{key:"shop",label:"Store or seller",placeholder:"Store name or location"}] },
  pickup: { category: "pickup_delivery", title: "Pick-up & drop-off", subtitle: "Describe the parcel and any handling instructions.", icon: "cube-outline", hint: "Avoid sending prohibited or unsafe items. Tell your runner if an item is fragile.", fields: [{key:"item",label:"What needs collecting or delivering?",placeholder:"e.g. sealed document envelope",multiline:true},{key:"reference",label:"Pickup name or reference",placeholder:"Name, order number or contact"},{key:"handling",label:"Handling instructions",placeholder:"e.g. fragile, call on arrival"}] },
  documents: { category: "documents_admin", title: "Documents & admin", subtitle: "Explain the paperwork or administrative task.", icon: "document-text-outline", hint: "Never share passwords, PINs or one-time security codes with a runner.", fields: [{key:"task",label:"What needs to be done?",placeholder:"e.g. submit a form and collect a stamped copy",multiline:true},{key:"office",label:"Office or organisation",placeholder:"Office name and branch"},{key:"deadline",label:"Deadline or opening-hour notes",placeholder:"e.g. before 3 PM"}] },
  queues: { category: "queue_appointments", title: "Queues & appointments", subtitle: "Share the venue, expected timing and appointment requirements.", icon: "time-outline", hint: "The runner may need an appointment reference or written authorisation. Do not share account PINs.", fields: [{key:"task",label:"Queue or appointment task",placeholder:"What should the runner queue for or attend?",multiline:true},{key:"venue",label:"Venue and department",placeholder:"Hospital, office, branch, etc."},{key:"reference",label:"Booking or reference details",placeholder:"Optional reference (no passwords or PINs)"}] },
  personal: { category: "personal_errand", title: "Personal assistance", subtitle: "Describe the everyday task and what a successful result looks like.", icon: "sparkles-outline", hint: "SaMi supports legitimate everyday tasks. Restricted, unsafe or unlawful tasks cannot be accepted.", fields: [{key:"task",label:"What do you need help with?",placeholder:"Describe the task clearly",multiline:true},{key:"preferences",label:"Preferences or instructions",placeholder:"Timing, access or other details"},{key:"budget",label:"Optional item budget (KES)",placeholder:"If the runner needs to buy something"}] },
  business: { category: "business_support", title: "Business errands", subtitle: "Keep your business moving with clear task and contact details.", icon: "briefcase-outline", hint: "For business purchases, the seller's item cost remains separate from SaMi's service fee.", fields: [{key:"task",label:"Business task",placeholder:"Describe the collection, delivery or office run",multiline:true},{key:"company",label:"Business or contact person",placeholder:"Company and contact name"},{key:"reference",label:"Order or job reference",placeholder:"Optional reference number"}] },
  other: { category: "other", title: "Custom errand", subtitle: "Tell us what you need. We will use your details to prepare the request.", icon: "add-circle-outline", hint: "Describe the task clearly. SaMi may review unusual requests before assigning a runner.", fields: [{key:"task",label:"Describe your errand",placeholder:"What should be done, where and what counts as complete?",multiline:true},{key:"instructions",label:"Extra instructions",placeholder:"Anything the runner should know",multiline:true}] },
};

export default function CategoryIntakeScreen({ service }: { service: ServiceKey }) {
  const config = services[service];
  const [values, setValues] = useState<Record<string,string>>({});
  const [error, setError] = useState("");
  function continueToDetails() {
    const main = values[config.fields[0].key]?.trim() || "";
    if (main.length < 5) { setError("Please add a few details so your runner knows what is needed."); return; }
    const description = config.fields.map((field) => values[field.key]?.trim() ? field.label + ": " + values[field.key].trim() : "").filter(Boolean).join("\n");
    const title = (config.title + " — " + main.replace(/\s+/g," ")).slice(0,100);
    router.push({ pathname: "/(app)/request", params: { category: config.category, title, description } });
  }
  return <SafeAreaView style={common.screen}>
    <ScrollView contentContainerStyle={[common.content,{paddingTop:12}]} keyboardShouldPersistTaps="handled">
      <View style={{flexDirection:"row",alignItems:"center",gap:12}}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={()=>router.back()} style={{width:42,height:42,borderRadius:14,backgroundColor:colors.white,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:colors.border}}><Ionicons name="arrow-back" size={20} color={colors.navy}/></Pressable>
        <View style={{flex:1,gap:3}}><Text style={common.eyebrow}>SaMi · YOUR EVERYDAY HELP ORGANISED</Text><Text style={common.title}>{config.title}</Text></View>
      </View>
      <View style={{backgroundColor:colors.navy,borderRadius:23,padding:20,gap:10}}>
        <View style={{width:48,height:48,borderRadius:16,backgroundColor:colors.white,alignItems:"center",justifyContent:"center"}}><Ionicons name={config.icon as never} size={25} color={colors.blue}/></View>
        <Text style={{color:colors.white,fontSize:21,lineHeight:28,fontWeight:"900"}}>{config.title}, made easier.</Text>
        <Text style={{color:"#DCE8FA",fontSize:13,lineHeight:20}}>{config.subtitle}</Text>
      </View>
      <View style={common.card}>
        <Text style={{color:colors.navy,fontSize:18,fontWeight:"900"}}>Tell us the details</Text>
        {config.fields.map((field)=> <View key={field.key} style={{gap:7}}>
          <Text style={common.label}>{field.label}</Text>
          <TextInput value={values[field.key]||""} onChangeText={(value)=>setValues(current=>({...current,[field.key]:value}))} placeholder={field.placeholder} placeholderTextColor={colors.muted} multiline={field.multiline} textAlignVertical={field.multiline?"top":"center"} style={[common.input,field.multiline&&{minHeight:112,paddingTop:14}]}/>
        </View>)}
      </View>
      <View style={{backgroundColor:colors.blueSoft,borderRadius:16,padding:15,flexDirection:"row",gap:10,alignItems:"flex-start"}}>
        <Ionicons name="information-circle-outline" size={21} color={colors.blue}/>
        <Text style={{flex:1,color:colors.navy,fontSize:12,lineHeight:18}}>{config.hint}</Text>
      </View>
      {error ? <Text accessibilityRole="alert" style={common.error}>{error}</Text> : null}
      <Pressable accessibilityRole="button" onPress={continueToDetails} style={common.primaryButton}><Text style={common.primaryButtonText}>Continue to locations & service fee</Text></Pressable>
      <Text style={{color:colors.muted,fontSize:11,lineHeight:16,textAlign:"center"}}>Next, set the route and review your estimated SaMi service fee before posting.</Text>
    </ScrollView>
  </SafeAreaView>;
}
