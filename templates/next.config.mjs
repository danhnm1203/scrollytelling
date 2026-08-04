/** @type {import('next').NextConfig} */
const nextConfig = {
  // Frames are pre-encoded to webp by `open-scrollytelling frames` and served
  // straight from public/. Running them through the image optimizer again would
  // re-encode work that is already done.
  images: { unoptimized: true },
};

export default nextConfig;
