export const ALLOWED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
export const MAX_DIMENSION = 2000;
export const JPEG_QUALITY = 0.82;

export function validatePhotoFile(file) {
  const name = file?.name || "That file";
  if (!ALLOWED_PHOTO_TYPES.has(file?.type)) {
    return { valid: false, error: `${name} is not a supported photo.` };
  }
  if (!Number.isFinite(file?.size) || file.size < 1) {
    return { valid: false, error: `${name} is empty or unreadable.` };
  }
  if (file.size > MAX_SOURCE_BYTES) {
    return { valid: false, error: `${name} is larger than 20 MB.` };
  }
  return { valid: true, error: null };
}

export function buildPhotoPath({ tripSlug, id }) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tripSlug || "")) {
    throw new Error("Invalid trip slug for photo storage.");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || "")) {
    throw new Error("Invalid photo ID.");
  }
  return `${tripSlug}/${id}.jpg`;
}

async function decodeWithImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodePhoto(file) {
  if (typeof globalThis.createImageBitmap === "function") {
    try {
      return await globalThis.createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Safari can decode some camera formats through Image even when createImageBitmap cannot.
    }
  }
  return decodeWithImage(file);
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("This photo could not be compressed."))),
      "image/jpeg",
      quality,
    );
  });
}

export async function preparePhoto(file, {
  maxDimension = MAX_DIMENSION,
  quality = JPEG_QUALITY,
  maxOutputBytes = MAX_OUTPUT_BYTES,
} = {}) {
  const validation = validatePhotoFile(file);
  if (!validation.valid) throw new Error(validation.error);

  let source;
  try {
    source = await decodePhoto(file);
  } catch {
    throw new Error(`${file.name} could not be read by this browser. Try converting it to JPEG first.`);
  }

  const sourceWidth = source.width || source.naturalWidth;
  const sourceHeight = source.height || source.naturalHeight;
  if (!sourceWidth || !sourceHeight) {
    source.close?.();
    throw new Error(`${file.name} has invalid image dimensions.`);
  }

  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    source.close?.();
    throw new Error("Photo compression is unavailable in this browser.");
  }

  context.drawImage(source, 0, 0, width, height);
  source.close?.();
  const blob = await canvasToJpeg(canvas, quality);
  canvas.width = 1;
  canvas.height = 1;

  if (blob.size > maxOutputBytes) {
    throw new Error(`${file.name} is still larger than 5 MB after compression.`);
  }
  return { blob, width, height };
}
