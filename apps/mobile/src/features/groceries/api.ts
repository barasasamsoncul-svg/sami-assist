
import { File as ExpoFile } from "expo-file-system";

import { apiRequest } from "@/api";

import type {
  CreateGroceryErrandInput,
  GroceryCreateResponse,
  GroceryOrder,
  GroceryOrdersResponse,
  GroceryPhoto,
} from "./types";

export async function getGroceryOrders(): Promise<GroceryOrder[]> {
  const response = await apiRequest<GroceryOrdersResponse>(
    "/api/groceries",
    {
      method: "GET",
    },
  );

  return response.orders ?? [];
}

export async function createGroceryErrand(
  input: CreateGroceryErrandInput,
): Promise<GroceryCreateResponse> {
  return apiRequest<GroceryCreateResponse>(
    "/api/groceries",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
}

export async function uploadGroceryPhotos(
  errandId: string,
  photos: GroceryPhoto[],
): Promise<void> {
  if (!errandId.trim()) {
    throw new Error("A valid errand ID is required.");
  }

  if (photos.length === 0) {
    return;
  }

  const form = new FormData();

  for (const photo of photos) {
    if (!photo.uri.trim()) {
      throw new Error("One of the selected photos is unavailable.");
    }

    const file = new ExpoFile(photo.uri);

    form.append(
      "photos",
      file,
      photo.name || "grocery-request-photo.jpg",
    );
  }

  await apiRequest(
    `/api/groceries/${encodeURIComponent(errandId)}/photos`,
    {
      method: "POST",
      body: form,
    },
  );
}
