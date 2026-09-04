/* Client-side only -- normalises a picked or captured photo (JPEG off a
   phone camera, whatever a gallery hands back) into the plain PNG blob
   createSignature() requires, same container format as a drawn or typed
   signature. Caps the longest edge so a 12MP camera photo doesn't turn into
   a multi-megabyte "signature".

   Also strips the paper: a photo of a signature is opaque everywhere,
   paper included, which is why a signature made this way used to paste
   onto a document as a white rectangle instead of just the ink. Any pixel
   close to white becomes transparent, with a soft falloff at the threshold
   so the ink's edges don't come out jagged. Plain pixel math on a canvas,
   not a real background-removal model -- works well for the common case
   (dark ink on plain white/light paper), not for a photo with shadows,
   colored paper, or a background that isn't actually white. */
function removeNearWhiteBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const FULLY_TRANSPARENT_AT = 235; // all channels >= this -> treated as paper
  const FULLY_OPAQUE_BELOW = 195;   // all channels <= this -> untouched ink

  for (let i = 0; i < data.length; i += 4) {
    const brightness = Math.min(data[i], data[i + 1], data[i + 2]);
    if (brightness >= FULLY_TRANSPARENT_AT) {
      data[i + 3] = 0;
    } else if (brightness > FULLY_OPAQUE_BELOW) {
      const t = (brightness - FULLY_OPAQUE_BELOW) / (FULLY_TRANSPARENT_AT - FULLY_OPAQUE_BELOW);
      data[i + 3] = Math.round(data[i + 3] * (1 - t));
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

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

  removeNearWhiteBackground(ctx, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png');
  });
}
