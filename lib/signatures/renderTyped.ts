/* Client-side only -- rasterises a typed signature (font, weight, style,
   ink colour) into the same transparent-PNG shape createSignature() expects
   from a drawn one. Canvas is sized to the actual text metrics rather than
   a fixed box, so "JK" and "Jean-Baptiste Kouassi" don't share one crop. */
export async function pngFromTypedSignature(opts: {
  text: string;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  color: string;
}): Promise<Blob> {
  const fontSize = 88;
  const font = `${opts.italic ? 'italic ' : ''}${opts.bold ? '700' : '400'} ${fontSize}px ${opts.fontFamily}`;

  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('Canvas 2D context unavailable');
  measure.font = font;
  const metrics = measure.measureText(opts.text);

  const paddingX = fontSize * 0.3;
  const paddingY = fontSize * 0.4;
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2;
  const width = Math.max(1, Math.ceil(metrics.width + paddingX * 2));
  const height = Math.max(1, Math.ceil(ascent + descent + paddingY * 2));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.font = font;
  ctx.fillStyle = opts.color;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(opts.text, paddingX, paddingY + ascent);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png');
  });
}
