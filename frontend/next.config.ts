import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow LAN access during local development (phone/tablet/other machine on same network).
  allowedDevOrigins: [
    "localhost",
    "arindams-macbook-air.local",
    "*.local",
  ],
};

export default nextConfig;
