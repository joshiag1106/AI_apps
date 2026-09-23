/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output bundles a minimal server with only the traced dependencies,
  // so a container or a VPS deploy does not need node_modules at runtime.
  output: 'standalone',
  // The host also serves the production company site at "/"; this app lives under
  // its own path instead of the domain root. Must match lib/site.ts's BASE_PATH.
  basePath: '/kautilya',
  // No `images.remotePatterns`, on purpose. Feed images are plain <img> tags pointing at the
  // publisher and nothing renders through next/image, so allowing a remote host would only
  // let /_next/image fetch whatever URL it is handed and re-serve it from this domain — an
  // open image proxy. Name a specific host here if next/image is ever adopted.
};
export default nextConfig;
