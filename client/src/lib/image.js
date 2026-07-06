// Turn a photo picked by the user (File/Blob from an <input type="file">)
// into a small inline image for AI analysis.
//
// Preferred path: decode in the browser and downscale to a ~1024px JPEG.
// Phone cameras produce 3-10 MB originals; ~1024px keeps every food
// identifiable at ~100-300 KB, well under the server's body cap and quick to
// upload on mobile data. Re-encoding also strips EXIF metadata (GPS etc.) —
// only the pixels leave the device.
//
// Fallback path: many phones save camera shots as HEIC/HEIF ("high
// efficiency" mode), which browsers can't decode, so the canvas route fails.
// The AI vision models read HEIC/HEIF natively, so for those we send the
// original bytes untouched (size-capped). No thumbnail is possible then —
// previewUrl is null and the UI shows a generic "photo attached" chip.

// Keeps the base64 payload (~4/3 × bytes) under the server's 4M-char cap.
const MAX_RAW_BYTES = 2_900_000;

const FRIENDLY_DECODE_ERROR =
  "Couldn't read that photo — take it again, or just type what you ate instead.";

export async function fileToInlineImage(file, maxDim = 1024, quality = 0.8) {
  const source = await decodeImage(file);
  if (source) {
    try {
      return downscaleToJpeg(source, maxDim, quality);
    } finally {
      source.close?.();
    }
  }

  // Browser can't decode it. If it's a HEIC/HEIF camera shot, hand the
  // original bytes to the AI; anything else undecodable is a corrupt or
  // non-image file.
  const mimeType = await sniffHeic(file);
  if (!mimeType) throw new Error(FRIENDLY_DECODE_ERROR);
  if (file.size > MAX_RAW_BYTES)
    throw new Error(
      "That photo is too large to send as-is — take it again, or type what you ate instead."
    );
  return { mimeType, data: await blobToBase64(file), previewUrl: null };
}

// Decode with createImageBitmap when available — it's fastest and honours the
// EXIF orientation flag, so phone photos aren't analysed sideways. Fall back
// to an <img> element for older browsers. Resolves null when undecodable.
async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* options bag unsupported, or format undecodable — try below */
    }
    try {
      return await createImageBitmap(file);
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function downscaleToJpeg(source, maxDim, quality) {
  const w = source.width || source.naturalWidth;
  const h = source.height || source.naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return {
    mimeType: "image/jpeg",
    data: dataUrl.slice(dataUrl.indexOf(",") + 1),
    previewUrl: dataUrl,
  };
}

// HEIC/HEIF detection by container magic, not file.type — camera apps often
// report an empty or generic mime type. ISO-BMFF files carry "ftyp" at byte 4
// followed by a brand code identifying the flavour.
async function sniffHeic(file) {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (head.length < 12) return null;
  const ascii = (from, to) => String.fromCharCode(...head.subarray(from, to));
  if (ascii(4, 8) !== "ftyp") return null;
  const brand = ascii(8, 12);
  if (["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"].includes(brand))
    return "image/heic";
  if (["mif1", "msf1"].includes(brand)) return "image/heif";
  return null;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(",") + 1));
    reader.onerror = () => reject(new Error(FRIENDLY_DECODE_ERROR));
    reader.readAsDataURL(blob);
  });
}
