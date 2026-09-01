/**
 * StreamSnap AI — Image utilities
 *
 * Compress and encode images before sending to the Worker.
 * Target: ≤ 3 MB (LIMITS.MAX_IMAGE_BYTES in the Worker).
 */

import * as ImageManipulator from "expo-image-manipulator";

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB — matches worker limit
const TARGET_MAX_DIM = 1280; // resize longest edge to this

/** Compress a local image URI to a base64 data URL ready for /resolve */
export async function compressToBase64(uri: string): Promise<string> {
  // 1. Resize so the longest edge is ≤ TARGET_MAX_DIM
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: TARGET_MAX_DIM } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  const b64 = result.base64;
  if (!b64) throw new Error("Image manipulation returned no base64 data");

  // 2. Check size — if still too large, compress more aggressively
  const byteLength = (b64.length * 3) / 4;
  if (byteLength > MAX_BYTES) {
    const smaller = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 800 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    if (!smaller.base64) throw new Error("Image too large to compress");
    return `data:image/jpeg;base64,${smaller.base64}`;
  }

  return `data:image/jpeg;base64,${b64}`;
}

/** Extract a thumbnail (200px) for local storage in the catalog */
export async function makeThumbnail(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 200 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  if (!result.base64) throw new Error("Thumbnail generation failed");
  return `data:image/jpeg;base64,${result.base64}`;
}

/** Extract a crop region from an image URI */
export async function cropImage(
  uri: string,
  crop: { originX: number; originY: number; width: number; height: number }
): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ crop }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}
