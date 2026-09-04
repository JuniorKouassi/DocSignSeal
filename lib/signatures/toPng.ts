/* The actual implementation lives in lib/shared/imageToPng.ts -- shared with
   the stamp upload form, which needs the exact same treatment (any picked
   image, near-white background stripped, exported as PNG). Re-exported here
   so existing imports (components/signatures/useCreateSignatureFromFile.ts)
   don't need to change. */
export { pngBlobFromImageFile } from '../shared/imageToPng';
