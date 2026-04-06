/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Cloudflare Pages with @cloudflare/next-on-pages
  experimental: {
    runtime: 'edge',
  },
}

module.exports = nextConfig
