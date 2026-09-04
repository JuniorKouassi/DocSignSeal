'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createSignature } from '../../lib/signatures/actions';
import { pngBlobFromImageFile } from '../../lib/signatures/toPng';

/* Shared by the mobile FAB's "From Gallery"/"Scan" pair and the desktop
   menu's single merged "Upload a photo" entry (see signatureCreateOptions
   for why desktop doesn't get its own Scan). The file input is created and
   clicked on demand rather than kept in the tree -- one function covers
   both entry points instead of a ref per button. `capture` triggers the
   device camera directly on browsers that support it; there is no way to
   draw a custom alignment-frame overlay (like the reference app's) on top
   of a plain <input type="file">, so this opens the OS camera app itself,
   not an in-page viewfinder. */
export function useCreateSignatureFromFile() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function pick(capture?: 'user' | 'environment') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.setAttribute('capture', capture);

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      setError(false);

      startTransition(async () => {
        try {
          const png = await pngBlobFromImageFile(file);
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
    };

    input.click();
  }

  return { pick, pending, error };
}
