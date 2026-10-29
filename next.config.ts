import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  // A type error now fails the build instead of shipping (audit BLD-02).
  typescript: {
    ignoreBuildErrors: false,
  },
  // ESLint has no config in this repo yet, so a lint pass would mean nothing;
  // `npm run typecheck` and the vitest suite are the gates until it does.
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
