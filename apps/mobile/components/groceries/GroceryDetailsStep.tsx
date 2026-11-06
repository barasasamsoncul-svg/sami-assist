
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";

import MapPicker, {
  type MapPoint,
} from "@/components/MapPicker";

import { locationGet } from "@/api";
import { useSaMiTheme } from "@/theme";

import type {
  GroceryLocation,
  GroceryPhoto,
} from "@/features/groceries/types";

import type {
  GroceryValidationErrors,
} from "@/features/groceries/validation";

type GroceryDetailsStepProps = {
  description: string;
  onDescriptionChange: (value: string) => void;
  photos: GroceryPhoto[];
  onPhotosChange: (photos: GroceryPhoto[]) => void;
  pickup: GroceryLocation;
  onPickupChange: (location: GroceryLocation) => void;
  delivery: GroceryLocation;
  onDeliveryChange: (location: GroceryLocation) => void;
  onContinue: () => void;
  errors?: GroceryValidationErrors;
};

type LocationTarget = "pickup" | "delivery";
type MapPickerSlot = "pickup" | "destination";

type AddressSearchResult = {
  point: MapPoint;
  label: string;
};

type NativeAddress = {
  name?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  district?: string | null;
  subregion?: string | null;
  city?: string | null;
  region?: string | null;
};

const MAX_PHOTOS = 5;
const MAX_DESCRIPTION_LENGTH = 2000;

function coordinatesLabel(point: MapPoint): string {
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}

function isValidPoint(point: MapPoint): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180
  );
}

function formatNativeAddress(
  address?: NativeAddress | null,
): string {
  if (!address) return "";

  const street = [
    address.streetNumber,
    address.street,
  ]
    .filter(Boolean)
    .join(" ");

  const parts = [
    address.name,
    street,
    address.district,
    address.subregion,
    address.city,
    address.region,
  ].filter((part): part is string => Boolean(part?.trim()));

  const uniqueParts = parts.filter(
    (part, index) =>
      parts.findIndex(
        (candidate) =>
          candidate.toLowerCase() === part.toLowerCase(),
      ) === index,
  );

  return uniqueParts.join(", ");
}

export default function GroceryDetailsStep({
  description,
  onDescriptionChange,
  photos,
  onPhotosChange,
  pickup,
  onPickupChange,
  delivery,
  onDeliveryChange,
  onContinue,
  errors = {},
}: GroceryDetailsStepProps) {
  const { colors, common, mode } = useSaMiTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.paper,
        },
        content: {
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 38,
          gap: 20,
        },
        heading: {
          gap: 7,
          marginBottom: 2,
        },
        title: {
          color: colors.text,
          fontSize: 25,
          fontWeight: "800",
          letterSpacing: -0.5,
        },
        subtitle: {
          color: colors.textMuted,
          fontSize: 13,
          lineHeight: 20,
        },
        section: {
          padding: 16,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 18,
          backgroundColor: colors.surface,
          gap: 12,
        },
        sectionHeading: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        },
        sectionHeadingText: {
          flex: 1,
          gap: 3,
        },
        label: {
          color: colors.text,
          fontSize: 14,
          fontWeight: "700",
        },
        helperText: {
          color: colors.textMuted,
          fontSize: 11,
          lineHeight: 17,
        },
        descriptionInput: {
          minHeight: 142,
          textAlignVertical: "top",
          lineHeight: 21,
        },
        descriptionFooter: {
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10,
        },
        characterCount: {
          color: colors.textMuted,
          fontSize: 11,
          fontVariant: ["tabular-nums"],
        },
        errorText: {
          color: colors.red,
          fontSize: 12,
          lineHeight: 18,
        },
        addPhotoButton: {
          minHeight: 38,
          paddingHorizontal: 13,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.blue,
          backgroundColor: colors.blueSoft,
          justifyContent: "center",
          alignItems: "center",
        },
        addPhotoText: {
          color: colors.navy,
          fontSize: 12,
          fontWeight: "800",
        },
        disabled: {
          opacity: 0.45,
        },
        photoPlaceholder: {
          minHeight: 125,
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: colors.border,
          borderRadius: 13,
          backgroundColor: colors.paper,
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          gap: 5,
        },
        photoPlaceholderIcon: {
          color: colors.blue,
          fontSize: 27,
          fontWeight: "500",
        },
        photoPlaceholderTitle: {
          color: colors.text,
          fontSize: 13,
          fontWeight: "700",
        },
        photoPlaceholderText: {
          color: colors.textMuted,
          fontSize: 11,
          textAlign: "center",
        },
        photoGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 11,
        },
        photoItem: {
          width: 82,
          height: 82,
          borderRadius: 11,
          backgroundColor: colors.paper,
        },
        photo: {
          width: "100%",
          height: "100%",
          borderRadius: 11,
        },
        removePhoto: {
          position: "absolute",
          top: -7,
          right: -7,
          width: 25,
          height: 25,
          borderRadius: 13,
          backgroundColor: colors.navy,
          borderWidth: 2,
          borderColor: colors.surface,
          alignItems: "center",
          justifyContent: "center",
        },
        removePhotoText: {
          color: mode === "dark" ? "#081321" : "#FFFFFF",
          fontSize: 18,
          lineHeight: 20,
          fontWeight: "800",
        },
        locationChoices: {
          flexDirection: "row",
          gap: 10,
        },
        locationChoice: {
          flex: 1,
          minHeight: 67,
          flexDirection: "row",
          alignItems: "center",
          gap: 9,
          padding: 10,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceElevated,
        },
        locationChoiceActive: {
          borderColor: colors.blue,
          backgroundColor: colors.blueSoft,
        },
        locationIcon: {
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: colors.blue,
          alignItems: "center",
          justifyContent: "center",
        },
        locationIconText: {
          color: mode === "dark" ? "#081321" : "#FFFFFF",
          fontSize: 11,
          fontWeight: "900",
        },
        locationChoiceText: {
          flex: 1,
          gap: 3,
        },
        locationChoiceTitle: {
          color: colors.text,
          fontSize: 12,
          fontWeight: "800",
        },
        locationChoiceValue: {
          color: colors.textMuted,
          fontSize: 10,
        },
        mapInstruction: {
          color: colors.textMuted,
          fontSize: 12,
          lineHeight: 18,
        },
        mapContainer: {
          overflow: "hidden",
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
        },
        gpsButton: {
          minHeight: 46,
          borderWidth: 1,
          borderColor: colors.blue,
          borderRadius: 11,
          backgroundColor: colors.blueSoft,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 12,
        },
        gpsButtonText: {
          color: colors.navy,
          fontSize: 12,
          fontWeight: "800",
        },
        addressField: {
          gap: 7,
        },
        addressLabel: {
          color: colors.text,
          fontSize: 12,
          fontWeight: "700",
        },
        findAddressButton: {
          alignSelf: "flex-start",
          minHeight: 32,
          justifyContent: "center",
          paddingVertical: 5,
        },
        findAddressText: {
          color: colors.blue,
          fontSize: 12,
          fontWeight: "800",
        },
        selectedCoordinates: {
          color: colors.textMuted,
          fontSize: 11,
          lineHeight: 17,
        },
        continueButton: {
          ...common.primaryButton,
          minHeight: 54,
          borderRadius: 14,
          marginTop: 1,
        },
        continueButtonText: common.primaryButtonText,
      }),
    [colors, common, mode],
  );

  const [selecting, setSelecting] =
    useState<LocationTarget>("pickup");

  const [addressSearchBusy, setAddressSearchBusy] =
    useState<LocationTarget | "">("");

  const [gpsBusy, setGpsBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [photoError, setPhotoError] = useState("");

  const isBusy =
    gpsBusy || photoBusy || addressSearchBusy !== "";

  function updateLocation(
    target: LocationTarget,
    value: GroceryLocation,
  ) {
    if (target === "pickup") {
      onPickupChange(value);
    } else {
      onDeliveryChange(value);
    }

    setLocationError("");
  }

  function updateLocationLabel(
    target: LocationTarget,
    label: string,
  ) {
    const current = target === "pickup" ? pickup : delivery;

    updateLocation(target, {
      ...current,
      label,
      point: null,
    });
  }

  function handleMapPoint(
    target: LocationTarget,
    point: MapPoint,
  ) {
    if (!isValidPoint(point)) {
      setLocationError("The selected map location is invalid.");
      return;
    }

    updateLocation(target, {
      label: `Map pin (${coordinatesLabel(point)})`,
      point,
    });
  }

  function handleMapPickerPoint(
    slot: MapPickerSlot,
    point: MapPoint,
  ) {
    const target: LocationTarget =
      slot === "destination" ? "delivery" : "pickup";

    handleMapPoint(target, point);
  }

  async function searchAddress(target: LocationTarget) {
    const location = target === "pickup" ? pickup : delivery;
    const address = location.label.trim();

    if (address.length < 3) {
      setLocationError(
        `Enter a ${
          target === "pickup" ? "pickup" : "drop-off"
        } address or landmark first.`,
      );
      return;
    }

    setAddressSearchBusy(target);
    setLocationError("");

    try {
      const result = await locationGet<AddressSearchResult>({
        action: "geocode",
        q: address,
      });

      if (!result?.point || !isValidPoint(result.point)) {
        throw new Error(
          "SaMi could not identify that address. Try a nearby landmark.",
        );
      }

      updateLocation(target, {
        label: result.label?.trim() || address,
        point: result.point,
      });

      setSelecting(target);
    } catch (error) {
      setLocationError(
        error instanceof Error
          ? error.message
          : "Could not find that address. Please try another landmark.",
      );
    } finally {
      setAddressSearchBusy("");
    }
  }

  async function useCurrentLocation() {
    setGpsBusy(true);
    setLocationError("");

    try {
      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (!permission.granted) {
        throw new Error(
          "Allow location access or enter your pickup address manually.",
        );
      }

      const position =
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

      const point: MapPoint = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      if (!isValidPoint(point)) {
        throw new Error("Your device returned an invalid location.");
      }

      let label = `Current location (${coordinatesLabel(point)})`;

      try {
        const [address] = await Location.reverseGeocodeAsync({
          latitude: point.lat,
          longitude: point.lng,
        });

        const readableAddress = formatNativeAddress(address);

        if (readableAddress) {
          label = readableAddress;
        }
      } catch {
        // Keep the coordinate-based fallback.
      }

      updateLocation("pickup", {
        label,
        point,
      });

      setSelecting("pickup");
    } catch (error) {
      setLocationError(
        error instanceof Error
          ? error.message
          : "Could not get your current location.",
      );
    } finally {
      setGpsBusy(false);
    }
  }

  async function addPhotos() {
    setPhotoError("");

    if (photos.length >= MAX_PHOTOS) {
      setPhotoError(`You can attach up to ${MAX_PHOTOS} photos.`);
      return;
    }

    setPhotoBusy(true);

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        throw new Error(
          "Allow photo-library access to attach pictures.",
        );
      }

      const result =
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsMultipleSelection: true,
          selectionLimit: MAX_PHOTOS - photos.length,
          quality: 0.82,
        });

      if (result.canceled) return;

      const remaining = MAX_PHOTOS - photos.length;

      const selected: GroceryPhoto[] = result.assets
        .slice(0, remaining)
        .map((asset, index) => ({
          uri: asset.uri,
          name:
            asset.fileName ||
            `grocery-request-${Date.now()}-${index + 1}.jpg`,
          mimeType: asset.mimeType || "image/jpeg",
          size: asset.fileSize ?? null,
        }));

      if (selected.length === 0) return;

      onPhotosChange([...photos, ...selected]);
    } catch (error) {
      setPhotoError(
        error instanceof Error
          ? error.message
          : "Could not select photos.",
      );
    } finally {
      setPhotoBusy(false);
    }
  }

  function removePhoto(index: number) {
    onPhotosChange(
      photos.filter((_, photoIndex) => photoIndex !== index),
    );
    setPhotoError("");
  }

  const selectedPoint =
    selecting === "pickup" ? pickup.point : delivery.point;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heading}>
        <Text style={styles.title}>What do you need done?</Text>
        <Text style={styles.subtitle}>
          Describe the grocery task clearly. Your runner will use
          these instructions to shop for the items you requested.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Task description</Text>

        <TextInput
          value={description}
          onChangeText={onDescriptionChange}
          placeholder="Describe what you need. Include items, quantities, preferred brands, substitutions and any other instructions..."
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
          maxLength={MAX_DESCRIPTION_LENGTH}
          style={[
            common.input,
            styles.descriptionInput,
            errors.description ? { borderColor: colors.red } : null,
          ]}
          accessibilityLabel="Grocery errand description"
        />

        <View style={styles.descriptionFooter}>
          <View style={{ flex: 1 }}>
            {errors.description ? (
              <Text style={styles.errorText}>
                {errors.description}
              </Text>
            ) : (
              <Text style={styles.helperText}>
                Be as specific as possible. You can add photos below.
              </Text>
            )}
          </View>

          <Text style={styles.characterCount}>
            {description.length}/{MAX_DESCRIPTION_LENGTH}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <View style={styles.sectionHeadingText}>
            <Text style={styles.label}>Reference photos</Text>
            <Text style={styles.helperText}>
              Optional · Up to {MAX_PHOTOS} photos
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add photos"
            onPress={addPhotos}
            disabled={photoBusy || photos.length >= MAX_PHOTOS}
            style={[
              styles.addPhotoButton,
              (photoBusy || photos.length >= MAX_PHOTOS) &&
                styles.disabled,
            ]}
          >
            {photoBusy ? (
              <ActivityIndicator color={colors.blue} />
            ) : (
              <Text style={styles.addPhotoText}>+ Add photos</Text>
            )}
          </Pressable>
        </View>

        {photos.length > 0 ? (
          <View style={styles.photoGrid}>
            {photos.map((photo, index) => (
              <View
                key={`${photo.uri}-${index}`}
                style={styles.photoItem}
              >
                <Image
                  source={{ uri: photo.uri }}
                  style={styles.photo}
                  resizeMode="cover"
                  accessibilityLabel={`Grocery reference photo ${index + 1}`}
                />

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${index + 1}`}
                  onPress={() => removePhoto(index)}
                  style={styles.removePhoto}
                >
                  <Text style={styles.removePhotoText}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose a reference photo"
            onPress={addPhotos}
            disabled={photoBusy}
            style={styles.photoPlaceholder}
          >
            <Text style={styles.photoPlaceholderIcon}>＋</Text>
            <Text style={styles.photoPlaceholderTitle}>
              Add a reference photo
            </Text>
            <Text style={styles.photoPlaceholderText}>
              Help your runner identify the items you have in mind.
            </Text>
          </Pressable>
        )}

        {photoError ? (
          <Text accessibilityRole="alert" style={styles.errorText}>
            {photoError}
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeadingText}>
          <Text style={styles.label}>Pickup and drop-off</Text>
          <Text style={styles.helperText}>
            Choose where the errand starts and where your groceries
            should be delivered.
          </Text>
        </View>

        <View style={styles.locationChoices}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: selecting === "pickup" }}
            onPress={() => {
              setSelecting("pickup");
              setLocationError("");
            }}
            style={[
              styles.locationChoice,
              selecting === "pickup" && styles.locationChoiceActive,
            ]}
          >
            <View style={styles.locationIcon}>
              <Text style={styles.locationIconText}>P</Text>
            </View>

            <View style={styles.locationChoiceText}>
              <Text style={styles.locationChoiceTitle}>Pickup</Text>
              <Text style={styles.locationChoiceValue}>
                {pickup.point ? "Location selected" : "Not selected"}
              </Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: selecting === "delivery" }}
            onPress={() => {
              setSelecting("delivery");
              setLocationError("");
            }}
            style={[
              styles.locationChoice,
              selecting === "delivery" && styles.locationChoiceActive,
            ]}
          >
            <View style={styles.locationIcon}>
              <Text style={styles.locationIconText}>D</Text>
            </View>

            <View style={styles.locationChoiceText}>
              <Text style={styles.locationChoiceTitle}>Drop-off</Text>
              <Text style={styles.locationChoiceValue}>
                {delivery.point ? "Location selected" : "Not selected"}
              </Text>
            </View>
          </Pressable>
        </View>

        <Text style={styles.mapInstruction}>
          Select the {selecting === "pickup" ? "pickup" : "drop-off"}{" "}
          position on the map, or search for an address below.
        </Text>

        <View style={styles.mapContainer}>
          <MapPicker
            selecting={
              selecting === "delivery" ? "destination" : "pickup"
            }
            pickup={pickup.point}
            destination={delivery.point}
            route={[]}
            height={260}
            onPoint={handleMapPickerPoint}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={useCurrentLocation}
          disabled={gpsBusy}
          style={[
            styles.gpsButton,
            gpsBusy && styles.disabled,
          ]}
        >
          {gpsBusy ? (
            <ActivityIndicator color={colors.blue} />
          ) : (
            <Text style={styles.gpsButtonText}>
              Use my current location as pickup
            </Text>
          )}
        </Pressable>

        <View style={styles.addressField}>
          <Text style={styles.addressLabel}>Pickup address</Text>

          <TextInput
            value={pickup.label}
            onChangeText={(value) =>
              updateLocationLabel("pickup", value)
            }
            placeholder="Building, street, estate or landmark"
            placeholderTextColor={colors.textMuted}
            style={common.input}
            accessibilityLabel="Pickup address"
          />

          <Pressable
            accessibilityRole="button"
            disabled={addressSearchBusy === "pickup"}
            onPress={() => searchAddress("pickup")}
            style={styles.findAddressButton}
          >
            {addressSearchBusy === "pickup" ? (
              <ActivityIndicator color={colors.blue} />
            ) : (
              <Text style={styles.findAddressText}>
                Find pickup address on map
              </Text>
            )}
          </Pressable>

          {errors.pickup ? (
            <Text style={styles.errorText}>{errors.pickup}</Text>
          ) : null}
        </View>

        <View style={styles.addressField}>
          <Text style={styles.addressLabel}>Drop-off address</Text>

          <TextInput
            value={delivery.label}
            onChangeText={(value) =>
              updateLocationLabel("delivery", value)
            }
            placeholder="Building, street, estate or landmark"
            placeholderTextColor={colors.textMuted}
            style={common.input}
            accessibilityLabel="Drop-off address"
          />

          <Pressable
            accessibilityRole="button"
            disabled={addressSearchBusy === "delivery"}
            onPress={() => searchAddress("delivery")}
            style={styles.findAddressButton}
          >
            {addressSearchBusy === "delivery" ? (
              <ActivityIndicator color={colors.blue} />
            ) : (
              <Text style={styles.findAddressText}>
                Find drop-off address on map
              </Text>
            )}
          </Pressable>

          {errors.delivery ? (
            <Text style={styles.errorText}>{errors.delivery}</Text>
          ) : null}
        </View>

        {selectedPoint ? (
          <Text style={styles.selectedCoordinates}>
            Selected {selecting === "pickup" ? "pickup" : "drop-off"}{" "}
            map pin: {coordinatesLabel(selectedPoint)}
          </Text>
        ) : null}

        {locationError ? (
          <Text accessibilityRole="alert" style={styles.errorText}>
            {locationError}
          </Text>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onContinue}
        disabled={isBusy}
        style={[
          styles.continueButton,
          isBusy && styles.disabled,
        ]}
      >
        <Text style={styles.continueButtonText}>
          Continue to Preferences
        </Text>
      </Pressable>
    </ScrollView>
  );
}
