import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Allow LAN access during local development (phone/tablet/other machine on same network).
  allowedDevOrigins: [
    "localhost",
    "arindams-macbook-air.local",
    "*.local",
  ],
  // Fix Turbopack workspace root detection when a parent directory has a lockfile.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
