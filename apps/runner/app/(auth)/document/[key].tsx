import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";

import {
  getRunnerOnboarding,
  uploadRunnerDocument,
  uploadRunnerNationalId,
} from "@/api";
import type { RunnerUploadedDocument } from "@/api";
import { useRunnerTheme } from "@/theme";

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
}: {
  title: string;
  description: string;
  file: PickedFile | null;
  colors: any;
  onCamera: () => void;
  onGallery: () => void;
}) {
  return (
    <View
      style={[
        styles.fileCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <Text style={[styles.fileTitle, { color: colors.text }]}>
        {title}
      </Text>

      <Text style={[styles.fileDescription, { color: colors.textMuted }]}>
        {description}
      </Text>

      {file ? (
        <View style={styles.previewContainer}>
          <Image
            source={{ uri: file.uri }}
            style={styles.previewImage}
          />

          <View style={styles.previewDetails}>
            <Text
              style={[styles.fileName, { color: colors.text }]}
              numberOfLines={2}
            >
              {file.name}
            </Text>

            <Text style={[styles.fileSelected, { color: colors.success }]}>
              Image selected
            </Text>
          </View>
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
          <Text style={[styles.emptyPreviewText, { color: colors.textMuted }]}>
            No image selected
          </Text>
        </View>
      )}

      <View style={styles.pickerActions}>
        <Pressable
          onPress={onCamera}
          style={[styles.secondaryButton, { borderColor: colors.border }]}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
            Take photo
          </Text>
        </Pressable>

        <Pressable
          onPress={onGallery}
          style={[styles.secondaryButton, { borderColor: colors.border }]}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
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

  const loadOnboarding = useCallback(async () => {
    setLoading(true);
    setPageError(null);

    try {
      const response = await getRunnerOnboarding();

      setRequirements(
        Array.isArray(response.requirements)
          ? response.requirements
          : [],
      );

      setDocuments(
        Array.isArray(response.documents)
          ? response.documents
          : [],
      );
    } catch (cause) {
      setPageError(
        cause instanceof Error
          ? cause.message
          : "Could not load your document requirements.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOnboarding();
  }, [loadOnboarding]);

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
      requirements.find((item) => item.key === (routeKey ?? "")),
    [requirements, routeKey],
  );

  const frontStatus = getStatus(documents, NATIONAL_ID_FRONT_KEY);
  const backStatus = getStatus(documents, NATIONAL_ID_BACK_KEY);
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

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const name =
        asset.fileName ??
        `${side}-${routeKey ?? "document"}-${Date.now()}.jpg`;
      const mimeType = getMimeType(name, asset.mimeType);

      if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
        setError("This image is larger than 10 MB. Choose a smaller image.");
        return;
      }

      if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
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

      router.replace("/(auth)/documents");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your document could not be submitted. Please try again.",
      );
    } finally {
      setUploading(false);
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
    (isNationalIdentity
      ? !frontFile || !backFile
      : !singleFile);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.paper }]}
      edges={["top", "bottom"]}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          disabled={uploading}
          onPress={goBack}
          style={styles.backButton}
        >
          <Text style={[styles.backText, { color: colors.blue }]}>
            ‹  Back
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.blue} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>
            Loading document requirement…
          </Text>
        </View>
      ) : pageError ? (
        <View style={styles.center}>
          <Text style={[styles.errorTitle, { color: colors.text }]}>
            Could not open this document
          </Text>

          <Text style={[styles.errorText, { color: colors.red }]}>
            {pageError}
          </Text>

          <Pressable
            onPress={() => void loadOnboarding()}
            style={[styles.primaryButton, { backgroundColor: colors.blue }]}
          >
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : !documentExists ? (
        <View style={styles.center}>
          <Text style={[styles.errorTitle, { color: colors.text }]}>
            Requirement not found
          </Text>

          <Text style={[styles.bodyText, { color: colors.textMuted }]}>
            This document is not part of your current onboarding requirements.
          </Text>

          <Pressable
            onPress={goBack}
            style={[styles.primaryButton, { backgroundColor: colors.blue }]}
          >
            <Text style={styles.primaryButtonText}>Back</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headingBlock}>
            <Text style={[styles.eyebrow, { color: colors.blue }]}>
              RUNNER VERIFICATION
            </Text>

            <Text style={[styles.title, { color: colors.text }]}>
              {isNationalIdentity ? "National ID" : singleTitle}
            </Text>

            <Text style={[styles.bodyText, { color: colors.textMuted }]}>
              {isNationalIdentity
                ? "Submit both sides of your National ID together. Make sure the details are clear and all edges are visible."
                : singleDescription}
            </Text>
          </View>

          {locked ? (
            <View
              style={[
                styles.statusCard,
                { backgroundColor: colors.blueSoft },
              ]}
            >
              <Text style={[styles.statusTitle, { color: colors.text }]}>
                {isNationalIdentity
                  ? "National ID already submitted"
                  : "Document already submitted"}
              </Text>

              <Text style={[styles.bodyText, { color: colors.textMuted }]}>
                {isNationalIdentity
                  ? `Front: ${statusLabel(frontStatus)} · Back: ${statusLabel(backStatus)}`
                  : statusLabel(singleStatus)}
                . You can upload a replacement if the review team rejects it.
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
                      <Text
                        style={[
                          styles.rejectionTitle,
                          { color: colors.red },
                        ]}
                      >
                        National ID changes requested
                      </Text>

                      {frontRejectionReason ? (
                        <Text
                          style={[
                            styles.rejectionText,
                            { color: colors.text },
                          ]}
                        >
                          Front: {frontRejectionReason}
                        </Text>
                      ) : null}

                      {backRejectionReason ? (
                        <Text
                          style={[
                            styles.rejectionText,
                            { color: colors.text },
                          ]}
                        >
                          Back: {backRejectionReason}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                  <PickedFileCard
                    title="Front of National ID"
                    description="Capture the side showing your photograph and personal details."
                    file={frontFile}
                    colors={colors}
                    onCamera={() => void pickImage("front", "camera")}
                    onGallery={() => void pickImage("front", "gallery")}
                  />

                  <PickedFileCard
                    title="Back of National ID"
                    description="Capture the reverse side, including the printed details."
                    file={backFile}
                    colors={colors}
                    onCamera={() => void pickImage("back", "camera")}
                    onGallery={() => void pickImage("back", "gallery")}
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
                      <Text
                        style={[
                          styles.rejectionTitle,
                          { color: colors.red },
                        ]}
                      >
                        Changes requested
                      </Text>

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
                    onCamera={() => void pickImage("single", "camera")}
                    onGallery={() => void pickImage("single", "gallery")}
                  />
                </>
              )}
            </>
          )}

          <View
            style={[
              styles.guidanceCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.guidanceTitle, { color: colors.text }]}>
              Before submitting
            </Text>

            <Text style={[styles.guidanceText, { color: colors.textMuted }]}>
              • Use a genuine, unaltered document.
              {"\n"}• Make sure the writing is sharp and readable.
              {"\n"}• Avoid glare, shadows and cropped edges.
              {"\n"}• Use JPEG, PNG or WEBP images up to 10 MB each.
            </Text>
          </View>

          {error ? (
            <View
              style={[
                styles.errorCard,
                { backgroundColor: colors.dangerSoft },
              ]}
            >
              <Text style={[styles.errorText, { color: colors.red }]}>
                {error}
              </Text>
            </View>
          ) : null}

          {locked ? (
            <Pressable
              onPress={goBack}
              style={[styles.primaryButton, { backgroundColor: colors.blue }]}
            >
              <Text style={styles.primaryButtonText}>Back</Text>
            </Pressable>
          ) : (
            <Pressable
              disabled={submitDisabled}
              onPress={() => void submitDocument()}
              style={[
                styles.primaryButton,
                {
                  backgroundColor: submitDisabled
                    ? colors.muted
                    : colors.blue,
                },
              ]}
            >
              {uploading ? (
                <ActivityIndicator color="#FFFFFF" />
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
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 6,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: 8,
  },
  backText: {
    fontSize: 15,
    fontWeight: "700",
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 36,
    gap: 18,
  },
  headingBlock: {
    gap: 9,
    marginBottom: 4,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.3,
  },
  title: {
    fontSize: 29,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 21,
  },
  fileCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  fileTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  fileDescription: {
    fontSize: 13,
    lineHeight: 19,
  },
  emptyPreview: {
    minHeight: 90,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyPreviewText: {
    fontSize: 13,
    fontWeight: "600",
  },
  previewContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 90,
  },
  previewImage: {
    width: 84,
    height: 84,
    borderRadius: 10,
    backgroundColor: "#E6EAF0",
  },
  previewDetails: {
    flex: 1,
    gap: 6,
  },
  fileName: {
    fontSize: 13,
    fontWeight: "600",
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
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  rejectionCard: {
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  rejectionTitle: {
    fontSize: 13,
    fontWeight: "900",
  },
  rejectionText: {
    fontSize: 12,
    lineHeight: 19,
  },
  guidanceCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  guidanceTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  guidanceText: {
    fontSize: 13,
    lineHeight: 22,
  },
  statusCard: {
    borderRadius: 16,
    padding: 16,
    gap: 7,
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  errorCard: {
    borderRadius: 12,
    padding: 13,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    marginTop: 4,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
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
  },
  errorTitle: {
    fontSize: 19,
    fontWeight: "800",
    textAlign: "center",
  },
});