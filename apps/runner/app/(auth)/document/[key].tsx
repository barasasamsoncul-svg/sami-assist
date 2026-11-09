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
import { useLocalSearchParams, useRouter } from "expo-router";
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

function getMimeType(name: string, providedType?: string | null) {
  if (providedType) return providedType;

  const extension = name.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "jpg":
    case "jpeg":
    default:
      return "image/jpeg";
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
  onCamera,
  onGallery,
  onClear,
  disabled,
}: {
  title: string;
  description: string;
  file: PickedFile | null;
  colors: ThemeColors;
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
          borderColor: file ? colors.blue : colors.border,
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
        style={[styles.fileDescription, { color: colors.textMuted }]}
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
                color={colors.textMuted}
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
            color={colors.textMuted}
          />
          <Text
            style={[
              styles.emptyPreviewText,
              { color: colors.textMuted },
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
  const { colors } = useRunnerTheme();

  const routeKey = Array.isArray(params.key)
    ? params.key[0]
    : params.key;

  const isNationalIdentity = routeKey === "national_identity";

  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);

  const [frontFile, setFrontFile] = useState<PickedFile | null>(null);
  const [backFile, setBackFile] = useState<PickedFile | null>(null);
  const [singleFile, setSingleFile] = useState<PickedFile | null>(null);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadOnboarding = useCallback(async () => {
    setLoading(true);
    setPageError(null);

    try {
      const response = await getRunnerOnboarding();

      if (!mountedRef.current) return;

      setRequirements(
        Array.isArray(response.requirements) ? response.requirements : [],
      );
      setDocuments(
        Array.isArray(response.documents) ? response.documents : [],
      );
    } catch (cause) {
      if (!mountedRef.current) return;
      setPageError(
        cause instanceof Error
          ? cause.message
          : "Could not load your document requirements.",
      );
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadOnboarding();
  }, [loadOnboarding]);

  // Scroll any inline error into view so it's never off-screen.
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

  const nationalIdentityLocked =
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

  function goBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(auth)/documents");
  }

  function clearFile(side: "front" | "back" | "single") {
    if (side === "front") setFrontFile(null);
    else if (side === "back") setBackFile(null);
    else setSingleFile(null);
    setError(null);
  }

  const pickImage = async (
    side: "front" | "back" | "single",
    source: "camera" | "gallery",
  ) => {
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
            ? "Camera permission is required to take a document photo."
            : "Photo library permission is required to select an image.",
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

      if (!mountedRef.current) return;
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const name =
        asset.fileName ??
        `${side}-${routeKey ?? "document"}-${Date.now()}.jpg`;
      const mimeType = getMimeType(name, asset.mimeType);

      if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
        setError(
          "This image is larger than 10 MB. Choose a smaller image.",
        );
        return;
      }

      if (
        !["image/jpeg", "image/png", "image/webp"].includes(mimeType)
      ) {
        setError("Choose a JPEG, PNG or WEBP image.");
        return;
      }

      const picked: PickedFile = {
        uri: asset.uri,
        name,
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
    }
  };

  const submitDocument = async () => {
    setError(null);

    if (isNationalIdentity) {
      if (!frontFile || !backFile) {
        setError(
          "Select both the front and back of your National ID.",
        );
        return;
      }
      if (!frontRequirement || !backRequirement) {
        setError(
          "The National ID requirements could not be loaded.",
        );
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

    setUploading(true);

    try {
      if (isNationalIdentity && frontFile && backFile) {
        await uploadRunnerNationalId({
          front: toApiFile(frontFile),
          back: toApiFile(backFile),
        });
      } else if (routeKey && singleFile) {
        await uploadRunnerDocument({
          requirementKey: routeKey,
          file: toApiFile(singleFile),
        });
      }

      if (!mountedRef.current) return;

      router.replace("/(auth)/documents");
    } catch (cause) {
      if (!mountedRef.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Your document could not be submitted. Please try again.",
      );
    } finally {
      if (mountedRef.current) {
        setUploading(false);
      }
    }
  };

  const locked = isNationalIdentity
    ? nationalIdentityLocked
    : singleDocumentLocked;

  const submitDisabled =
    uploading ||
    loading ||
    !documentExists ||
    locked ||
    (isNationalIdentity ? !frontFile || !backFile : !singleFile);

  const isDarkPaper = colors.paper === "#080F1D";

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.paper }]}
      edges={["top", "bottom"]}
    >
      <StatusBar
        barStyle={isDarkPaper ? "light-content" : "dark-content"}
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
          <Ionicons
            name="chevron-back"
            size={22}
            color={colors.text}
          />
        </Pressable>

        <View style={styles.brand}>
          <Text style={[styles.brandName, { color: colors.navy }]}>
            SaMi <Text style={{ color: colors.blue }}>Runner</Text>
          </Text>
          <Text
            style={[
              styles.brandTagline,
              { color: colors.textMuted },
            ]}
          >
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
          <ActivityIndicator size="large" color={colors.blue} />
          <Text
            style={[styles.loadingText, { color: colors.textMuted }]}
          >
            Loading document requirement…
          </Text>
        </View>
      ) : pageError ? (
        <View style={styles.center}>
          <View
            style={[
              styles.errorIconWrap,
              { backgroundColor: colors.dangerSoft },
            ]}
          >
            <Ionicons
              name="alert-circle-outline"
              size={26}
              color={colors.red}
            />
          </View>

          <Text style={[styles.errorTitle, { color: colors.text }]}>
            Could not open this document
          </Text>

          <Text
            style={[styles.bodyText, { color: colors.textMuted }]}
            numberOfLines={4}
          >
            {pageError}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            onPress={() => void loadOnboarding()}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.blue },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : !documentExists ? (
        <View style={styles.center}>
          <View
            style={[
              styles.errorIconWrap,
              { backgroundColor: colors.blueSoft },
            ]}
          >
            <Ionicons
              name="document-text-outline"
              size={26}
              color={colors.blue}
            />
          </View>

          <Text style={[styles.errorTitle, { color: colors.text }]}>
            Requirement not found
          </Text>

          <Text
            style={[styles.bodyText, { color: colors.textMuted }]}
          >
            This document is not part of your current onboarding
            requirements.
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to documents"
            onPress={goBack}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.blue },
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
            <Text style={[styles.eyebrow, { color: colors.blue }]}>
              RUNNER VERIFICATION
            </Text>

            <Text style={[styles.title, { color: colors.text }]}>
              {isNationalIdentity ? "National ID" : singleTitle}
            </Text>

            <Text
              style={[styles.bodyText, { color: colors.textMuted }]}
            >
              {isNationalIdentity
                ? "Submit both sides of your National ID together. Make sure the details are clear and all edges are visible."
                : singleDescription}
            </Text>
          </View>

          {/* Body */}
          {locked ? (
            <View
              style={[
                styles.statusCard,
                { backgroundColor: colors.blueSoft },
              ]}
            >
              <View style={styles.statusHeader}>
                <Ionicons
                  name="time-outline"
                  size={20}
                  color={colors.blue}
                />
                <Text
                  style={[styles.statusTitle, { color: colors.text }]}
                >
                  {isNationalIdentity
                    ? "National ID already submitted"
                    : "Document already submitted"}
                </Text>
              </View>

              <Text
                style={[
                  styles.bodyText,
                  { color: colors.textMuted },
                ]}
              >
                {isNationalIdentity
                  ? `Front: ${statusLabel(frontStatus)} · Back: ${statusLabel(backStatus)}.`
                  : `${statusLabel(singleStatus)}.`}{" "}
                You can upload a replacement if the review team
                rejects it.
              </Text>
            </View>
          ) : (
            <>
              {isNationalIdentity ? (
                <>
                  {frontRejectionReason || backRejectionReason ? (
                    <View
                      style={[
                        styles.rejectionCard,
                        { backgroundColor: colors.dangerSoft },
                      ]}
                    >
                      <View style={styles.rejectionHeader}>
                        <Ionicons
                          name="alert-circle-outline"
                          size={18}
                          color={colors.red}
                        />
                        <Text
                          style={[
                            styles.rejectionTitle,
                            { color: colors.red },
                          ]}
                        >
                          National ID changes requested
                        </Text>
                      </View>

                      {frontRejectionReason ? (
                        <Text
                          style={[
                            styles.rejectionText,
                            { color: colors.text },
                          ]}
                        >
                          <Text style={{ fontWeight: "800" }}>
                            Front:{" "}
                          </Text>
                          {frontRejectionReason}
                        </Text>
                      ) : null}

                      {backRejectionReason ? (
                        <Text
                          style={[
                            styles.rejectionText,
                            { color: colors.text },
                          ]}
                        >
                          <Text style={{ fontWeight: "800" }}>
                            Back:{" "}
                          </Text>
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
                    disabled={uploading}
                    onCamera={() =>
                      void pickImage("front", "camera")
                    }
                    onGallery={() =>
                      void pickImage("front", "gallery")
                    }
                    onClear={() => clearFile("front")}
                  />

                  <PickedFileCard
                    title="Back of National ID"
                    description="Capture the reverse side, including the printed details."
                    file={backFile}
                    colors={colors}
                    disabled={uploading}
                    onCamera={() =>
                      void pickImage("back", "camera")
                    }
                    onGallery={() =>
                      void pickImage("back", "gallery")
                    }
                    onClear={() => clearFile("back")}
                  />
                </>
              ) : (
                <>
                  {singleRejectionReason ? (
                    <View
                      style={[
                        styles.rejectionCard,
                        { backgroundColor: colors.dangerSoft },
                      ]}
                    >
                      <View style={styles.rejectionHeader}>
                        <Ionicons
                          name="alert-circle-outline"
                          size={18}
                          color={colors.red}
                        />
                        <Text
                          style={[
                            styles.rejectionTitle,
                            { color: colors.red },
                          ]}
                        >
                          Changes requested
                        </Text>
                      </View>

                      <Text
                        style={[
                          styles.rejectionText,
                          { color: colors.text },
                        ]}
                      >
                        {singleRejectionReason}
                      </Text>
                    </View>
                  ) : null}

                  <PickedFileCard
                    title={singleTitle}
                    description={singleDescription}
                    file={singleFile}
                    colors={colors}
                    disabled={uploading}
                    onCamera={() =>
                      void pickImage("single", "camera")
                    }
                    onGallery={() =>
                      void pickImage("single", "gallery")
                    }
                    onClear={() => clearFile("single")}
                  />
                </>
              )}
            </>
          )}

          {/* Guidance */}
          <View
            style={[
              styles.guidanceCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[styles.guidanceTitle, { color: colors.text }]}
            >
              Before submitting
            </Text>

            <View style={styles.guidanceList}>
              {GUIDANCE_ITEMS.map((item) => (
                <View key={item} style={styles.guidanceRow}>
                  <View
                    style={[
                      styles.guidanceDot,
                      { backgroundColor: colors.blue },
                    ]}
                  />
                  <Text
                    style={[
                      styles.guidanceText,
                      { color: colors.textMuted },
                    ]}
                  >
                    {item}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Error */}
          {error ? (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={[
                styles.errorCard,
                { backgroundColor: colors.dangerSoft },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={colors.red}
              />
              <Text
                style={[styles.errorText, { color: colors.red }]}
              >
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
                { backgroundColor: colors.blue },
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>Back</Text>
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
              accessibilityHint="Uploads the selected image(s) to SaMi Runner verification"
              accessibilityState={{
                busy: uploading,
                disabled: submitDisabled,
              }}
              disabled={submitDisabled}
              onPress={() => void submitDocument()}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.blue },
                submitDisabled && styles.disabled,
                pressed && !submitDisabled && styles.pressed,
              ]}
            >
              {uploading ? (
                <>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.primaryButtonText}>
                    Uploading…
                  </Text>
                </>
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isNationalIdentity
                    ? "Submit National ID"
                    : "Submit document"}
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