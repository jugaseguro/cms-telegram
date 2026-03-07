import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      ],
    },
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.telegram.org",
        pathname: "/file/**",
      },
      {
        protocol: "https",
        hostname: "yajuotgblqzybzboqbkc.supabase.co",
        pathname: "/storage/**",
      },
    ],
  },
};

export default nextConfig;
