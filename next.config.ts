import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  // A type error now fails the build instead of shipping (audit BLD-02).
  typescript: {
    ignoreBuildErrors: false,
  },
  // A lint error now fails the build too (audit BLD-02). Rules live in
  // eslint.config.mjs; warnings are capped by `npm run lint`, not here.
  eslint: {
    ignoreDuringBuilds: false,
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
