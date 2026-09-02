import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @napi-rs/canvas ships prebuilt native binaries per platform, and
  // pdfjs-dist's Node code path expects to load its own files at runtime --
  // both need to stay real Node dependencies rather than get bundled.
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
};

export default nextConfig;
