/**
 * Resize an image on the client to at most `max` px on the long edge and
 * re-encode as JPEG. Re-encoding through a canvas also drops EXIF (incl. GPS).
 */
export async function resizeImage(file: Blob, max = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  const { width, height } = bitmap;
  const scale = Math.min(1, max / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't process images here.");
  // JPEG has no alpha: paint white first so transparent PNGs don't go black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Couldn't compress that photo. Try another one.");
  return blob;
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // fall through to <img> decoding (e.g. HEIC on some browsers fails both ways)
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error("That file doesn't look like a photo we can read. Try a JPEG or PNG.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
