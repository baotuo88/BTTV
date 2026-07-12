import type { NextConfig } from "next";

// Docker 部署时通过 BUILD_TARGET=docker 环境变量启用 standalone 输出；
// Vercel 部署默认不需要 standalone，避免构建产物翻倍。
const isDockerBuild = process.env.BUILD_TARGET === "docker";

const nextConfig: NextConfig = {
  ...(isDockerBuild ? { output: "standalone" as const } : {}),

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
    unoptimized: true,
  },
};

export default nextConfig;
