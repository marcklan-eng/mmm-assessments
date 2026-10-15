/** @type {import('next').NextConfig} */
const nextConfig = {
  // Assessment images and videos are served through an authenticated route,
  // so make sure Vercel bundles them with the server functions.
  outputFileTracingIncludes: {
    "/api/asset/[...path]": ["./private-assets/**/*"],
  },
};
export default nextConfig;
