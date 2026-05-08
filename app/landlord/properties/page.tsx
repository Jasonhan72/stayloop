'use client'
// -----------------------------------------------------------------------------
// /landlord/properties — canonical landlord listings management URL
// -----------------------------------------------------------------------------
// Sprint A.1 (Step 2 of nav reorg): the landlord URL surface is being
// unified under /landlord/* (matching /tenant/* and /agent/*).
//
// /landlord/properties is the new canonical URL. Old /dashboard/portfolio
// remains a working alias (no redirect — both serve the same content via
// the re-exported component). Future PR can flip the relationship and
// add a 301 from /dashboard/portfolio → /landlord/properties.
//
// The actual page component lives at app/dashboard/portfolio/page.tsx.
// This file is a thin re-export so the URL renders without code duplication.
// -----------------------------------------------------------------------------

export { default } from '@/app/dashboard/portfolio/page'
