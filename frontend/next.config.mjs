/** @type {import('next').NextConfig} */
const nextConfig = {
  // NestJS backend runs on :3000; Next.js dev on :5173 (set in package.json).
  // All NestJS calls go through /api/proxy/** route handlers — no CORS needed.
};

export default nextConfig;
