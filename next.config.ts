import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Apple fetches the App Site Association from this exact path, and a redirect
  // makes iOS reject it. The route itself lives at /apple-app-site-association
  // (folders starting with a dot are private in the App Router).
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/.well-known/apple-app-site-association",
          destination: "/apple-app-site-association",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  // typescript.ignoreBuildErrors intentionally removed — `tsc --noEmit` is clean
  // and must stay that way. If a build fails on types, fix the type.
};

export default nextConfig;
