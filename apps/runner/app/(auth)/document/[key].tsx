import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import {
  getRunnerOnboarding,
  uploadRunnerDocument,
  uploadRunnerNationalId,
} from "@/api";
import type { RunnerUploadedDocument } from "@/api";
import { useRunnerTheme } from "@/theme";

type ThemeColors = ReturnType<typeof useRunnerTheme>["colors"];

type PickedFile = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
};

type Requirement = {
  key: string;
  title: string;
  instructions: string | null;
  required: boolean;
};

type UploadedDocument = Pick<
  RunnerUploadedDocument,
  "requirementKey" | "reviewStatus" | "rejectionReason"
>;

const NATIONAL_ID_FRONT_KEY = "identity_national_id_front";
const NATIONAL_ID_BACK_KEY = "identity_national_id_back";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const BACK_SIZE = 44;

const DOCUMENT_TITLES: Record<string, string> = {
  identity_profile_photo: "Profile photo",
  motorcycle_driving_licence: "Driving licence",
  motorcycle_vehicle_registration: "Motorcycle registration or logbook",
  motorcycle_vehicle_insurance: "Motorcycle insurance",
  motorcycle_owner_authorisation: "Vehicle owner authorisation",
  car_driving_licence: "Driving licence",
  car_vehicle_registration: "Vehicle registration or logbook",
  car_vehicle_insurance: "Vehicle insurance",
  car_owner_authorisation: "Vehicle owner authorisation",
  van_driving_licence: "Driving licence",
  van_vehicle_registration: "Vehicle registration or logbook",
  van_vehicle_insurance: "Vehicle insurance",
  van_owner_authorisation: "Vehicle owner authorisation",
  food_delivery_handling_evidence: "Food handling evidence",
  home_services_qualification: "Home services qualification",
  pharmacy_health_qualification: "Pharmacy or health qualification",
  pet_care_qualification: "Pet care qualification",
  business_support_qualification: "Business support qualification",
};

const GUIDANCE_ITEMS = [
  "Use a genuine, unaltered document.",
  "Make sure the writing is sharp and readable.",
  "Avoid glare, shadows and cropped edges.",
  "Use JPEG, PNG or WEBP images up to 10 MB each.",
];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStatus(
  documents: UploadedDocument[],
  requirementKey: string,
): UploadedDocument["reviewStatus"] | null {
  const document = documents.find(
    (item) => item.requirementKey === requirementKey,
  );
  return document?.reviewStatus ?? null;
}

function getRejectionReason(
  documents: UploadedDocument[],
  requirementKey: string,
): string | null {
  const document = documents.find(
    (item) => item.requirementKey === requirementKey,
  );
  return document?.rejectionReason ?? null;
}

function statusLabel(status: UploadedDocument["reviewStatus"] | null) {
  switch (status) {
    case "approved":
      return "Approved";
    case "pending":
      return "Under review";
    case "rejected":
      return "Rejected — upload again";
    case "resubmission_required":
      return "Replacement required";
    default:
      return "Not uploaded";
  }
}

function getMimeType(name: string, providedType?: string | null): string | null {
  const normalizedType = providedType?.trim().toLowerCase();
  if (normalizedType === "image/jpg") return "image/jpeg";
  if (["image/jpeg", "image/png", "image/webp"].includes(normalizedType ?? "")) {
    return normalizedType!;
  }

  const extension = name.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    default:
      return null;
  }
}

function toApiFile(file: PickedFile) {
  return {
    uri: file.uri,
    name: file.name,
    mimeType: file.mimeType,
  };
}

function PickedFileCard({
  title,
  description,
  file,
  colors,
  supportingText,
  actionBlue,
  onCamera,
  onGallery,
  onClear,
  disabled,
}: {
  title: string;
  description: string;
  file: PickedFile | null;
  colors: ThemeColors;
  supportingText: string;
  actionBlue: string;
  onCamera: () => void;
  onGallery: () => void;
  onClear?: () => void;
  disabled?: boolean;
}) {
  return (
    <View
      style={[
        styles.fileCard,
        {
          backgroundColor: colors.surface,
          borderColor: file ? actionBlue : colors.border,
        },
        file &&
          Platform.select({
            ios: {
              shadowColor: colors.blue,
              shadowOpacity: 0.1,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 3 },
            },
            android: { elevation: 1 },
            default: {},
          }),
      ]}
    >
      <Text style={[styles.fileTitle, { color: colors.text }]}>
        {title}
      </Text>

      <Text
        style={[styles.fileDescription, { color: supportingText }]}
      >
        {description}
      </Text>

      {file ? (
        <View style={styles.previewContainer}>
          <Image
            source={{ uri: file.uri }}
            style={[
              styles.previewImage,
              { backgroundColor: colors.paper },
            ]}
            accessibilityIgnoresInvertColors
          />

          <View style={styles.previewDetails}>
            <Text
              style={[styles.fileName, { color: colors.text }]}
              numberOfLines={2}
            >
              {file.name}
            </Text>

            <View style={styles.fileMetaRow}>
              <Ionicons
                name="checkmark-circle"
                size={14}
                color={colors.success}
              />
              <Text
                style={[
                  styles.fileSelected,
                  { color: colors.success },
                ]}
              >
                Image selected
                {file.size ? ` · ${formatFileSize(file.size)}` : ""}
              </Text>
            </View>
          </View>

          {onClear ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove selected image"
              disabled={disabled}
              onPress={onClear}
              hitSlop={10}
              style={({ pressed }) => ({
                padding: 4,
                opacity: pressed ? 0.55 : disabled ? 0.5 : 1,
              })}
            >
              <Ionicons
                name="close-circle"
                size={22}
                color={supportingText}
              />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View
          style={[
            styles.emptyPreview,
            {
              backgroundColor: colors.paper,
              borderColor: colors.border,
            },
          ]}
        >
          <Ionicons
            name="image-outline"
            size={26}
            color={supportingText}
          />
          <Text
            style={[
              styles.emptyPreviewText,
              { color: supportingText },
            ]}
          >
            No image selected
          </Text>
        </View>
      )}

      <View style={styles.pickerActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Take a photo of this document"
          disabled={disabled}
          onPress={onCamera}
          style={({ pressed }) => [
            styles.secondaryButton,
            {
              borderColor: colors.border,
              backgroundColor: colors.paper,
              opacity: pressed ? 0.6 : disabled ? 0.5 : 1,
            },
          ]}
        >
          <Ionicons
            name="camera-outline"
            size={17}
            color={colors.text}
          />
          <Text
            style={[
              styles.secondaryButtonText,
              { color: colors.text },
            ]}
          >
            Take photo
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose an image from your gallery"
          disabled={disabled}
          onPress={onGallery}
          style={({ pressed }) => [
            styles.secondaryButton,
            {
              borderColor: colors.border,
              backgroundColor: colors.paper,
              opacity: pressed ? 0.6 : disabled ? 0.5 : 1,
            },
          ]}
        >
          <Ionicons
            name="images-outline"
            size={17}
            color={colors.text}
          />
          <Text
            style={[
              styles.secondaryButtonText,
              { color: colors.text },
            ]}
          >
            Choose image
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function RunnerDocumentDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ key?: string | string[] }>();
  const { colors, mode } = useRunnerTheme();

  const isDark = mode === "dark";
  const supportingText = isDark ? "#C1CCDA" : "#526176";
  const brandColor = isDark ? "#F5F7FB" : "#000535";
  const actionBlue = isDark ? "#8AB8F8" : "#1F5EAB";
  const buttonBlue = isDark ? "#1D5DAD" : "#174F9F";

  const routeKey = Array.isArray(params.key)
    ? params.key[0]
    : params.key;
  const isNationalIdentity = routeKey === "national_identity";

  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [onboardingStatus, setOnboardingStatus] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [verificationStatus, setVerificationStatus] = useState("");

  const [frontFile, setFrontFile] = useState<PickedFile | null>(null);
  const [backFile, setBackFile] = useState<PickedFile | null>(null);
  const [singleFile, setSingleFile] = useState<PickedFile | null>(null);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const mountedRef = useRef(true);
  const loadInFlightRef = useRef(false);
  const uploadInFlightRef = useRef(false);
  const pickerInFlightRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadOnboarding = useCallback(async () => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;

    if (!hasLoadedOnceRef.current) {
      setLoading(true);
    }
    setPageError(null);

    try {
      // GET /api/runner/me/onboarding returns the authenticated Runner's
      // dynamic requirements and newest-first document review records.
      const response = await getRunnerOnboarding();
      if (!mountedRef.current) return;

      if (
        !response?.ok ||
        !response.runner ||
        !Array.isArray(response.requirements) ||
        !Array.isArray(response.documents)
      ) {
        throw new Error("The server returned an invalid onboarding response.");
      }

      // Fail closed: only explicitly mandatory requirements are available here.
      // Optional or malformed entries cannot be opened or uploaded from this screen.
      setRequirements(
        response.requirements.filter(
          (item) => item.required === true,
        ),
      );
      setDocuments(response.documents);
      setOnboardingStatus(response.onboardingStatus);
      setAccountStatus(response.runner.accountStatus);
      setVerificationStatus(response.runner.verificationStatus);
      hasLoadedOnceRef.current = true;
    } catch (cause) {
      if (!mountedRef.current) return;
      setPageError(
        cause instanceof Error
          ? cause.message
          : "Could not load your document requirements.",
      );
    } finally {
      loadInFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Recheck document and account state whenever this screen becomes active.
  // This catches an Operations decision made while the user was elsewhere.
  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      void loadOnboarding();
    }, [loadOnboarding]),
  );

  useEffect(() => {
    if (!error) return;
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [error]);

  const frontRequirement = useMemo(
    () => requirements.find((item) => item.key === NATIONAL_ID_FRONT_KEY),
    [requirements],
  );
  const backRequirement = useMemo(
    () => requirements.find((item) => item.key === NATIONAL_ID_BACK_KEY),
    [requirements],
  );
  const singleRequirement = useMemo(
    () => requirements.find((item) => item.key === (routeKey ?? "")),
    [requirements, routeKey],
  );

  const frontStatus = getStatus(documents, NATIONAL_ID_FRONT_KEY);
  const backStatus = getStatus(documents, NATIONAL_ID_BACK_KEY);
  const singleStatus = routeKey ? getStatus(documents, routeKey) : null;

  const frontRejectionReason = getRejectionReason(
    documents,
    NATIONAL_ID_FRONT_KEY,
  );
  const backRejectionReason = getRejectionReason(
    documents,
    NATIONAL_ID_BACK_KEY,
  );
  const singleRejectionReason = routeKey
    ? getRejectionReason(documents, routeKey)
    : null;

  const nationalIdentityDocumentLocked =
    ["pending", "approved"].includes(frontStatus ?? "") &&
    ["pending", "approved"].includes(backStatus ?? "");
  const singleDocumentLocked = ["pending", "approved"].includes(
    singleStatus ?? "",
  );

  const documentExists = isNationalIdentity
    ? Boolean(frontRequirement && backRequirement)
    : Boolean(singleRequirement);

  const singleTitle =
    singleRequirement?.title ??
    DOCUMENT_TITLES[routeKey ?? ""] ??
    "Document";
  const singleDescription =
    singleRequirement?.instructions ??
    "Upload a clear, readable image of this document.";

  const isApproved =
    onboardingStatus === "approved" || verificationStatus === "approved";
  const isPendingReview =
    onboardingStatus === "pending_review" || verificationStatus === "submitted";
  const isRestricted = ["suspended", "closed"].includes(accountStatus);
  const sessionExpired = /session has expired|sign in again|no valid runner session/i.test(
    `${pageError ?? ""} ${error ?? ""}`,
  );

  const accountReadOnly = isApproved || isPendingReview || isRestricted;
  const documentAlreadySubmitted = isNationalIdentity
    ? nationalIdentityDocumentLocked
    : singleDocumentLocked;
  const locked =
    accountReadOnly || documentAlreadySubmitted || sessionExpired;
  const canUpload =
    hasLoadedOnceRef.current &&
    !loading &&
    !uploading &&
    !pageError &&
    documentExists &&
    !locked;

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(auth)/documents");
    }
  }

  function clearFile(side: "front" | "back" | "single") {
    if (uploading) return;
    if (side === "front") setFrontFile(null);
    else if (side === "back") setBackFile(null);
    else setSingleFile(null);
    setError(null);
  }

  const pickImage = async (
    side: "front" | "back" | "single",
    source: "camera" | "gallery",
  ) => {
    if (!canUpload || pickerInFlightRef.current) return;
    pickerInFlightRef.current = true;
    setError(null);

    try {
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!mountedRef.current) return;

      if (!permission.granted) {
        setError(
          source === "camera"
            ? "Camera permission is required to take a document photo. Enable camera access in your device settings."
            : "Photo library permission is required to select an image. Enable photo access in your device settings.",
        );
        return;
      }

      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ["images"],
              allowsEditing: false,
              quality: 0.9,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              allowsEditing: false,
              quality: 0.9,
            });

      if (!mountedRef.current || result.canceled || !result.assets?.length) {
        return;
      }

      const asset = result.assets[0];
      const name =
        asset.fileName?.trim() ||
        `${side}-${routeKey ?? "document"}-${Date.now()}.jpg`;
      const mimeType = getMimeType(name, asset.mimeType);

      if (asset.fileSize !== undefined && asset.fileSize <= 0) {
        setError("The selected image is empty. Choose another image.");
        return;
      }

      if (asset.fileSize !== undefined && asset.fileSize > MAX_FILE_SIZE) {
        setError("This image is larger than 10 MB. Choose a smaller image.");
        return;
      }

      if (!mimeType) {
        setError("Choose a JPEG, PNG or WEBP image. HEIC and other image formats are not supported.");
        return;
      }

      const picked: PickedFile = {
        uri: asset.uri,
        name: name.includes(".")
          ? name
          : `${name}.${mimeType.split("/")[1] === "jpeg" ? "jpg" : mimeType.split("/")[1]}`,
        mimeType,
        size: asset.fileSize,
      };

      if (side === "front") setFrontFile(picked);
      else if (side === "back") setBackFile(picked);
      else setSingleFile(picked);
    } catch (cause) {
      if (!mountedRef.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "The image could not be selected.",
      );
    } finally {
      pickerInFlightRef.current = false;
    }
  };

  const submitDocument = async () => {
    if (!canUpload || uploadInFlightRef.current) return;
    setError(null);

    if (isNationalIdentity) {
      if (!frontFile || !backFile) {
        setError("Select both the front and back of your National ID.");
        return;
      }
      if (!frontRequirement || !backRequirement) {
        setError("The National ID requirements could not be loaded.");
        return;
      }
    } else {
      if (!routeKey || !singleRequirement) {
        setError("This document requirement could not be found.");
        return;
      }
      if (!singleFile) {
        setError("Choose an image of this document before submitting.");
        return;
      }
    }

    uploadInFlightRef.current = true;
    setUploading(true);

    try {
      if (isNationalIdentity && frontFile && backFile) {
        // The API helper sends both multipart parts in one request. The
        // backend validates both files and inserts both records atomically.
        const result = await uploadRunnerNationalId({
          front: toApiFile(frontFile),
          back: toApiFile(backFile),
        });

        const keys = new Set(
          (result.documents ?? []).map((item) => item.requirementKey),
        );
        if (
          !result.ok ||
          result.uploadCount !== 2 ||
          !keys.has(NATIONAL_ID_FRONT_KEY) ||
          !keys.has(NATIONAL_ID_BACK_KEY)
        ) {
          throw new Error(
            "The server did not confirm both National ID sides. Refresh your document checklist before continuing.",
          );
        }
      } else if (routeKey && singleFile) {
        const result = await uploadRunnerDocument({
          requirementKey: routeKey,
          file: toApiFile(singleFile),
        });

        if (
          !result.ok ||
          result.document?.requirementKey !== routeKey ||
          result.document?.reviewStatus !== "pending"
        ) {
          throw new Error(
            "The server did not confirm this document upload. Refresh your document checklist before continuing.",
          );
        }
      }

      if (!mountedRef.current) return;
      // Return to the overview only after the backend confirms the upload.
      // The overview refreshes its server state when it receives focus.
      router.replace("/(auth)/documents");
    } catch (cause) {
      if (!mountedRef.current) return;
      const message = cause instanceof Error
        ? cause.message
        : "Your document could not be submitted. Please try again.";
      setError(message);

      // A 401 clears the local token in uploadRunnerFile(). Refreshing the
      // authenticated onboarding endpoint exposes the expired-session state.
      // A 403/409 can also mean Operations changed the account state while
      // this screen was open, so refresh the server snapshot in that case.
      if (/session has expired|sign in again|no valid runner session|already approved|operations review|cannot upload|account cannot upload/i.test(message)) {
        void loadOnboarding();
      }
    } finally {
      uploadInFlightRef.current = false;
      if (mountedRef.current) setUploading(false);
    }
  };

  const submitDisabled =
    !canUpload ||
    (isNationalIdentity ? !frontFile || !backFile : !singleFile);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.paper }]}
      edges={["top", "bottom"]}
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.paper}
      />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back to documents"
          disabled={uploading}
          onPress={goBack}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={({ pressed }) => [
            styles.backButton,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.6 : uploading ? 0.5 : 1,
            },
          ]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>

        <View style={styles.brand}>
          <Text style={[styles.brandName, { color: brandColor }]}>
            SaMi <Text style={{ color: actionBlue }}>Runner</Text>
          </Text>
          <Text style={[styles.brandTagline, { color: supportingText }]}>
            CONSIDER IT DONE
          </Text>
        </View>

        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View
          style={styles.center}
          accessibilityRole="progressbar"
          accessibilityLabel="Loading document requirement"
        >
          <ActivityIndicator size="large" color={actionBlue} />
          <Text style={[styles.loadingText, { color: supportingText }]}>
            Loading document requirement…
          </Text>
        </View>
      ) : pageError ? (
        <View style={styles.center}>
          <View
            style={[styles.errorIconWrap, { backgroundColor: colors.dangerSoft }]}
          >
            <Ionicons name="alert-circle-outline" size={26} color={colors.red} />
          </View>

          <Text style={[styles.errorTitle, { color: colors.text }]}>
            {sessionExpired ? "Sign in again" : "Could not open this document"}
          </Text>
          <Text
            style={[styles.bodyText, { color: supportingText }]}
            numberOfLines={4}
          >
            {pageError}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={sessionExpired ? "Sign in again" : "Try again"}
            onPress={() =>
              sessionExpired
                ? router.replace("/(auth)/login")
                : void loadOnboarding()
            }
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: buttonBlue },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {sessionExpired ? "Sign in" : "Try again"}
            </Text>
          </Pressable>
        </View>
      ) : !documentExists ? (
        <View style={styles.center}>
          <View
            style={[styles.errorIconWrap, { backgroundColor: colors.blueSoft }]}
          >
            <Ionicons name="document-text-outline" size={26} color={actionBlue} />
          </View>

          <Text style={[styles.errorTitle, { color: colors.text }]}>
            Requirement not found
          </Text>
          <Text style={[styles.bodyText, { color: supportingText }]}>
            This document is not part of your current mandatory onboarding requirements.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to documents"
            onPress={goBack}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: buttonBlue },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>Back</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Heading */}
          <View style={styles.headingBlock}>
            <Text style={[styles.eyebrow, { color: actionBlue }]}>
              RUNNER VERIFICATION
            </Text>
            <Text style={[styles.title, { color: colors.text }]}>
              {isNationalIdentity ? "National ID" : singleTitle}
            </Text>
            <Text style={[styles.bodyText, { color: supportingText }]}>
              {isNationalIdentity
                ? "Submit both sides of your National ID together. Make sure the details are clear and all edges are visible."
                : singleDescription}
            </Text>
          </View>

          {/* Account state takes precedence over an individual document state. */}
          {sessionExpired ? (
            <View
              style={[styles.stateNotice, { backgroundColor: colors.dangerSoft }]}
            >
              <Ionicons name="lock-closed-outline" size={21} color={colors.red} />
              <View style={styles.stateNoticeCopy}>
                <Text style={[styles.stateNoticeTitle, { color: colors.text }]}>
                  Runner session expired
                </Text>
                <Text style={[styles.stateNoticeText, { color: supportingText }]}>
                  Sign in again to continue uploading documents. Your saved application remains on your account.
                </Text>
                <Pressable onPress={() => router.replace("/(auth)/login")} hitSlop={8}>
                  <Text style={[styles.stateNoticeAction, { color: actionBlue }]}>
                    Sign in again
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : isApproved ? (
            <View
              style={[styles.stateNotice, { backgroundColor: colors.successSoft }]}
            >
              <Ionicons name="checkmark-circle-outline" size={21} color={colors.success} />
              <View style={styles.stateNoticeCopy}>
                <Text style={[styles.stateNoticeTitle, { color: colors.text }]}>
                  Runner account approved
                </Text>
                <Text style={[styles.stateNoticeText, { color: supportingText }]}>
                  Documents are read-only after approval. You can return to the Runner dashboard.
                </Text>
                <Pressable onPress={() => router.replace("/(app)")} hitSlop={8}>
                  <Text style={[styles.stateNoticeAction, { color: actionBlue }]}>
                    Open Runner dashboard
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : isPendingReview ? (
            <View
              style={[styles.stateNotice, { backgroundColor: colors.warningSoft }]}
            >
              <Ionicons name="time-outline" size={21} color={colors.warning} />
              <View style={styles.stateNoticeCopy}>
                <Text style={[styles.stateNoticeTitle, { color: colors.text }]}>
                  Application under review
                </Text>
                <Text style={[styles.stateNoticeText, { color: supportingText }]}>
                  Uploads are paused while SaMi Operations reviews your application.
                </Text>
                <Pressable
                  onPress={() => router.push("/(app)/profile-setup?mode=status")}
                  hitSlop={8}
                >
                  <Text style={[styles.stateNoticeAction, { color: actionBlue }]}>
                    View application status
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : isRestricted ? (
            <View
              style={[styles.stateNotice, { backgroundColor: colors.dangerSoft }]}
            >
              <Ionicons name="lock-closed-outline" size={21} color={colors.red} />
              <View style={styles.stateNoticeCopy}>
                <Text style={[styles.stateNoticeTitle, { color: colors.text }]}>
                  Account access restricted
                </Text>
                <Text style={[styles.stateNoticeText, { color: supportingText }]}>
                  Document uploads are unavailable for this account. Contact SaMi Operations for assistance.
                </Text>
              </View>
            </View>
          ) : documentAlreadySubmitted ? (
            <View
              style={[styles.statusCard, { backgroundColor: colors.blueSoft }]}
            >
              <View style={styles.statusHeader}>
                <Ionicons name="time-outline" size={20} color={actionBlue} />
                <Text style={[styles.statusTitle, { color: colors.text }]}>
                  {isNationalIdentity
                    ? "National ID already submitted"
                    : "Document already submitted"}
                </Text>
              </View>
              <Text style={[styles.bodyText, { color: supportingText }]}>
                {isNationalIdentity
                  ? `Front: ${statusLabel(frontStatus)} · Back: ${statusLabel(backStatus)}.`
                  : `${statusLabel(singleStatus)}.`}{" "}
                You can upload a replacement if the review team requests one.
              </Text>
            </View>
          ) : null}

          {/* Upload controls only appear when the account and requirement are editable. */}
          {!locked ? (
            <>
              {isNationalIdentity ? (
                <>
                  {frontRejectionReason || backRejectionReason ? (
                    <View
                      style={[styles.rejectionCard, { backgroundColor: colors.dangerSoft }]}
                    >
                      <View style={styles.rejectionHeader}>
                        <Ionicons name="alert-circle-outline" size={18} color={colors.red} />
                        <Text style={[styles.rejectionTitle, { color: colors.red }]}>
                          National ID changes requested
                        </Text>
                      </View>
                      {frontRejectionReason ? (
                        <Text style={[styles.rejectionText, { color: colors.text }]}>
                          <Text style={{ fontWeight: "800" }}>Front: </Text>
                          {frontRejectionReason}
                        </Text>
                      ) : null}
                      {backRejectionReason ? (
                        <Text style={[styles.rejectionText, { color: colors.text }]}>
                          <Text style={{ fontWeight: "800" }}>Back: </Text>
                          {backRejectionReason}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                  <PickedFileCard
                    title="Front of National ID"
                    description="Capture the side showing your photograph and personal details."
                    file={frontFile}
                    colors={colors}
                    supportingText={supportingText}
                    actionBlue={actionBlue}
                    disabled={uploading || !canUpload}
                    onCamera={() => void pickImage("front", "camera")}
                    onGallery={() => void pickImage("front", "gallery")}
                    onClear={() => clearFile("front")}
                  />
                  <PickedFileCard
                    title="Back of National ID"
                    description="Capture the reverse side, including the printed details."
                    file={backFile}
                    colors={colors}
                    supportingText={supportingText}
                    actionBlue={actionBlue}
                    disabled={uploading || !canUpload}
                    onCamera={() => void pickImage("back", "camera")}
                    onGallery={() => void pickImage("back", "gallery")}
                    onClear={() => clearFile("back")}
                  />
                </>
              ) : (
                <>
                  {singleRejectionReason ? (
                    <View
                      style={[styles.rejectionCard, { backgroundColor: colors.dangerSoft }]}
                    >
                      <View style={styles.rejectionHeader}>
                        <Ionicons name="alert-circle-outline" size={18} color={colors.red} />
                        <Text style={[styles.rejectionTitle, { color: colors.red }]}>
                          Changes requested
                        </Text>
                      </View>
                      <Text style={[styles.rejectionText, { color: colors.text }]}>
                        {singleRejectionReason}
                      </Text>
                    </View>
                  ) : null}

                  <PickedFileCard
                    title={singleTitle}
                    description={singleDescription}
                    file={singleFile}
                    colors={colors}
                    supportingText={supportingText}
                    actionBlue={actionBlue}
                    disabled={uploading || !canUpload}
                    onCamera={() => void pickImage("single", "camera")}
                    onGallery={() => void pickImage("single", "gallery")}
                    onClear={() => clearFile("single")}
                  />
                </>
              )}
            </>
          ) : null}

          {/* Guidance */}
          {!accountReadOnly && !sessionExpired && !documentAlreadySubmitted ? (
            <View
              style={[
                styles.guidanceCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.guidanceTitle, { color: colors.text }]}>
                Before submitting
              </Text>
              <View style={styles.guidanceList}>
                {GUIDANCE_ITEMS.map((item) => (
                  <View key={item} style={styles.guidanceRow}>
                    <View style={[styles.guidanceDot, { backgroundColor: actionBlue }]} />
                    <Text style={[styles.guidanceText, { color: supportingText }]}>
                      {item}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Error */}
          {error ? (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={[styles.errorCard, { backgroundColor: colors.dangerSoft }]}
            >
              <Ionicons name="alert-circle-outline" size={18} color={colors.red} />
              <Text style={[styles.errorText, { color: colors.red }]}>
                {error}
              </Text>
            </View>
          ) : null}

          {/* Submit / Back */}
          {locked ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to documents"
              onPress={goBack}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: buttonBlue },
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>Back to documents</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                uploading
                  ? "Uploading document"
                  : isNationalIdentity
                    ? "Submit National ID"
                    : "Submit document"
              }
              accessibilityHint="Uploads the selected image or images to SaMi Runner verification"
              accessibilityState={{ busy: uploading, disabled: submitDisabled }}
              disabled={submitDisabled}
              onPress={() => void submitDocument()}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: buttonBlue },
                submitDisabled && styles.disabled,
                pressed && !submitDisabled && styles.pressed,
              ]}
            >
              {uploading ? (
                <>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.primaryButtonText}>Uploading…</Text>
                </>
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isNationalIdentity ? "Submit National ID" : "Submit document"}
                </Text>
              )}
            </Pressable>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },

  // Header
  header: {
    minHeight: BACK_SIZE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
  },

  backButton: {
    width: BACK_SIZE,
    height: BACK_SIZE,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  brand: {
    alignItems: "center",
    gap: 3,
  },

  brandName: {
    fontSize: 19,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.5,
  },

  brandTagline: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 2,
  },

  headerSpacer: { width: BACK_SIZE },

  // Content
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
    gap: 18,
  },

  headingBlock: { gap: 9, marginBottom: 2 },

  eyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
  },

  title: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "900",
    letterSpacing: -0.7,
  },

  bodyText: {
    fontSize: 13.5,
    lineHeight: 20,
  },

  // File card
  fileCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },

  fileTitle: {
    fontSize: 15.5,
    fontWeight: "900",
  },

  fileDescription: {
    fontSize: 12.5,
    lineHeight: 18,
  },

  emptyPreview: {
    minHeight: 96,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  emptyPreviewText: {
    fontSize: 12.5,
    fontWeight: "600",
  },

  previewContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 96,
  },

  previewImage: {
    width: 84,
    height: 84,
    borderRadius: 10,
  },

  previewDetails: {
    flex: 1,
    gap: 6,
  },

  fileName: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },

  fileMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  fileSelected: {
    fontSize: 12,
    fontWeight: "700",
  },

  pickerActions: {
    flexDirection: "row",
    gap: 10,
  },

  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 10,
  },

  secondaryButtonText: {
    fontSize: 12.5,
    fontWeight: "800",
  },

  // Rejection card
  rejectionCard: {
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },

  rejectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  rejectionTitle: {
    fontSize: 13.5,
    fontWeight: "900",
  },

  rejectionText: {
    fontSize: 12.5,
    lineHeight: 19,
  },

  // Guidance
  guidanceCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },

  guidanceTitle: {
    fontSize: 14.5,
    fontWeight: "900",
  },

  guidanceList: {
    gap: 7,
  },

  guidanceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  guidanceDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 7,
  },

  guidanceText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 19,
  },

  // Status card
  statusCard: {
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },

  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  statusTitle: {
    fontSize: 15,
    fontWeight: "900",
  },

  stateNotice: {
    borderRadius: 15,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  stateNoticeCopy: {
    flex: 1,
    gap: 5,
  },

  stateNoticeTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },

  stateNoticeText: {
    fontSize: 12,
    lineHeight: 18,
  },

  stateNoticeAction: {
    fontSize: 12,
    fontWeight: "900",
    paddingTop: 2,
  },

  // Error
  errorCard: {
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  errorText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },

  // Primary button
  primaryButton: {
    minHeight: 58,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    gap: 10,
    marginTop: 4,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.2,
  },

  // Center states
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 14,
  },

  loadingText: {
    fontSize: 13,
    lineHeight: 20,
  },

  errorIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  errorTitle: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.3,
    textAlign: "center",
  },

  disabled: { opacity: 0.45 },

  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
});