/* Proxies OpenCV.js through our own origin so the scan Worker
   (public/opencv-worker.js) can load it with a real, enforceable fetch()
   timeout instead of importScripts()'s unboundable synchronous blocking
   fetch. fetch() can't be used directly against docs.opencv.org from the
   client -- that response carries no Access-Control-Allow-Origin header, so
   the browser blocks reading it cross-origin. A same-origin request has no
   such restriction; this route does the actual cross-origin fetch
   server-side, where CORS doesn't apply at all.

   No auth: this is a public, unauthenticated static library file, not
   user data -- gating it would just break the very first thing the scan
   modal does for a logged-out... though nothing here loads pre-auth today,
   there is no reason to add a check that adds risk with no benefit. */

const OPENCV_URL = 'https://docs.opencv.org/4.13.0/opencv.js';

export async function GET() {
  const upstream = await fetch(OPENCV_URL);
  if (!upstream.ok || !upstream.body) {
    return new Response('Could not fetch OpenCV.js', { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/javascript',
      // Pinned to a specific version (see OPENCV_URL) -- this response's
      // bytes never change, so it's safe to cache for a long time both at
      // Cloudflare's edge and in the browser.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
