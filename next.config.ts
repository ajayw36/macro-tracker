import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Prisma out of the bundler so the query engine is loaded at runtime
  // (avoids Turbopack over-tracing and bundling issues on Vercel).
  serverExternalPackages: ["@prisma/client", ".prisma/client", "prisma"],
};

export default nextConfig;
