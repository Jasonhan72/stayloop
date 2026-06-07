// 2026-06-02 — Audit §11 P2 — Configure next/image for listing photos.
// Listings on Stayloop ingest images from third-party rental sites
// (realtor.ca, Zillow, StreetEasy, Royal LePage, etc.) via the
// import-listing agent. The agent extracts whatever CDN URLs the source
// page exposes, so the set of hostnames is open-ended — we can't
// hard-code every CDN. We grant next/image broad HTTPS remotePatterns
// access (any hostname, port, pathname) because:
//   1. The listing-images.ts hero-picker already filters junk URLs
//      (placeholders, gravatars, ad networks) before they reach the
//      <Image> component.
//   2. The agent extractor explicitly REJECTS svg/icon/sprite/logo
//      patterns at extraction time.
//   3. We only proxy GET image bytes — there's no SSRF surface beyond
//      what next/image already exposes to its CDN.
// If we ever tighten this to an allowlist, the canonical set is the
// list in import-listing.ts ("cdn.realtor.ca", "photos.zillowstatic.com",
// "photos.streeteasy.com") plus Supabase Storage for user-uploads.

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
        port: '',
        pathname: '/**',
      },
    ],
    // 1 week — listings rarely change photos after publish, and even if
    // they do, our cache-busting comes from new URLs in the listings.images
    // array rather than mutating the existing URL.
    minimumCacheTTL: 60 * 60 * 24 * 7,
  },
}

module.exports = nextConfig
