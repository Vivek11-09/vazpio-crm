import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is per-user and behind login, so nothing is prerendered or cached.
  // Import uploads (Excel / CSV) go through a Server Action.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  serverExternalPackages: ["exceljs"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
