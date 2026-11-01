import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // typescript.ignoreBuildErrors intentionally removed — `tsc --noEmit` is clean
  // and must stay that way. If a build fails on types, fix the type.
};

export default nextConfig;
