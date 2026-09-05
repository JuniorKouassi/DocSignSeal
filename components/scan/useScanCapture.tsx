'use client';

import { useRef, useState } from 'react';
import { ScanCaptureModal } from './ScanCaptureModal';

type Request = { mode: 'camera' | 'image'; file?: File };

/* Promise-based wrapper around ScanCaptureModal so a caller can just
   `const blob = await scanCamera(); if (!blob) return;` instead of managing
   open/close state and a confirm/cancel callback pair itself. Renders
   nothing of its own -- `modal` is JSX the caller places in its own tree,
   present only while a scan is actually in progress. */
export function useScanCapture() {
  const [request, setRequest] = useState<Request | null>(null);
  const resolverRef = useRef<((blob: Blob | null) => void) | null>(null);

  function scanCamera(): Promise<Blob | null> {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setRequest({ mode: 'camera' });
    });
  }

  function scanImage(file: File): Promise<Blob | null> {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setRequest({ mode: 'image', file });
    });
  }

  function handleConfirm(blob: Blob) {
    setRequest(null);
    resolverRef.current?.(blob);
    resolverRef.current = null;
  }

  function handleCancel() {
    setRequest(null);
    resolverRef.current?.(null);
    resolverRef.current = null;
  }

  const modal = request
    ? <ScanCaptureModal mode={request.mode} file={request.file} onConfirm={handleConfirm} onCancel={handleCancel} />
    : null;

  return { scanCamera, scanImage, modal };
}
