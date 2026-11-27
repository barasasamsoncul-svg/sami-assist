import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  BackHandler,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";

import { Ionicons } from "@expo/vector-icons";

import {
  getRunnerOnboarding,
  uploadRunnerDocument,
  uploadRunnerNationalId,
} from "@/api";

import type {
  RunnerOnboardingData,
  RunnerUploadedDocument,
} from "@/api";

import { useRunnerTheme } from "@/theme";

const WORDMARK = require("../../../assets/sami-wordmark.png");

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
  requiresExpiry: boolean;
};

type UploadedDocument = Pick<
  RunnerUploadedDocument,
  "requirementKey" | "reviewStatus" | "rejectionReason"
>;

const NATIONAL_ID_FRONT_KEY = "identity_national_id_front";
const NATIONAL_ID_BACK_KEY = "identity_national_id_back";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const DOCUMENT_TITLES: Record<string, string> = {
  identity_profile_photo: "Profile photo",
  identity_kra_pin: "KRA PIN certificate",
  identity_good_conduct: "Police Clearance Certificate (Good Conduct)",
  motorcycle_driving_licence: "Driving licence",
  motorcycle_registration: "Motorcycle registration or logbook",
  motorcycle_insurance: "Motorcycle insurance",
  motorcycle_authorisation: "Vehicle owner authorisation",
  car_driving_licence: "Driving licence",
  car_registration: "Vehicle registration or logbook",
  car_insurance: "Vehicle insurance",
  car_authorisation: "Vehicle owner authorisation",
  van_driving_licence: "Driving licence",
  van_registration: "Vehicle registration or logbook",
  van_insurance: "Vehicle insurance",
  van_authorisation: "Vehicle owner authorisation",
};

const GUIDANCE_ITEMS = [
  "Use a genuine, unaltered document.",
  "Make sure the writing is sharp and readable.",
  "Avoid glare, shadows and cropped edges.",
  "Use a clear JPEG, PNG or WEBP image, or a PDF file, up to 10 MB.",
];

/**
 * Detect an expired, revoked or invalid Runner session.
 */
function isRunnerSessionExpired(cause: unknown): boolean {
  const message =
    cause instanceof Error
      ? cause.message
      : String(cause ?? "");

  return /HTTP 401|session has expired|sign in again|sign in to continue|no valid runner session|unauthorized/i.test(
    message,
  );
}

function formatExpiryInput(value: string): string {
  const digits = value.replace(/\\D/g, "").slice(0, 8);

  if (digits.length <= 2) return digits;
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function expiryInputToIso(value: string): string | null {
  const match = /^(\\d{2})\\/(\\d{2})\\/(\\d{4})$/.exec(value.trim());
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  const iso = `${match[3]}-${match[2]}-${match[1]}`;

  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const todayValues = Object.fromEntries(
    todayParts.map((part) => [part.type, part.value]),
  );

  const today = `${todayValues.year}-${todayValues.month}-${todayValues.day}`;

  return iso >= today ? iso : null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The onboarding API returns uploaded documents newest first.
 * The first matching record is therefore the current version.
 */
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

function statusLabel(
  status: UploadedDocument["reviewStatus"] | null,
): string {
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

function getMimeType(
  name: string,
  providedType?: string | null,
): string | null {
  const normalizedType = providedType?.trim().toLowerCase();

  if (
    normalizedType === "application/pdf" ||
    normalizedType === "application/x-pdf"
  ) {
    return "application/pdf";
  }

  if (normalizedType === "image/jpg") {
    return "image/jpeg";
  }

  if (
    ["image/jpeg", "image/png", "image/webp"].includes(
      normalizedType ?? "",
    )
  ) {
    return normalizedType!;
  }

  const extension = name.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "pdf":
      return "application/pdf";

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

/* ============================================================
   FILE PICKER CARD
============================================================ */

function PickedFileCard({
  title,
  description,
  file,
  colors,
  supportingText,
  actionBlue,
  onCamera,
  onGallery,
  onBrowse,
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
  onBrowse: () => void;
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
              shadowOffset: {
                width: 0,
                height: 3,
              },
            },
            android: {
              elevation: 1,
            },
            default: {},
          }),
      ]}
    >
      <Text
        style={[
          styles.fileTitle,
          { color: colors.text },
        ]}
      >
        {title}
      </Text>

      <Text
        style={[
          styles.fileDescription,
          { color: supportingText },
        ]}
      >
        {description}
      </Text>

      {file ? (
        <View style={styles.previewContainer}>
          {file.mimeType === "application/pdf" ? (
            <View
              style={[
                styles.previewFileIcon,
                { backgroundColor: colors.blueSoft },
              ]}
            >
              <Ionicons
                name="document-text-outline"
                size={36}
                color={actionBlue}
              />
            </View>
          ) : (
            <Image
              source={{ uri: file.uri }}
              style={[
                styles.previewImage,
                { backgroundColor: colors.paper },
              ]}
              accessibilityIgnoresInvertColors
            />
          )}

          <View style={styles.previewDetails}>
            <Text
              style={[
                styles.fileName,
                { color: colors.text },
              ]}
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
                {file.mimeType === "application/pdf"
                  ? "PDF selected"
                  : "Image selected"}
                {file.size
                  ? ` · ${formatFileSize(file.size)}`
                  : ""}
              </Text>
            </View>
          </View>

          {onClear ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove selected file"
              disabled={disabled}
              onPress={onClear}
              hitSlop={10}
              style={({ pressed }) => ({
                padding: 4,
                opacity: pressed
                  ? 0.55
                  : disabled
                    ? 0.5
                    : 1,
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
            name="document-text-outline"
            size={26}
            color={supportingText}
          />

          <Text
            style={[
              styles.emptyPreviewText,
              { color: supportingText },
            ]}
          >
            No file selected
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
              opacity: pressed
                ? 0.6
                : disabled
                  ? 0.5
                  : 1,
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
              opacity: pressed
                ? 0.6
                : disabled
                  ? 0.5
                  : 1,
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

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Browse files on this device"
          disabled={disabled}
          onPress={onBrowse}
          style={({ pressed }) => [
            styles.secondaryButton,
            {
              borderColor: colors.border,
              backgroundColor: colors.paper,
              opacity: pressed
                ? 0.6
                : disabled
                  ? 0.5
                  : 1,
            },
          ]}
        >
          <Ionicons
            name="folder-open-outline"
            size={17}
            color={colors.text}
          />

          <Text
            style={[
              styles.secondaryButtonText,
              { color: colors.text },
            ]}
          >
            Browse files
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ============================================================
   DOCUMENT DETAIL SCREEN
============================================================ */

export default function RunnerDocumentDetailScreen() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    key?: string | string[];
  }>();

  const { colors, mode, showOverlay } = useRunnerTheme();

  const isDark = mode === "dark";
  const supportingText = isDark ? "#C1CCDA" : "#526176";
  const actionBlue = isDark ? "#8AB8F8" : "#1F5EAB";
  const buttonBlue = isDark ? "#1D5DAD" : "#174F9F";

  const routeKey = Array.isArray(params.key)
    ? params.key[0]
    : params.key;

  const isNationalIdentity = routeKey === "national_identity";

  const [data, setData] = useState<RunnerOnboardingData | null>(null);

  const [frontFile, setFrontFile] = useState<PickedFile | null>(null);
  const [backFile, setBackFile] = useState<PickedFile | null>(null);
  const [singleFile, setSingleFile] = useState<PickedFile | null>(null);
  const [singleExpiryDate, setSingleExpiryDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const loadInFlightRef = useRef(false);
  const uploadInFlightRef = useRef(false);
  const pickerInFlightRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);

  /**
   * Return through the root launch route. The launch animation
   * completes before the signed-out destination opens Login.
   */
  const returnToLaunchForLogin = useCallback(() => {
    router.dismissAll();

    router.replace({
      pathname: "/",
      params: { signedOut: "1" },
    });
  }, [router]);

  function showError(
    message: string,
    title = "Something went wrong",
  ) {
    showOverlay({
      type: "error",
      title,
      message,
      primaryAction: {
        label: "Got it",
      },
    });
  }

  function showWarning(
    message: string,
    title = "Check your document",
  ) {
    showOverlay({
      type: "warning",
      title,
      message,
      primaryAction: {
        label: "Understood",
      },
    });
  }

  function showHelp() {
    showOverlay({
      type: "info",
      title: "SaMi Runner Help",
      message: isNationalIdentity
        ? "Upload a clear image or PDF for each side of your National ID. Both sides are submitted together. Make sure all details and edges are visible."
        : "Use Take photo to capture your document, Choose image to select an existing image, or Browse files to select a PDF or supported image. Upload a genuine, clear and readable document. JPEG, PNG and WEBP images and PDF files up to 10 MB are supported.",
      primaryAction: {
        label: "Got it",
      },
    });
  }

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* =========================================================
     LOAD ONBOARDING AND COMPLIANCE
  ========================================================= */

  const loadOnboarding = useCallback(async () => {
    if (loadInFlightRef.current) return;

    loadInFlightRef.current = true;

    if (!hasLoadedOnceRef.current) {
      setLoading(true);
    }

    setPageError(null);

    try {
      const response = await getRunnerOnboarding();

      if (!mountedRef.current) return;

      if (
        !response?.ok ||
        !response.runner ||
        !Array.isArray(response.requirements) ||
        !Array.isArray(response.documents)
      ) {
        throw new Error(
          "The server returned an invalid onboarding response.",
        );
      }

      // A document screen is only valid after task selection.
      if (response.nextStep === "tasks") {
        router.replace("/(auth)/tasks");
        return;
      }

      // A fully approved Runner belongs on the dashboard.
      if (response.nextStep === "dashboard") {
        router.replace("/(app)");
        return;
      }

      setData(response);
      hasLoadedOnceRef.current = true;
    } catch (cause) {
      if (!mountedRef.current) return;

      if (isRunnerSessionExpired(cause)) {
        returnToLaunchForLogin();
        return;
      }

      const message =
        cause instanceof Error
          ? cause.message
          : "Could not load your document requirements.";

      setPageError(message);

      showError(
        message,
        "Could not load document requirements",
      );
    } finally {
      loadInFlightRef.current = false;

      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [returnToLaunchForLogin, showOverlay]);

  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      void loadOnboarding();
    }, [loadOnboarding]),
  );

  /* =========================================================
     ANDROID BACK

     Always return to the Documents checklist.
     Do not clear or revoke the Runner session.
  ========================================================= */

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          if (uploading) return true;

          router.replace("/(auth)/documents");
          return true;
        },
      );

      return () => subscription.remove();
    }, [uploading, router]),
  );

  /* =========================================================
     CURRENT REQUIREMENTS AND UPLOADED DOCUMENTS
  ========================================================= */

  const requirements = useMemo(
    () =>
      (data?.requirements ?? []).filter(
        (item) => item.required === true,
      ),
    [data],
  );

  const documents: UploadedDocument[] =
    data?.documents ?? [];

  const frontRequirement = useMemo(
    () =>
      requirements.find(
        (item) => item.key === NATIONAL_ID_FRONT_KEY,
      ),
    [requirements],
  );

  const backRequirement = useMemo(
    () =>
      requirements.find(
        (item) => item.key === NATIONAL_ID_BACK_KEY,
      ),
    [requirements],
  );

  const singleRequirement = useMemo(
    () =>
      requirements.find(
        (item) => item.key === (routeKey ?? ""),
      ),
    [requirements, routeKey],
  );

  const frontStatus = getStatus(
    documents,
    NATIONAL_ID_FRONT_KEY,
  );

  const backStatus = getStatus(
    documents,
    NATIONAL_ID_BACK_KEY,
  );

  const singleStatus = routeKey
    ? getStatus(documents, routeKey)
    : null;

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

  const documentExists = isNationalIdentity
    ? Boolean(frontRequirement && backRequirement)
    : Boolean(singleRequirement);

  const singleTitle =
    singleRequirement?.title ??
    DOCUMENT_TITLES[routeKey ?? ""] ??
    "Document";

  const singleDescription =
    singleRequirement?.instructions ??
    "Upload a clear, readable image or PDF of this document.";

  const singleDocumentRequiresExpiry =
    !isNationalIdentity &&
    singleRequirement?.requiresExpiry === true;

  const singleExpiryIso =
    singleDocumentRequiresExpiry
      ? expiryInputToIso(singleExpiryDate)
      : null;

  /* =========================================================
     COMPLIANCE AND DOCUMENT LOCKS

     A pending document can be replaced, including while the
     overall application is under review.

     An approved document cannot be overwritten.

     National ID is uploaded as one paired transaction. If
     either side is already approved, the pair remains locked
     to protect that approved side.
  ========================================================= */

  const nextStep = data?.nextStep ?? "";

  const accountStatus = data?.runner.accountStatus ?? "";
  const verificationStatus =
    data?.runner.verificationStatus ?? "";

  const onboardingStatus = data?.onboardingStatus ?? "";

  const isApproved = nextStep === "dashboard";

  const isRestricted =
    nextStep === "restricted" ||
    ["suspended", "closed"].includes(accountStatus);

  const isPendingReview =
    nextStep === "documents" &&
    (
      data?.complianceStatus === "pending_review" ||
      onboardingStatus === "pending_review" ||
      verificationStatus === "submitted"
    );

  const sessionExpired =
    /HTTP 401|session has expired|sign in again|sign in to continue|no valid runner session|unauthorized/i.test(
      pageError ?? "",
    );

  const nationalIdentityDocumentApproved =
    frontStatus === "approved" ||
    backStatus === "approved";

  const singleDocumentApproved =
    singleStatus === "approved";

  const documentAlreadyApproved = isNationalIdentity
    ? nationalIdentityDocumentApproved
    : singleDocumentApproved;

  const accountReadOnly =
    isApproved || isRestricted;

  const locked =
    accountReadOnly ||
    documentAlreadyApproved ||
    sessionExpired;

  const canUpload =
    hasLoadedOnceRef.current &&
    !loading &&
    !uploading &&
    !pageError &&
    documentExists &&
    !locked;

  const frontRequirementReason =
    frontRejectionReason ||
    (frontStatus === "rejected" ||
    frontStatus === "resubmission_required"
      ? "SaMi Operations requested a replacement for this side."
      : null);

  const backRequirementReason =
    backRejectionReason ||
    (backStatus === "rejected" ||
    backStatus === "resubmission_required"
      ? "SaMi Operations requested a replacement for this side."
      : null);

  /* =========================================================
     NAVIGATION
  ========================================================= */

  function goBack() {
    if (uploading) return;

    router.replace("/(auth)/documents");
  }

  /* =========================================================
     FILE SELECTION
  ========================================================= */

  function clearFile(
    side: "front" | "back" | "single",
  ) {
    if (uploading) return;

    if (side === "front") {
      setFrontFile(null);
    } else if (side === "back") {
      setBackFile(null);
    } else {
      setSingleFile(null);
    }
  }

  const pickImage = async (
    side: "front" | "back" | "single",
    source: "camera" | "gallery",
  ) => {
    if (!canUpload || pickerInFlightRef.current) return;

    pickerInFlightRef.current = true;

    try {
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!mountedRef.current) return;

      if (!permission.granted) {
        showWarning(
          source === "camera"
            ? "Camera permission is required to take a document photo. Enable camera access in your device settings."
            : "Photo library permission is required to select an image. Enable photo access in your device settings.",
          "Permission required",
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

      if (
        !mountedRef.current ||
        result.canceled ||
        !result.assets?.length
      ) {
        return;
      }

      const asset = result.assets[0];

      const name =
        asset.fileName?.trim() ||
        `${side}-${routeKey ?? "document"}-${Date.now()}.jpg`;

      const mimeType = getMimeType(
        name,
        asset.mimeType,
      );

      if (
        asset.fileSize !== undefined &&
        asset.fileSize <= 0
      ) {
        showWarning(
          "The selected image is empty. Choose another image.",
          "Invalid image",
        );

        return;
      }

      if (
        asset.fileSize !== undefined &&
        asset.fileSize > MAX_FILE_SIZE
      ) {
        showWarning(
          "This image is larger than 10 MB. Choose a smaller image.",
          "Image too large",
        );

        return;
      }

      if (!mimeType) {
        showWarning(
          "Choose a JPEG, PNG or WEBP image. HEIC and other image formats are not supported.",
          "Unsupported image format",
        );

        return;
      }

      const extension =
        mimeType === "application/pdf"
          ? "pdf"
          : mimeType.split("/")[1] === "jpeg"
            ? "jpg"
            : mimeType.split("/")[1];

      const picked: PickedFile = {
        uri: asset.uri,
        name: name.includes(".")
          ? name
          : `${name}.${extension}`,
        mimeType,
        size: asset.fileSize,
      };

      if (side === "front") {
        setFrontFile(picked);
      } else if (side === "back") {
        setBackFile(picked);
      } else {
        setSingleFile(picked);
      }
    } catch (cause) {
      if (!mountedRef.current) return;

      showError(
        cause instanceof Error
          ? cause.message
          : "The image could not be selected.",
        "Image could not be selected",
      );
    } finally {
      pickerInFlightRef.current = false;
    }
  };

  const pickDocumentFile = async (
    side: "front" | "back" | "single",
  ) => {
    if (!canUpload || pickerInFlightRef.current) return;

    pickerInFlightRef.current = true;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "image/jpeg",
          "image/png",
          "image/webp",
          "application/pdf",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (
        !mountedRef.current ||
        result.canceled ||
        !result.assets?.length
      ) {
        return;
      }

      const asset = result.assets[0];

      const name =
        asset.name?.trim() ||
        `${side}-${routeKey ?? "document"}-${Date.now()}`;

      const mimeType = getMimeType(
        name,
        asset.mimeType,
      );

      if (asset.size != null && asset.size <= 0) {
        showWarning(
          "The selected file is empty. Choose another file.",
          "Invalid file",
        );

        return;
      }

      if (asset.size != null && asset.size > MAX_FILE_SIZE) {
        showWarning(
          "The selected file is larger than 10 MB. Choose a smaller file.",
          "File too large",
        );

        return;
      }

      if (!mimeType) {
        showWarning(
          "Choose a JPEG, PNG, WEBP or PDF document. Other formats are not supported.",
          "Unsupported file format",
        );

        return;
      }

      const extension =
        mimeType === "application/pdf"
          ? "pdf"
          : mimeType.split("/")[1] === "jpeg"
            ? "jpg"
            : mimeType.split("/")[1];

      const picked: PickedFile = {
        uri: asset.uri,
        name: name.includes(".")
          ? name
          : `${name}.${extension}`,
        mimeType,
        size: asset.size ?? undefined,
      };

      if (side === "front") {
        setFrontFile(picked);
      } else if (side === "back") {
        setBackFile(picked);
      } else {
        setSingleFile(picked);
      }
    } catch (cause) {
      if (!mountedRef.current) return;

      showError(
        cause instanceof Error
          ? cause.message
          : "The selected file could not be opened.",
        "File could not be selected",
      );
    } finally {
      pickerInFlightRef.current = false;
    }
  };

  /* =========================================================
     UPLOAD DOCUMENT OR REPLACEMENT
  ========================================================= */

  const submitDocument = async () => {
    if (!canUpload || uploadInFlightRef.current) return;

    if (isNationalIdentity) {
      if (!frontFile || !backFile) {
        showWarning(
          "Select both the front and back of your National ID.",
          "National ID incomplete",
        );

        return;
      }

      if (!frontRequirement || !backRequirement) {
        showError(
          "The National ID requirements could not be loaded.",
          "Requirements unavailable",
        );

        return;
      }

      // Protect an approved side from being overwritten by
      // the paired National ID upload.
      if (nationalIdentityDocumentApproved) {
        showWarning(
          "One side of your National ID has already been approved. Contact SaMi Operations if that approved document needs to be corrected.",
          "National ID already approved",
        );

        return;
      }
    } else {
      if (!routeKey || !singleRequirement) {
        showError(
          "This document requirement could not be found.",
          "Requirement not found",
        );

        return;
      }

      if (!singleFile) {
        showWarning(
          "Choose an image or PDF of this document before submitting.",
          "Document required",
        );

        return;
      }

      if (singleStatus === "approved") {
        showWarning(
          "This document has already been approved and cannot be replaced from the Runner app.",
          "Document already approved",
        );

        return;
      }

      if (singleDocumentRequiresExpiry && !singleExpiryIso) {
        showWarning(
          "Enter a valid expiry date from the document. Use DD/MM/YYYY and make sure the date is today or later.",
          "Document expiry required",
        );

        return;
      }
    }

    uploadInFlightRef.current = true;
    setUploading(true);

    try {
      if (isNationalIdentity && frontFile && backFile) {
        const result = await uploadRunnerNationalId({
          front: toApiFile(frontFile),
          back: toApiFile(backFile),
        });

        const keys = new Set(
          (result.documents ?? []).map(
            (item) => item.requirementKey,
          ),
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
          validUntil: singleExpiryIso,
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

      // Return directly to the checklist. The newest document
      // version will be loaded from the backend there.
      router.replace("/(auth)/documents");
    } catch (cause) {
      if (!mountedRef.current) return;

      if (isRunnerSessionExpired(cause)) {
        returnToLaunchForLogin();
        return;
      }

      const message =
        cause instanceof Error
          ? cause.message
          : "Your document could not be submitted. Please try again.";

      showError(message, "Document upload failed");

      if (
        /already approved|operations review|cannot upload|account cannot upload/i.test(
          message,
        )
      ) {
        void loadOnboarding();
      }
    } finally {
      uploadInFlightRef.current = false;

      if (mountedRef.current) {
        setUploading(false);
      }
    }
  };

  const submitDisabled =
    !canUpload ||
    (isNationalIdentity
      ? !frontFile || !backFile
      : !singleFile ||
        (singleDocumentRequiresExpiry && !singleExpiryIso));

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: colors.paper },
      ]}
      edges={["top", "bottom"]}
    >
      <Stack.Screen
        options={{
          gestureEnabled: false,
          headerBackVisible: false,
        }}
      />

      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
      />

      {/* HEADER — LOGO LEFT, HELP RIGHT */}
      <View style={styles.header}>
        <Image
          source={WORDMARK}
          resizeMode="contain"
          style={styles.wordmark}
          accessibilityLabel="SaMi"
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="SaMi Runner Help"
          onPress={showHelp}
          style={({ pressed }) => [
            styles.helpButton,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
              opacity: pressed ? 0.65 : 1,
            },
          ]}
        >
          <Ionicons
            name="help-circle-outline"
            size={17}
            color={actionBlue}
          />

          <Text
            style={[
              styles.helpText,
              { color: colors.text },
            ]}
          >
            Help
          </Text>
        </Pressable>
      </View>

      {/* LOADING */}
      {loading ? (
        <View
          style={styles.center}
          accessibilityRole="progressbar"
          accessibilityLabel="Loading document requirement"
        >
          <ActivityIndicator
            size="large"
            color={actionBlue}
          />

          <Text
            style={[
              styles.loadingText,
              { color: supportingText },
            ]}
          >
            Loading document requirement…
          </Text>
        </View>
      ) : pageError ? (
        /* ERROR */
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

          <Text
            style={[
              styles.errorTitle,
              { color: colors.text },
            ]}
          >
            {sessionExpired
              ? "Sign in again"
              : "Could not open this document"}
          </Text>

          <Text
            style={[
              styles.bodyText,
              { color: supportingText },
            ]}
            numberOfLines={4}
          >
            {sessionExpired
              ? "Your saved application remains on your account. Sign in again to continue."
              : "The issue has been shown in the SaMi notification. Check your connection and try again."}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              sessionExpired
                ? "Sign in again"
                : "Try again"
            }
            onPress={() =>
              sessionExpired
                ? returnToLaunchForLogin()
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
        /* INVALID REQUIREMENT */
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
              color={actionBlue}
            />
          </View>

          <Text
            style={[
              styles.errorTitle,
              { color: colors.text },
            ]}
          >
            Requirement not found
          </Text>

          <Text
            style={[
              styles.bodyText,
              { color: supportingText },
            ]}
          >
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
            <Text style={styles.primaryButtonText}>
              Back
            </Text>
          </Pressable>
        </View>
      ) : (
        /* DOCUMENT FORM */
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headingBlock}>
            <Text
              style={[
                styles.eyebrow,
                { color: actionBlue },
              ]}
            >
              RUNNER VERIFICATION
            </Text>

            <Text
              style={[
                styles.title,
                { color: colors.text },
              ]}
            >
              {isNationalIdentity ? "National ID" : singleTitle}
            </Text>

            <Text
              style={[
                styles.bodyText,
                { color: supportingText },
              ]}
            >
              {isNationalIdentity
                ? "Submit both sides of your National ID together as clear images or PDFs. Make sure the details are readable and all edges are visible."
                : singleDescription}
            </Text>
          </View>

          {/* SESSION EXPIRED */}
          {sessionExpired ? (
            <View
              style={[
                styles.stateNotice,
                { backgroundColor: colors.dangerSoft },
              ]}
            >
              <Ionicons
                name="lock-closed-outline"
                size={21}
                color={colors.red}
              />

              <View style={styles.stateNoticeCopy}>
                <Text
                  style={[
                    styles.stateNoticeTitle,
                    { color: colors.text },
                  ]}
                >
                  Runner session expired
                </Text>

                <Text
                  style={[
                    styles.stateNoticeText,
                    { color: supportingText },
                  ]}
                >
                  Sign in again to continue uploading documents. Your saved application remains on your account.
                </Text>

                <Pressable
                  onPress={returnToLaunchForLogin}
                  hitSlop={8}
                >
                  <Text
                    style={[
                      styles.stateNoticeAction,
                      { color: actionBlue },
                    ]}
                  >
                    Sign in again
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : isApproved ? (
            /* ACCOUNT APPROVED */
            <View
              style={[
                styles.stateNotice,
                { backgroundColor: colors.successSoft },
              ]}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={21}
                color={colors.success}
              />

              <View style={styles.stateNoticeCopy}>
                <Text
                  style={[
                    styles.stateNoticeTitle,
                    { color: colors.text },
                  ]}
                >
                  Runner account approved
                </Text>

                <Text
                  style={[
                    styles.stateNoticeText,
                    { color: supportingText },
                  ]}
                >
                  Documents are read-only after approval. You can return to the Runner dashboard.
                </Text>

                <Pressable
                  onPress={() => router.replace("/(app)")}
                  hitSlop={8}
                >
                  <Text
                    style={[
                      styles.stateNoticeAction,
                      { color: actionBlue },
                    ]}
                  >
                    Open Runner dashboard
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : isRestricted ? (
            /* ACCOUNT RESTRICTED */
            <View
              style={[
                styles.stateNotice,
                { backgroundColor: colors.dangerSoft },
              ]}
            >
              <Ionicons
                name="lock-closed-outline"
                size={21}
                color={colors.red}
              />

              <View style={styles.stateNoticeCopy}>
                <Text
                  style={[
                    styles.stateNoticeTitle,
                    { color: colors.text },
                  ]}
                >
                  Account access restricted
                </Text>

                <Text
                  style={[
                    styles.stateNoticeText,
                    { color: supportingText },
                  ]}
                >
                  Document uploads are unavailable for this account. Contact SaMi Operations for assistance.
                </Text>
              </View>
            </View>
          ) : isPendingReview ? (
            /* APPLICATION UNDER REVIEW
               Replacements are permitted while the application
               is waiting for an Operations decision.
            */
            <View
              style={[
                styles.stateNotice,
                { backgroundColor: colors.warningSoft },
              ]}
            >
              <Ionicons
                name="time-outline"
                size={21}
                color={colors.warning}
              />

              <View style={styles.stateNoticeCopy}>
                <Text
                  style={[
                    styles.stateNoticeTitle,
                    { color: colors.text },
                  ]}
                >
                  Application under review
                </Text>

                <Text
                  style={[
                    styles.stateNoticeText,
                    { color: supportingText },
                  ]}
                >
                  Your application is being reviewed. You can still replace this document if you uploaded the wrong file. The replacement will become the latest version for Operations to review.
                </Text>
              </View>
            </View>
          ) : null}

          {/* DOCUMENT ALREADY APPROVED */}
          {documentAlreadyApproved && !isApproved ? (
            <View
              style={[
                styles.statusCard,
                { backgroundColor: colors.successSoft },
              ]}
            >
              <View style={styles.statusHeader}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={20}
                  color={colors.success}
                />

                <Text
                  style={[
                    styles.statusTitle,
                    { color: colors.text },
                  ]}
                >
                  {isNationalIdentity
                    ? "National ID contains an approved side"
                    : "Document already approved"}
                </Text>
              </View>

              <Text
                style={[
                  styles.bodyText,
                  { color: supportingText },
                ]}
              >
                {isNationalIdentity
                  ? `Front: ${statusLabel(frontStatus)} · Back: ${statusLabel(backStatus)}.`
                  : `${statusLabel(singleStatus)}.`}{" "}
                Approved documents cannot be replaced from the Runner app.
                Contact SaMi Operations if an approved document needs correction.
              </Text>
            </View>
          ) : null}

          {/* NATIONAL ID REJECTION FEEDBACK */}
          {!locked && isNationalIdentity ? (
            <>
              {frontRequirementReason || backRequirementReason ? (
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

                  {frontRequirementReason ? (
                    <Text
                      style={[
                        styles.rejectionText,
                        { color: colors.text },
                      ]}
                    >
                      <Text style={{ fontWeight: "800" }}>
                        Front:{" "}
                      </Text>
                      {frontRequirementReason}
                    </Text>
                  ) : null}

                  {backRequirementReason ? (
                    <Text
                      style={[
                        styles.rejectionText,
                        { color: colors.text },
                      ]}
                    >
                      <Text style={{ fontWeight: "800" }}>
                        Back:{" "}
                      </Text>
                      {backRequirementReason}
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
                onBrowse={() => void pickDocumentFile("front")}
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
                onBrowse={() => void pickDocumentFile("back")}
                onClear={() => clearFile("back")}
              />
            </>
          ) : null}

          {/* SINGLE DOCUMENT */}
          {!locked && !isNationalIdentity ? (
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
                supportingText={supportingText}
                actionBlue={actionBlue}
                disabled={uploading || !canUpload}
                onCamera={() => void pickImage("single", "camera")}
                onGallery={() => void pickImage("single", "gallery")}
                onBrowse={() => void pickDocumentFile("single")}
                onClear={() => clearFile("single")}
              />

              {singleDocumentRequiresExpiry ? (
                <View
                  style={[
                    styles.expiryField,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.expiryLabel,
                      { color: colors.text },
                    ]}
                  >
                    Document expiry date
                  </Text>

                  <Text
                    style={[
                      styles.expiryHint,
                      { color: supportingText },
                    ]}
                  >
                    Enter the expiry date printed on this document.
                  </Text>

                  <TextInput
                    value={singleExpiryDate}
                    onChangeText={(value) =>
                      setSingleExpiryDate(formatExpiryInput(value))
                    }
                    placeholder="DD/MM/YYYY"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={10}
                    editable={!uploading && canUpload}
                    accessibilityLabel="Document expiry date, day month year"
                    style={[
                      styles.expiryInput,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.paper,
                      },
                    ]}
                  />

                  <Text
                    style={[
                      styles.expiryHint,
                      {
                        color: singleExpiryDate.length === 10 && !singleExpiryIso
                          ? colors.red
                          : supportingText,
                      },
                    ]}
                  >
                    {singleExpiryDate.length === 10 && !singleExpiryIso
                      ? "Enter a real date that has not passed."
                      : "This date is required before you can submit the document."}
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}

          {/* UPLOAD GUIDANCE */}
          {!locked && !sessionExpired ? (
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
                style={[
                  styles.guidanceTitle,
                  { color: colors.text },
                ]}
              >
                Before submitting
              </Text>

              <View style={styles.guidanceList}>
                {GUIDANCE_ITEMS.map((item) => (
                  <View
                    key={item}
                    style={styles.guidanceRow}
                  >
                    <View
                      style={[
                        styles.guidanceDot,
                        { backgroundColor: actionBlue },
                      ]}
                    />

                    <Text
                      style={[
                        styles.guidanceText,
                        { color: supportingText },
                      ]}
                    >
                      {item}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* ACTION */}
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
              <Text style={styles.primaryButtonText}>
                Back to documents
              </Text>
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
              accessibilityHint="Uploads the selected image or PDF files to SaMi Runner verification"
              accessibilityState={{
                busy: uploading,
                disabled: submitDisabled,
              }}
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
                  <ActivityIndicator
                    color="#FFFFFF"
                    size="small"
                  />

                  <Text style={styles.primaryButtonText}>
                    Uploading…
                  </Text>
                </>
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isNationalIdentity
                    ? "Submit National ID"
                    : singleStatus === "pending" ||
                        singleStatus === "rejected" ||
                        singleStatus === "resubmission_required"
                      ? "Upload replacement"
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

/* ============================================================
   STYLES
============================================================ */

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },

  header: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
  },

  wordmark: {
    width: 116,
    height: 38,
  },

  helpButton: {
    minHeight: 38,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },

  helpText: {
    fontSize: 12,
    fontWeight: "800",
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
    gap: 18,
  },

  headingBlock: {
    gap: 9,
    marginBottom: 2,
  },

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

  previewFileIcon: {
    width: 84,
    height: 84,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
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
    flexWrap: "wrap",
    gap: 10,
  },

  secondaryButton: {
    flex: 1,
    flexBasis: "47%",
    minWidth: 125,
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

  expiryField: {
    borderWidth: 1,
    borderRadius: 15,
    padding: 15,
    gap: 8,
  },

  expiryLabel: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
  },

  expiryHint: {
    fontSize: 12,
    lineHeight: 17,
  },

  expiryInput: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 1,
  },

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

  disabled: {
    opacity: 0.45,
  },

  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
});