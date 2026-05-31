import path from "node:path";
import { fileURLToPath } from "node:url";

const portalRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: portalRoot,
  },
  typedRoutes: true,
};

export default nextConfig;
