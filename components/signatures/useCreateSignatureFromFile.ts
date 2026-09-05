'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createSignature } from '../../lib/signatures/actions';
import { pngBlobFromImageFile } from '../../lib/signatures/toPng';
import { useScanCapture } from '../scan/useScanCapture';

/* Shared by the mobile FAB's "From Gallery"/"Scan" pair and the desktop
   menu's single merged "Upload a photo" entry (see signatureCreateOptions
   for why desktop doesn't get its own Scan). `pick` covers the plain file-
   picker path (unchanged: create+click a hidden input, no modal); `pickScan`
   is the perspective-corrected camera path -- it opens `modal` (a live
   camera view with OpenCV.js detecting the document's edges, then a
   drag-to-adjust step) via useScanCapture, and only proceeds once the user
   actually confirms a result. Either path ends at the same
   pngBlobFromImageFile (resize + background removal) and createSignature
   call, so a scanned signature is indistinguishable from a picked one by
   the time it's saved. */
export function useCreateSignatureFromFile() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const { scanCamera, modal } = useScanCapture();

  function submit(blob: Blob) {
    setError(false);
    startTransition(async () => {
      try {
        const png = await pngBlobFromImageFile(blob);
        const formData = new FormData();
        formData.set('kind', 'signature');
        formData.set('file', png, 'signature.png');
        const result = await createSignature(undefined, formData);
        if (result && 'errors' in result && result.errors) {
          setError(true);
          return;
        }
        router.refresh();
      } catch {
        setError(true);
      }
    });
  }

  function pick(capture?: 'user' | 'environment') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.setAttribute('capture', capture);
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) submit(file);
    };
    input.click();
  }

  async function pickScan() {
    const blob = await scanCamera();
    if (blob) submit(blob);
  }

  return { pick, pickScan, pending, error, modal };
}
