import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this directory. Without it, Next walks up looking
  // for lockfiles and can pick a parent directory as the root (which produces a
  // build warning and can resolve modules from the wrong place).
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
