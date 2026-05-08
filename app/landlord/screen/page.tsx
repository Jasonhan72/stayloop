'use client'
// -----------------------------------------------------------------------------
// /landlord/screen — canonical AI screening tool URL
// -----------------------------------------------------------------------------
// Sprint A.1 (Step 2 of nav reorg): unifying landlord URLs under /landlord/*.
// /screen was a top-level route — now exposed as /landlord/screen for
// consistency with /landlord/dashboard, /landlord/properties, etc.
//
// Page component lives at app/screen/page.tsx (large file, 3000+ LOC, not
// duplicated). Old /screen still works.
// -----------------------------------------------------------------------------

export { default } from '@/app/screen/page'
