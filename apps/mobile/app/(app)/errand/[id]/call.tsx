import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  Text,
  View,
  PermissionsAndroid,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  mediaDevices,
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  type MediaStream,
  type RTCIceCandidateInit,
  type RTCIceServer,
} from "react-native-webrtc";
import { dispatchGet, dispatchPost } from "@/api";
import { colors } from "@/theme";

type VoiceCall = {
  id: string;
  errand_id: string;
  caller_id: string;
  callee_id: string;
  status: "ringing" | "active" | "rejected" | "ended" | "missed" | "failed";
  caller_name: string;
  callee_name: string;
  public_code: string;
  errand_title: string;
};
type Signal = {
  id: string | number;
  signal_type: "offer" | "answer" | "ice_candidate";
  payload: Record<string, unknown>;
  from_user_id: string;
};
type CallSync = {
  call: VoiceCall | null;
  signals: Signal[];
  nextAfter: number;
  iceServers: RTCIceServer[];
};
type UserResponse = { user: { id: string; full_name: string; role: "customer" | "provider" | "admin" } };
type ErrandResponse = { errand: { id: string; customer_id: string; provider_id: string | null; status: string; customer_name?: string; provider_name?: string; title: string; public_code: string } };

const terminalStatuses = new Set(["rejected", "ended", "missed", "failed"]);

function CallCircle({ icon, label, onPress, destructive = false, disabled = false }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={{ alignItems: "center", gap: 9, opacity: disabled ? 0.45 : 1 }}
    >
      <View style={{
        width: 62, height: 62, borderRadius: 31,
        alignItems: "center", justifyContent: "center",
        backgroundColor: destructive ? "#D93645" : "rgba(255,255,255,0.13)",
        borderWidth: destructive ? 0 : 1,
        borderColor: "rgba(255,255,255,0.20)",
      }}>
        <Ionicons name={icon} size={25} color={colors.white} />
      </View>
      <Text style={{ color: colors.white, fontSize: 11, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}

export default function ErrandVoiceCallScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; callId?: string | string[] }>();
  const errandId = Array.isArray(params.id) ? params.id[0] : params.id || "";
  const incomingId = Array.isArray(params.callId) ? params.callId[0] : params.callId || "";

  const [userId, setUserId] = useState("");
  const [call, setCall] = useState<VoiceCall | null>(null);
  const [counterpart, setCounterpart] = useState("SaMi contact");
  const [working, setWorking] = useState(true);
  const [muted, setMuted] = useState(false);
  const [peerState, setPeerState] = useState("new");
  const [error, setError] = useState("");
  const [remoteAudioReady, setRemoteAudioReady] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef("");
  const afterRef = useRef(0);
  const candidatesBeforeCallRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescriptionSetRef = useRef(false);
  const startedRef = useRef(false);
  const connectedAtRef = useRef<number | null>(null);
  const finishingRef = useRef(false);
  const mutedRef = useRef(false);

  useEffect(() => {
    mutedRef.current = muted;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
  }, [muted]);

  useEffect(() => {
    if (!connectedAtRef.current) return;
    const timer = setInterval(() => {
      if (connectedAtRef.current) setElapsed(Math.max(0, Math.floor((Date.now() - connectedAtRef.current) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [peerState]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let pollBusy = false;
    let localPeer: RTCPeerConnection | null = null;
    let localStream: MediaStream | null = null;

    async function flushRemoteCandidates(peer: RTCPeerConnection) {
      for (const candidate of remoteCandidatesRef.current.splice(0)) {
        try { await peer.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* A stale ICE candidate can be ignored. */ }
      }
    }

    async function handleSignal(signal: Signal, peer: RTCPeerConnection) {
      if (signal.signal_type === "offer" && !remoteDescriptionSetRef.current) {
        await peer.setRemoteDescription(new RTCSessionDescription(signal.payload as never));
        remoteDescriptionSetRef.current = true;
        await flushRemoteCandidates(peer);
        return;
      }
      if (signal.signal_type === "answer" && !remoteDescriptionSetRef.current) {
        await peer.setRemoteDescription(new RTCSessionDescription(signal.payload as never));
        remoteDescriptionSetRef.current = true;
        await flushRemoteCandidates(peer);
        return;
      }
      if (signal.signal_type === "ice_candidate") {
        const candidate = signal.payload as RTCIceCandidateInit;
        if (!remoteDescriptionSetRef.current) remoteCandidatesRef.current.push(candidate);
        else {
          try { await peer.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* Ignore late or duplicate candidates. */ }
        }
      }
    }

    async function pollCallState() {
      const activeCallId = callIdRef.current;
      if (!activeCallId || !localPeer || pollBusy || cancelled) return;
      pollBusy = true;
      try {
        const sync = await dispatchGet<CallSync>("callSync", {
          callId: activeCallId,
          after: String(afterRef.current),
        });
        if (cancelled) return;
        if (sync.call) {
          setCall(sync.call);
          const name = sync.call.caller_id === userId ? sync.call.callee_name : sync.call.caller_name;
          if (name) setCounterpart(name);
          if (terminalStatuses.has(sync.call.status)) {
            setPeerState(sync.call.status);
            return;
          }
        }
        for (const signal of sync.signals || []) {
          if (cancelled) return;
          await handleSignal(signal, localPeer);
          afterRef.current = Math.max(afterRef.current, Number(signal.id) || 0);
        }
        afterRef.current = Math.max(afterRef.current, Number(sync.nextAfter) || 0);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Call connection could not be refreshed.");
      } finally {
        pollBusy = false;
      }
    }

    async function start() {
      if (startedRef.current) return;
      startedRef.current = true;
      setWorking(true);
      setError("");
      try {
        const me = await dispatchGet<UserResponse>("me");
        if (cancelled) return;
        setUserId(me.user.id);

        let incomingSync: CallSync | null = null;
        let chosenCallId = incomingId;
        let iceServers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
        if (incomingId) {
          incomingSync = await dispatchGet<CallSync>("callSync", { callId: incomingId, after: "0" });
          if (!incomingSync.call) throw new Error("This errand call is no longer available.");
          if (incomingSync.call.status !== "ringing" || incomingSync.call.callee_id !== me.user.id) {
            throw new Error("This invitation has ended or belongs to another account.");
          }
          iceServers = incomingSync.iceServers || iceServers;
          setCall(incomingSync.call);
          setCounterpart(incomingSync.call.caller_name || "SaMi contact");
        } else {
          const detail = await dispatchGet<ErrandResponse>("errandDetail", { id: errandId });
          if (!detail.errand.provider_id || !["assigned", "accepted", "in_progress", "completion_submitted"].includes(detail.errand.status)) {
            throw new Error("Calls become available after an errand provider is assigned.");
          }
          if (me.user.role !== "customer" && me.user.role !== "provider") throw new Error("This account cannot join an errand voice call.");
          if (me.user.id === detail.errand.customer_id) setCounterpart(detail.errand.provider_name || "Assigned provider");
          else if (me.user.id === detail.errand.provider_id) setCounterpart(detail.errand.customer_name || "Customer");
          else throw new Error("This account is not a participant in this errand.");
          const config = await dispatchGet<CallSync>("callSync", { errandId, after: "0" });
          if (config.call) throw new Error("A call is already ringing or connected for this errand. Return to errand details to join it.");
          iceServers = config.iceServers || iceServers;
        }
        if (cancelled) return;

        if (Platform.OS === "android") {
          const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
            title: "SaMi voice call",
            message: "Allow SaMi to use your microphone for this errand call.",
            buttonPositive: "Allow",
            buttonNegative: "Not now",
          });
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) throw new Error("Microphone permission is required to make a SaMi voice call.");
        }

        localStream = await mediaDevices.getUserMedia({ audio: true, video: false });
        if (cancelled) {
          localStream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = localStream;
        localStream.getAudioTracks().forEach((track) => { track.enabled = !mutedRef.current; });

        const peer = new RTCPeerConnection({ iceServers });
        localPeer = peer;
        peerRef.current = peer;
        localStream.getTracks().forEach((track) => peer.addTrack(track, localStream!));
        peer.ontrack = (event) => {
          if (event.streams?.[0]) setRemoteAudioReady(event.streams[0].getAudioTracks().length > 0);
        };
        peer.onconnectionstatechange = () => {
          const state = peer.connectionState || peer.iceConnectionState || "new";
          if (!cancelled) {
            setPeerState(state);
            if (state === "connected") {
              if (!connectedAtRef.current) connectedAtRef.current = Date.now();
              setError("");
            } else if (state === "failed") {
              setError("The audio connection failed. Check your connection and try again.");
            } else if (state === "disconnected") {
              setError("Connection interrupted. SaMi is trying to reconnect.");
            }
          }
        };
        peer.onicecandidate = (event) => {
          const candidate = event.candidate?.toJSON();
          if (!candidate) return;
          const activeId = callIdRef.current;
          if (!activeId) {
            candidatesBeforeCallRef.current.push(candidate);
            return;
          }
          dispatchPost("sendErrandCallSignal", {
            callId: activeId,
            signalType: "ice_candidate",
            payload: candidate,
          }).catch(() => undefined);
        };

        if (incomingId && incomingSync) {
          callIdRef.current = incomingId;
          chosenCallId = incomingId;
          for (const signal of incomingSync.signals || []) {
            await handleSignal(signal, peer);
            afterRef.current = Math.max(afterRef.current, Number(signal.id) || 0);
          }
          afterRef.current = Math.max(afterRef.current, Number(incomingSync.nextAfter) || 0);
          if (!remoteDescriptionSetRef.current) throw new Error("The caller's offer could not be loaded. Decline this call and ask them to call again.");
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          await dispatchPost("answerErrandCall", {
            callId: incomingId,
            answer: peer.localDescription?.toJSON() || answer.toJSON(),
          });
          setCall({ ...incomingSync.call!, status: "active" });
          setPeerState("connecting");
          for (const candidate of candidatesBeforeCallRef.current.splice(0)) {
            dispatchPost("sendErrandCallSignal", { callId: incomingId, signalType: "ice_candidate", payload: candidate }).catch(() => undefined);
          }
        } else {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          const created = await dispatchPost<{ call: VoiceCall; offerSignalId: number; iceServers: RTCIceServer[] }>("startErrandCall", {
            errandId,
            offer: peer.localDescription?.toJSON() || offer.toJSON(),
          });
          chosenCallId = created.call.id;
          callIdRef.current = created.call.id;
          afterRef.current = Number(created.offerSignalId) || 0;
          setCall(created.call);
          setPeerState("connecting");
          for (const candidate of candidatesBeforeCallRef.current.splice(0)) {
            dispatchPost("sendErrandCallSignal", { callId: created.call.id, signalType: "ice_candidate", payload: candidate }).catch(() => undefined);
          }
        }

        if (cancelled || !chosenCallId) return;
        pollTimer = setInterval(() => { void pollCallState(); }, 1000);
        void pollCallState();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "SaMi could not start this voice call.");
      } finally {
        if (!cancelled) setWorking(false);
      }
    }

    void start();
    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (localPeer) {
        localPeer.onicecandidate = null;
        localPeer.ontrack = null;
        localPeer.onconnectionstatechange = null;
        localPeer.close();
      }
      if (localStream) localStream.getTracks().forEach((track) => track.stop());
      if (peerRef.current === localPeer) peerRef.current = null;
      if (streamRef.current === localStream) streamRef.current = null;
    };
    // Recreate the native peer only when the errand or invitation changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errandId, incomingId]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (callIdRef.current && !finishingRef.current) {
        void finishCall();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  async function finishCall(reject = false) {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setWorking(true);
    const activeId = callIdRef.current;
    try {
      if (activeId) {
        await dispatchPost(reject ? "rejectErrandCall" : "endErrandCall", { callId: activeId });
      }
    } catch {
      // The local tracks still stop immediately; server-side expiry closes abandoned calls.
    } finally {
      peerRef.current?.close();
      peerRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setWorking(false);
      router.back();
    }
  }

  const connected = peerState === "connected";
  const terminal = terminalStatuses.has(peerState);
  const duration = String(Math.floor(elapsed / 60)).padStart(2, "0") + ":" + String(elapsed % 60).padStart(2, "0");
  const statusLabel = connected
    ? duration
    : terminal
      ? (peerState === "rejected" ? "Call declined" : peerState === "missed" ? "Call not answered" : peerState === "failed" ? "Call failed" : "Call ended")
      : call?.status === "active"
        ? "Connecting audio…"
        : incomingId
          ? "Incoming voice call"
          : "Calling…";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.navy }}>
      <StatusBar barStyle="light-content" backgroundColor={colors.navy} />
      <View style={{ paddingHorizontal: 20, paddingTop: 10, flex: 1, justifyContent: "space-between", paddingBottom: 28 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="End call and return"
            onPress={() => void finishCall()}
            style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.10)", alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="chevron-back" size={24} color={colors.white} />
          </Pressable>
          <View style={{ alignItems: "center", gap: 4 }}>
            <Text style={{ color: "#C8D6FF", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 }}>SAMI ERRANDS</Text>
            <Text style={{ color: colors.white, fontSize: 12, fontWeight: "700" }}>{call?.public_code || "Secure in-app call"}</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        <View style={{ alignItems: "center", gap: 18, paddingHorizontal: 8 }}>
          <View style={{ width: 126, height: 126, borderRadius: 63, backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 98, height: 98, borderRadius: 49, backgroundColor: "#E2EAFF", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="person" size={47} color={colors.navy} />
            </View>
            {connected ? (
              <View style={{ position: "absolute", right: 3, bottom: 8, width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: colors.navy, backgroundColor: "#35D4A6" }} />
            ) : null}
          </View>
          <View style={{ alignItems: "center", gap: 8 }}>
            <Text style={{ color: colors.white, fontSize: 26, lineHeight: 32, fontWeight: "900", letterSpacing: -0.6, textAlign: "center" }}>{counterpart}</Text>
            <Text style={{ color: connected ? "#8EE8C9" : "#CCD6EB", fontSize: 14, fontWeight: "700" }}>{statusLabel}</Text>
          </View>
          <View style={{ alignItems: "center", gap: 5 }}>
            <Text style={{ color: "#B7C5E0", fontSize: 12, textAlign: "center" }}>{call?.errand_title || "Errand details"}</Text>
            <Text style={{ color: "#91A2C3", fontSize: 10, textAlign: "center" }}>Calls are linked to this errand. Share task information only.</Text>
          </View>
          {remoteAudioReady ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(53,212,166,0.12)", paddingHorizontal: 13, paddingVertical: 8, borderRadius: 30 }}>
              <Ionicons name="volume-medium" size={17} color="#8EE8C9" />
              <Text style={{ color: "#8EE8C9", fontSize: 11, fontWeight: "800" }}>Audio stream received</Text>
            </View>
          ) : null}
          {working ? <ActivityIndicator color={colors.white} size="small" /> : null}
          {error ? (
            <View style={{ width: "100%", backgroundColor: "rgba(255,255,255,0.10)", borderRadius: 14, padding: 13 }}>
              <Text accessibilityRole="alert" style={{ color: "#FFD5D8", fontSize: 12, lineHeight: 18, textAlign: "center" }}>{error}</Text>
            </View>
          ) : null}
        </View>

        <View style={{ gap: 18 }}>
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 26 }}>
            <CallCircle
              icon={muted ? "mic-off" : "mic"}
              label={muted ? "Unmute" : "Mute"}
              onPress={() => setMuted((value) => !value)}
              disabled={terminal || working}
            />
            <CallCircle
              icon="chatbubble-ellipses-outline"
              label="Messages"
              onPress={() => router.push({ pathname: "/(app)/errand/[id]", params: { id: errandId } })}
              disabled={!errandId}
            />
            <CallCircle
              icon="call"
              label="End call"
              destructive
              onPress={() => void finishCall()}
              disabled={working}
            />
          </View>
          <Text style={{ color: "#8FA1C2", fontSize: 10, lineHeight: 16, textAlign: "center" }}>
            If the call cannot connect, return to the errand messages. SaMi never exposes your personal phone number through this call.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
