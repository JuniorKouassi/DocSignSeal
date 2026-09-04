/* Client-side only -- normalises a picked or captured photo (JPEG off a
   phone camera, whatever a gallery hands back) into the plain PNG blob
   createSignature() requires, same container format as a drawn or typed
   signature. Caps the longest edge so a 12MP camera photo doesn't turn into
   a multi-megabyte "signature". No background removal (see
   lib/signatures/actions.ts's comment) -- this only re-encodes the format
   and resizes it. */
export async function pngBlobFromImageFile(file: File, maxDim = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png');
  });
}
