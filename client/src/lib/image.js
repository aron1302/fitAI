// Downscale a photo (File/Blob from an <input type="file">) into a small
// base64 JPEG suitable for an AI-analysis upload. Phone cameras produce
// 3-10 MB originals; ~1024px JPEG keeps every food identifiable at ~100-300 KB,
// well under the server's body cap and quick to upload on mobile data.
export function fileToInlineImage(file, maxDim = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        // Re-encoding to JPEG also strips EXIF metadata (GPS etc.) — only the
        // pixels leave the device.
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve({
          mimeType: "image/jpeg",
          data: dataUrl.slice(dataUrl.indexOf(",") + 1),
          previewUrl: dataUrl,
        });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image — try a different photo"));
    };
    img.src = url;
  });
}
