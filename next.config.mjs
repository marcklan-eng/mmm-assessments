/** @type {import('next').NextConfig} */
const nextConfig = {
  // Google's libraries load their own files at runtime, so keep them out of the bundle.
  serverExternalPackages: ["@google-cloud/firestore", "@google-cloud/storage"],
  // Assessment images and videos are served through an authenticated route,
  // so make sure they're bundled with the server functions (Vercel).
  outputFileTracingIncludes: {
    "/api/asset/[...path]": ["./private-assets/**/*"],
  },
};
export default nextConfig;
