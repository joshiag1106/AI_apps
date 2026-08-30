/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output bundles a minimal server with only the traced dependencies,
  // so a container or a VPS deploy does not need node_modules at runtime.
  output: 'standalone',
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};
export default nextConfig;
