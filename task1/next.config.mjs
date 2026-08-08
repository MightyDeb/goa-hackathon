/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The studio is a static client-rendered page; only /share/[id] is dynamic.
  poweredByHeader: false,
};

export default nextConfig;
