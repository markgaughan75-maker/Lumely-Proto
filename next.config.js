/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Ensure the Node runtime for API routes on Vercel
    forceSwcTransforms: true,
  },
};

module.exports = nextConfig;
