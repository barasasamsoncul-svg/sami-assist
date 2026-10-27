import { useEffect, useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { colors } from "@/theme";

export type MapPoint = { lat: number; lng: number };
type Props = {
  selecting: "pickup" | "destination";
  pickup: MapPoint | null;
  destination: MapPoint | null;
  route: MapPoint[];
  onPoint: (slot: "pickup" | "destination", point: MapPoint) => void;
};

const MAP_HTML = "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no'><link rel='stylesheet' href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'><style>html,body,#map{height:100%;width:100%;margin:0;background:#eef2f8}.leaflet-container{font-family:Arial,sans-serif}.leaflet-control-attribution{font-size:9px}</style></head><body><div id='map'></div><script src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'></script><script>var map=L.map('map',{zoomControl:false}).setView([-1.286389,36.817223],12);L.control.zoom({position:'bottomright'}).addTo(map);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);var pickupMarker=null,destinationMarker=null,routeLine=null;window.samiSlot='pickup';window.setPoint=function(slot,point){if(window[slot+'Marker'])map.removeLayer(window[slot+'Marker']);if(!point)return;var label=slot==='pickup'?'Pickup':'Drop-off';var color=slot==='pickup'?'#3568F5':'#E9A23B';window[slot+'Marker']=L.circleMarker([point.lat,point.lng],{radius:8,color:'#fff',weight:3,fillColor:color,fillOpacity:1}).addTo(map).bindPopup(label);};window.setRoute=function(coords){if(routeLine){map.removeLayer(routeLine);routeLine=null;}if(coords&&coords.length>1){routeLine=L.polyline(coords,{color:'#3568F5',weight:5,opacity:.85}).addTo(map);map.fitBounds(routeLine.getBounds().pad(.18));}};map.on('click',function(e){window.ReactNativeWebView.postMessage(JSON.stringify({type:'point',slot:window.samiSlot||'pickup',lat:e.latlng.lat,lng:e.latlng.lng}));});window.setView=function(lat,lng){map.setView([lat,lng],15);};</script></body></html>";

export default function MapPicker({ selecting, pickup, destination, route, onPoint }: Props) {
  const web = useRef<WebView>(null);
  useEffect(() => {
    const script = "window.samiSlot=" + JSON.stringify(selecting) + ";" +
      "window.setPoint('pickup'," + JSON.stringify(pickup) + ");" +
      "window.setPoint('destination'," + JSON.stringify(destination) + ");" +
      "window.setRoute(" + JSON.stringify(route) + ");true;";
    web.current?.injectJavaScript(script);
  }, [selecting, pickup, destination, route]);

  function handleMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "point" && (data.slot === "pickup" || data.slot === "destination") &&
          Number.isFinite(data.lat) && Number.isFinite(data.lng)) {
        onPoint(data.slot, { lat: data.lat, lng: data.lng });
      }
    } catch {
      // Ignore malformed messages from the embedded map.
    }
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={web}
        source={{ html: MAP_HTML }}
        originWhitelist={["*"]}
        javaScriptEnabled
        onMessage={handleMessage}
        style={styles.map}
        setSupportMultipleWindows={false}
        allowFileAccess={false}
        allowsInlineMediaPlayback
      />
      <Text style={styles.caption}>Map data © OpenStreetMap contributors. Tap to place the selected point.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  map: { height: 290, backgroundColor: "#EEF2F8" },
  caption: { paddingHorizontal: 12, paddingVertical: 9, fontSize: 11, lineHeight: 16, color: colors.muted },
});
