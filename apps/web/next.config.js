/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: ["@ai-accounting/shared"],
};

module.exports = nextConfig;
