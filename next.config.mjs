/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @react-pdf/renderer and docx are CJS-heavy and must not be bundled by Turbopack/webpack
  // for the server runtime; they are loaded natively inside route handlers.
  serverExternalPackages: ["@react-pdf/renderer", "docx", "unpdf"],
};

export default nextConfig;
