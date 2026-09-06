/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Render Docker deployment — copies all dependencies into
  // .next/standalone so the container doesn't need node_modules at runtime.
  output: "standalone",
  images: {
    remotePatterns: [
      // Local development
      { protocol: "http",  hostname: "localhost" },
      // Render-hosted backend (production)
      { protocol: "https", hostname: "*.onrender.com" },
      // Any custom domain you add later
      { protocol: "https", hostname: "*.legalm.in" },
    ],
  },
};

module.exports = nextConfig;
