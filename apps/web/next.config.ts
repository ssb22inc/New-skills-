import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Trust pages must be light: no client-side data fetching, RSC only.
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // Workspace packages use NodeNext ESM (.js specifiers for .ts files);
  // webpack needs the alias, and we opt out of Turbopack for it.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.js', '.ts'],
      '.jsx': ['.jsx', '.tsx'],
    };
    return config;
  },
};

export default nextConfig;
